import json
import os
import shutil
import sqlite3
import subprocess
import sys
import time
import urllib.parse
import urllib.request
import uuid
import zipfile
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


def seed_page(database, upload_root, project_id):
    from PIL import Image, ImageDraw

    page_id = str(uuid.uuid4())
    relative_path = f"{project_id}/pages/{page_id}_v1.png"
    image_path = upload_root / relative_path
    image_path.parent.mkdir(parents=True, exist_ok=True)
    image = Image.new("RGB", (1280, 720), "#f8fafc")
    draw = ImageDraw.Draw(image)
    draw.rectangle((80, 80, 1200, 640), outline="#111827", width=8)
    draw.text((140, 160), "Packaged PPT/PDF smoke", fill="#111827")
    image.save(image_path)
    now = time.strftime("%Y-%m-%d %H:%M:%S")
    values = {
        "id": page_id,
        "project_id": project_id,
        "order_index": 0,
        "part": "Packaged smoke",
        "outline_content": json.dumps({"title": "Packaged PPT export"}, ensure_ascii=False),
        "description_content": json.dumps({"body": "Seed page for packaged PPT/PDF export."}, ensure_ascii=False),
        "generated_image_path": relative_path,
        "cached_image_path": None,
        "status": "COMPLETED",
        "created_at": now,
        "updated_at": now,
        "narration_locked": 0,
        "narration_revision": 0,
    }
    with sqlite3.connect(database) as connection:
        columns = [row[1] for row in connection.execute("PRAGMA table_info(pages)").fetchall()]
        insert_columns = [column for column in columns if column in values]
        placeholders = ",".join("?" for _ in insert_columns)
        connection.execute(
            f"INSERT INTO pages ({','.join(insert_columns)}) VALUES ({placeholders})",
            [values[column] for column in insert_columns],
        )
    return page_id, relative_path


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
            "idea_prompt": "packaged ppt pdf export",
            "initial_workspace": "ppt",
        }, timeout=30)
        assert status in (200, 201, 202), created
        project_id = created["data"]["project_id"]
        task = wait_task(base_url, project_id, created["data"]["task_id"])
        assert task["status"] == "COMPLETED", task
        page_id, _relative = seed_page(database, upload_root, project_id)

        outputs = {}
        for export_format in ("pptx", "pdf"):
            filename = f"packaged-ppt-smoke.{export_format}"
            status, payload = request_json(
                base_url,
                f"/api/projects/{project_id}/export/{export_format}?filename={urllib.parse.quote(filename)}",
                timeout=60,
            )
            assert status == 200, payload
            output_path = upload_root / project_id / "exports" / filename
            assert output_path.exists() and output_path.stat().st_size > 0, str(output_path)
            if export_format == "pptx":
                with zipfile.ZipFile(output_path) as package:
                    names = set(package.namelist())
                assert {"[Content_Types].xml", "ppt/presentation.xml"} <= names, names
            else:
                assert output_path.read_bytes().startswith(b"%PDF-"), str(output_path)
            outputs[export_format] = {
                "filename": filename,
                "size": output_path.stat().st_size,
                "download_url": payload["data"]["download_url"],
            }

        print(json.dumps({
            "project_id": project_id,
            "page_id": page_id,
            "outputs": outputs,
            "database": str(database),
        }, ensure_ascii=False))
    finally:
        process.terminate()
        try:
            process.wait(timeout=15)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=15)
