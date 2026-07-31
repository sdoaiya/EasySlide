import json
import os
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path


backend = Path(sys.argv[1]).resolve()
work_root = Path(sys.argv[2]).resolve()
port = int(sys.argv[3])

if work_root.exists():
    shutil.rmtree(work_root)
work_root.mkdir(parents=True)


def request_json(base_url, path, method="GET", body=None, timeout=10):
    data = None if body is None else json.dumps(body).encode("utf-8")
    request = urllib.request.Request(
        f"{base_url}{path}",
        data=data,
        headers={"Content-Type": "application/json"},
        method=method,
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return response.status, json.loads(response.read().decode("utf-8"))


env = os.environ.copy()
env.update({
    "FLASK_ENV": "production",
    "BACKEND_PORT": str(port),
    "DATABASE_PATH": str(work_root / "database.db"),
    "UPLOAD_FOLDER": str(work_root / "uploads"),
    "EXPORT_FOLDER": str(work_root / "exports"),
    "CONTENT_PROJECT_CUTOVER": "true",
    "EASYSLIDE_BOOTSTRAP_SETTINGS_PATH": "",
    "FISH_AUDIO_API_KEY": "test-key",
    "FISH_AUDIO_API_BASE": "http://127.0.0.1:9",
    "FISH_AUDIO_TTS_TOTAL_TIMEOUT": "3",
})

log_path = work_root / "backend.log"
with log_path.open("w", encoding="utf-8") as log_file:
    process = subprocess.Popen(
        [str(backend)], cwd=backend.parent, env=env,
        stdout=log_file, stderr=subprocess.STDOUT, text=True,
    )
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

        status, created = request_json(base_url, "/api/projects", "POST", {
            "creation_type": "idea",
            "idea_prompt": "packaged podcast timeout",
            "initial_workspace": "podcast",
        }, timeout=30)
        assert status in (200, 201, 202), created
        project_id = created["data"]["project_id"]

        deadline = time.time() + 60
        document = None
        while time.time() < deadline:
            _, summary = request_json(base_url, f"/api/content-projects/{project_id}", timeout=10)
            podcast = next(item for item in summary["data"]["workspaces"] if item["kind"] == "podcast")
            if podcast.get("document") and podcast["document"].get("speakers"):
                document = podcast["document"]
                break
            time.sleep(1)
        assert document, "podcast workspace did not initialize"

        document["segments"] = [{
            "segment_id": "segment.1",
            "speaker_id": document["speakers"][0]["speaker_id"],
            "text": "打包版播客导出超时冒烟。",
            "locked": False,
            "audio_cues": [],
        }]
        status, payload = request_json(
            base_url,
            f"/api/content-projects/{project_id}/workspaces/podcast",
            "PUT",
            {"base_revision": podcast["revision"], "document": document},
            timeout=30,
        )
        assert status == 200, payload

        status, payload = request_json(
            base_url,
            f"/api/content-projects/{project_id}/workspaces/podcast/export",
            "POST",
            {"filename": "packaged-podcast-timeout"},
            timeout=30,
        )
        assert status == 202, payload
        task_id = payload["data"]["task_id"]

        deadline = time.time() + 30
        last = None
        while time.time() < deadline:
            _, task = request_json(base_url, f"/api/projects/{project_id}/tasks/{task_id}", timeout=10)
            last = task["data"]
            if last["status"] == "FAILED":
                break
            time.sleep(0.5)
        assert last and last["status"] == "FAILED", last
        assert "Fish Audio 播客合成超过 3 秒未完成" in (last.get("error_message") or ""), last
        print(json.dumps({
            "project_id": project_id,
            "task_id": task_id,
            "status": last["status"],
            "error_message": last.get("error_message"),
            "current_step": last.get("current_step"),
            "database": str(work_root / "database.db"),
        }, ensure_ascii=False))
    finally:
        process.terminate()
        try:
            process.wait(timeout=15)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=15)
