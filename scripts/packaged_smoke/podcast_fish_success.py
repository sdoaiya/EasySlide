import json
import os
import shutil
import subprocess
import sys
import time
import urllib.request
from pathlib import Path


REQUIRED_ENV = ("FISH_AUDIO_API_KEY", "FISH_AUDIO_VOICE_HOST", "FISH_AUDIO_VOICE_GUEST")


backend = Path(sys.argv[1]).resolve()
work_root = Path(sys.argv[2]).resolve()
port = int(sys.argv[3])


def require_env():
    missing = [name for name in REQUIRED_ENV if not os.environ.get(name)]
    if missing:
        print(json.dumps({"status": "skipped", "missing_env": missing}, ensure_ascii=False))
        raise SystemExit(2)


def request_json(base_url, path, method="GET", body=None, timeout=30):
    data = None if body is None else json.dumps(body).encode("utf-8")
    request = urllib.request.Request(
        f"{base_url}{path}",
        data=data,
        headers={"Content-Type": "application/json"},
        method=method,
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return response.status, json.loads(response.read().decode("utf-8"))


def wait_task(base_url, project_id, task_id, timeout=600):
    deadline = time.time() + timeout
    last = None
    while time.time() < deadline:
        _, payload = request_json(base_url, f"/api/projects/{project_id}/tasks/{task_id}", timeout=10)
        last = payload["data"]
        if last["status"] in {"COMPLETED", "FAILED", "PAUSED"}:
            return last
        time.sleep(1)
    raise AssertionError(last)


def update_podcast_document(base_url, project_id, *, dialogue):
    deadline = time.time() + 90
    while time.time() < deadline:
        _, summary = request_json(base_url, f"/api/content-projects/{project_id}", timeout=10)
        podcast = next(item for item in summary["data"]["workspaces"] if item["kind"] == "podcast")
        document = podcast.get("document")
        if document and document.get("speakers"):
            break
        time.sleep(1)
    else:
        raise AssertionError("podcast workspace did not initialize")

    host_voice = os.environ["FISH_AUDIO_VOICE_HOST"]
    guest_voice = os.environ["FISH_AUDIO_VOICE_GUEST"]
    if dialogue:
        document["format"] = "dialogue"
        document["speakers"] = [
            {"speaker_id": "host", "name": "主持人", "voice_ref": host_voice},
            {"speaker_id": "guest", "name": "嘉宾", "voice_ref": guest_voice},
        ]
        document["segments"] = [
            {"segment_id": "segment.1", "speaker_id": "host", "text": "欢迎收听 EasySlide 多人播客验收。", "locked": False, "audio_cues": []},
            {"segment_id": "segment.2", "speaker_id": "guest", "text": "这里验证 Fish Audio 多角色导出和旁白切换。", "locked": False, "audio_cues": []},
        ]
    else:
        document["format"] = "single"
        document["speakers"] = [{"speaker_id": "host", "name": "主持人", "voice_ref": host_voice}]
        document["segments"] = [
            {"segment_id": "segment.1", "speaker_id": "host", "text": "这是 EasySlide 单人播客 Fish Audio 成功导出验收。", "locked": False, "audio_cues": []},
        ]

    status, payload = request_json(
        base_url,
        f"/api/content-projects/{project_id}/workspaces/podcast",
        "PUT",
        {"base_revision": podcast["revision"], "document": document},
    )
    assert status == 200, payload


def validate_media(path):
    completed = subprocess.run([
        "python", "scripts/validate_media_artifacts.py", str(path),
    ], cwd=Path(__file__).resolve().parents[2], capture_output=True, text=True, check=True)
    return json.loads(completed.stdout)["media"][0]


def export_audio(base_url, upload_root, project_id, stem, fmt):
    status, payload = request_json(
        base_url,
        f"/api/content-projects/{project_id}/workspaces/podcast/export",
        "POST",
        {"filename": stem, "format": fmt},
    )
    assert status == 202, payload
    task = wait_task(base_url, project_id, payload["data"]["task_id"])
    assert task["status"] == "COMPLETED", task
    output = upload_root / project_id / "exports" / f"{stem}.{fmt}"
    transcript = output.with_suffix(".transcript.json")
    cover = output.with_suffix(".cover.json")
    assert output.exists(), str(output)
    assert transcript.exists(), str(transcript)
    assert cover.exists(), str(cover)
    media = validate_media(output)
    return {
        "task_id": task["task_id"],
        "output": str(output),
        "transcript": str(transcript),
        "cover": str(cover),
        "media": media,
    }


def run_case(base_url, upload_root, *, dialogue):
    status, created = request_json(base_url, "/api/projects", "POST", {
        "creation_type": "idea",
        "idea_prompt": "packaged podcast fish success dialogue" if dialogue else "packaged podcast fish success single",
        "initial_workspace": "podcast",
    })
    assert status in (200, 201, 202), created
    project_id = created["data"]["project_id"]
    init_task = wait_task(base_url, project_id, created["data"]["task_id"])
    assert init_task["status"] == "COMPLETED", init_task
    update_podcast_document(base_url, project_id, dialogue=dialogue)
    prefix = "dialogue" if dialogue else "single"
    return {
        "project_id": project_id,
        "mp3": export_audio(base_url, upload_root, project_id, f"{prefix}-fish-success", "mp3"),
        "wav": export_audio(base_url, upload_root, project_id, f"{prefix}-fish-success", "wav"),
    }


def main():
    require_env()
    if work_root.exists():
        shutil.rmtree(work_root)
    work_root.mkdir(parents=True)
    upload_root = work_root / "uploads"
    env = os.environ.copy()
    env.update({
        "FLASK_ENV": "production",
        "BACKEND_PORT": str(port),
        "DATABASE_PATH": str(work_root / "database.db"),
        "UPLOAD_FOLDER": str(upload_root),
        "EXPORT_FOLDER": str(work_root / "exports"),
        "CONTENT_PROJECT_CUTOVER": "true",
        "EASYSLIDE_BOOTSTRAP_SETTINGS_PATH": "",
    })
    log_path = work_root / "backend.log"
    with log_path.open("w", encoding="utf-8") as log_file:
        process = subprocess.Popen([str(backend)], cwd=backend.parent, env=env, stdout=log_file, stderr=subprocess.STDOUT, text=True)
        try:
            base_url = f"http://127.0.0.1:{port}"
            deadline = time.time() + 120
            while time.time() < deadline:
                if process.poll() is not None:
                    raise RuntimeError(log_path.read_text(encoding="utf-8", errors="replace")[-4000:])
                try:
                    with urllib.request.urlopen(f"{base_url}/health", timeout=2) as response:
                        if response.status == 200:
                            break
                except Exception:
                    time.sleep(0.5)
            else:
                raise RuntimeError("packaged backend did not become healthy")
            result = {
                "single": run_case(base_url, upload_root, dialogue=False),
                "dialogue": run_case(base_url, upload_root, dialogue=True),
            }
            summary_path = work_root / "fish-success-acceptance.json"
            summary_path.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
            result["acceptance_summary"] = str(summary_path)
            print(json.dumps(result, ensure_ascii=False))
        finally:
            process.terminate()
            try:
                process.wait(timeout=15)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=15)


if __name__ == "__main__":
    main()
