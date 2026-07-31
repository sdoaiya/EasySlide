import json
import os
import shutil
import sqlite3
import subprocess
import sys
import time
import urllib.request
import uuid
from pathlib import Path


backend = Path(sys.argv[1]).resolve()
work_root = Path(sys.argv[2]).resolve()
port = int(sys.argv[3])

if work_root.exists():
    shutil.rmtree(work_root)
work_root.mkdir(parents=True)


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


def multipart(fields, files, boundary="----easyslide-smoke-boundary"):
    chunks = []
    for name, value in fields.items():
        chunks.extend([
            f"--{boundary}\r\n".encode(),
            f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode(),
            str(value).encode(),
            b"\r\n",
        ])
    for name, (filename, content, content_type) in files.items():
        chunks.extend([
            f"--{boundary}\r\n".encode(),
            f'Content-Disposition: form-data; name="{name}"; filename="{filename}"\r\n'.encode(),
            f"Content-Type: {content_type}\r\n\r\n".encode(),
            content,
            b"\r\n",
        ])
    chunks.append(f"--{boundary}--\r\n".encode())
    return b"".join(chunks), f"multipart/form-data; boundary={boundary}"


def post_multipart(base_url, path, fields, files, timeout=30):
    data, content_type = multipart(fields, files)
    request = urllib.request.Request(
        f"{base_url}{path}",
        data=data,
        headers={"Content-Type": content_type},
        method="POST",
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


def seed_page(database, project_id):
    page_id = str(uuid.uuid4())
    now = time.strftime("%Y-%m-%d %H:%M:%S")
    values = {
        "id": page_id,
        "project_id": project_id,
        "order_index": 0,
        "part": "Pause resume smoke",
        "outline_content": json.dumps({"title": "Pause resume"}, ensure_ascii=False),
        "description_content": json.dumps({"body": "Native export pause/resume smoke."}, ensure_ascii=False),
        "status": "NATIVE_GENERATED",
        "created_at": now,
        "updated_at": now,
        "narration_locked": 0,
        "narration_revision": 0,
        "native_layout": "core01",
        "native_props": json.dumps({"title": "Pause resume"}, ensure_ascii=False),
    }
    with sqlite3.connect(database) as connection:
        columns = [row[1] for row in connection.execute("PRAGMA table_info(pages)").fetchall()]
        insert_columns = [column for column in columns if column in values]
        placeholders = ",".join("?" for _ in insert_columns)
        connection.execute(
            f"INSERT INTO pages ({','.join(insert_columns)}) VALUES ({placeholders})",
            [values[column] for column in insert_columns],
        )
    return page_id


env = os.environ.copy()
database = work_root / "database.db"
upload_root = work_root / "uploads"
env.update({
    "FLASK_ENV": "production",
    "BACKEND_PORT": str(port),
    "DATABASE_PATH": str(database),
    "UPLOAD_FOLDER": str(upload_root),
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
            "idea_prompt": "packaged pause resume",
            "initial_workspace": "ppt",
            "render_mode": "native",
        }, timeout=30)
        assert status in (200, 201, 202), created
        project_id = created["data"]["project_id"]
        init_task = wait_task(base_url, project_id, created["data"]["task_id"])
        assert init_task["status"] == "COMPLETED", init_task
        page_id = seed_page(database, project_id)

        status, task = request_json(
            base_url,
            f"/api/projects/{project_id}/export/native-pptx",
            "POST",
            {"format": "pdf"},
            timeout=30,
        )
        assert status == 202, task
        task_id = task["data"]["task_id"]
        assert task["data"]["status"] == "PENDING", task

        status, paused = request_json(base_url, "/api/projects/tasks/pause-active-exports", "POST")
        assert status == 200 and paused["data"]["paused_count"] >= 1, paused
        paused_task = wait_task(base_url, project_id, task_id, timeout=5)
        assert paused_task["status"] == "PAUSED", paused_task

        status, resumed = request_json(
            base_url,
            f"/api/projects/{project_id}/tasks/{task_id}/resume",
            "POST",
            timeout=30,
        )
        assert status == 200, resumed
        assert resumed["data"]["status"] == "PENDING", resumed
        assert resumed["data"]["progress"]["current_step"] == "等待重新开始导出", resumed

        status, completed = post_multipart(
            base_url,
            f"/api/projects/{project_id}/export/native-pptx/{task_id}/complete",
            {
                "filename": "packaged-resumed-native.pdf",
                "report": json.dumps({"slideCount": 1, "warnings": []}),
            },
            {
                "file": ("packaged-resumed-native.pdf", b"%PDF-1.4\n% smoke\n%%EOF\n", "application/pdf"),
            },
        )
        assert status == 200, completed
        assert completed["data"]["status"] == "COMPLETED", completed
        output_path = upload_root / project_id / "exports" / "packaged-resumed-native.pdf"
        assert output_path.exists() and output_path.read_bytes().startswith(b"%PDF-"), str(output_path)

        print(json.dumps({
            "project_id": project_id,
            "page_id": page_id,
            "task_id": task_id,
            "paused_count": paused["data"]["paused_count"],
            "status": completed["data"]["status"],
            "output_size": output_path.stat().st_size,
            "database": str(database),
        }, ensure_ascii=False))
    finally:
        process.terminate()
        try:
            process.wait(timeout=15)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=15)
