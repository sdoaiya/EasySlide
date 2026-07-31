import json
import os
import shutil
import subprocess
import sys
import time
import urllib.request
from pathlib import Path


backend = Path(sys.argv[1]).resolve()
work_root = Path(sys.argv[2]).resolve()
port = int(sys.argv[3])

if work_root.exists():
    shutil.rmtree(work_root)
work_root.mkdir(parents=True)


def request_json(base_url, path, method="GET", body=None, timeout=20):
    data = None if body is None else json.dumps(body).encode("utf-8")
    request = urllib.request.Request(
        f"{base_url}{path}",
        data=data,
        headers={"Content-Type": "application/json"},
        method=method,
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return response.status, json.loads(response.read().decode("utf-8"))


def wait_task(base_url, project_id, task_id, timeout=120):
    deadline = time.time() + timeout
    last = None
    while time.time() < deadline:
        _, payload = request_json(base_url, f"/api/projects/{project_id}/tasks/{task_id}", timeout=10)
        last = payload["data"]
        if last["status"] in {"COMPLETED", "FAILED", "PAUSED"}:
            return last
        time.sleep(0.5)
    raise AssertionError(last)


env = os.environ.copy()
env.update({
    "FLASK_ENV": "production",
    "BACKEND_PORT": str(port),
    "DATABASE_PATH": str(work_root / "database.db"),
    "UPLOAD_FOLDER": str(work_root / "uploads"),
    "EXPORT_FOLDER": str(work_root / "exports"),
    "CONTENT_PROJECT_CUTOVER": "true",
    "EASYSLIDE_BOOTSTRAP_SETTINGS_PATH": "",
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
            "idea_prompt": "packaged workspace sync",
            "initial_workspace": "ppt",
        }, timeout=30)
        assert status in (200, 201, 202), created
        project_id = created["data"]["project_id"]
        init_task = wait_task(base_url, project_id, created["data"]["task_id"])
        assert init_task["status"] == "COMPLETED", init_task

        _, summary = request_json(base_url, f"/api/content-projects/{project_id}", timeout=10)
        spine_revision = summary["data"]["spine"]["revision"]
        assert request_json(
            base_url,
            f"/api/content-projects/{project_id}/spine/confirm",
            "POST",
            {"expected_revision": spine_revision},
        )[0] == 200

        initialized = {}
        for kind in ("video", "podcast"):
            status, payload = request_json(
                base_url,
                f"/api/content-projects/{project_id}/workspaces/{kind}/initialize",
                "POST",
                {"settings": {}},
                timeout=30,
            )
            assert status == 202, payload
            task = wait_task(base_url, project_id, payload["data"]["task_id"])
            assert task["status"] == "COMPLETED", task
            initialized[kind] = task["task_id"]

        _, summary = request_json(base_url, f"/api/content-projects/{project_id}", timeout=10)
        data = summary["data"]
        workspaces = {item["kind"]: item for item in data["workspaces"]}
        assert {kind: workspaces[kind]["state"] for kind in ("ppt", "video", "podcast")} == {
            "ppt": "draft",
            "video": "draft",
            "podcast": "draft",
        }

        spine_before = data["spine"]["document"]["topic"]["value"]
        status, proposal = request_json(
            base_url,
            f"/api/content-projects/{project_id}/sync-proposals",
            "POST",
            {
                "source_kind": "video",
                "target_kind": "spine",
                "source_revision": workspaces["video"]["revision"],
                "target_base_revision": data["spine"]["revision"],
                "reason": "packaged smoke video to spine",
                "diff": {
                    "schema_version": 1,
                    "items": [{
                        "item_id": "sync.video_to_spine.topic",
                        "path": "/topic/value",
                        "operation": "replace",
                        "change_type": "content",
                        "before": spine_before,
                        "after": "packaged synced topic",
                    }],
                },
            },
            timeout=30,
        )
        assert status == 201, proposal
        status, applied = request_json(
            base_url,
            f"/api/content-projects/{project_id}/sync-proposals/{proposal['data']['id']}/apply",
            "POST",
            {"base_revision": data["spine"]["revision"], "selected_item_ids": ["sync.video_to_spine.topic"]},
            timeout=30,
        )
        assert status == 200, applied
        assert applied["data"]["proposal"]["status"] == "applied", applied

        _, summary = request_json(base_url, f"/api/content-projects/{project_id}", timeout=10)
        data = summary["data"]
        podcast = next(item for item in data["workspaces"] if item["kind"] == "podcast")
        podcast_title = podcast["document"]["title"]
        status, proposal = request_json(
            base_url,
            f"/api/content-projects/{project_id}/sync-proposals",
            "POST",
            {
                "source_kind": "spine",
                "target_kind": "podcast",
                "source_revision": data["spine"]["revision"],
                "target_base_revision": podcast["revision"],
                "reason": "packaged smoke spine to podcast",
                "diff": {
                    "schema_version": 1,
                    "items": [{
                        "item_id": "sync.spine_to_podcast.title",
                        "path": "/title",
                        "operation": "replace",
                        "change_type": "content",
                        "before": podcast_title,
                        "after": "packaged synced podcast",
                    }],
                },
            },
            timeout=30,
        )
        assert status == 201, proposal
        status, applied = request_json(
            base_url,
            f"/api/content-projects/{project_id}/sync-proposals/{proposal['data']['id']}/apply",
            "POST",
            {"base_revision": podcast["revision"], "selected_item_ids": ["sync.spine_to_podcast.title"]},
            timeout=30,
        )
        assert status == 200, applied
        assert applied["data"]["workspace"]["document"]["title"] == "packaged synced podcast", applied

        print(json.dumps({
            "project_id": project_id,
            "initialized": initialized,
            "spine_revision": applied["data"]["proposal"]["source_revision"],
            "podcast_revision": applied["data"]["workspace"]["revision"],
            "database": str(work_root / "database.db"),
        }, ensure_ascii=False))
    finally:
        process.terminate()
        try:
            process.wait(timeout=15)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=15)
