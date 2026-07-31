from unittest.mock import patch

from conftest import assert_success_response
from models import db, Page, Project, Task


def test_export_editable_pptx_endpoint_reports_recursive_analysis_method(client):
    project = Project(id="project-source-editable", creation_type="idea", idea_prompt="project-source-editable")
    page = Page(
        project_id=project.id,
        order_index=0,
        generated_image_path="pages/slide.png",
    )
    db.session.add(project)
    db.session.add(page)
    db.session.commit()

    with patch("services.task_manager.task_manager.submit_task") as submit_task:
        response = client.post(f"/api/projects/{project.id}/export/editable-pptx", json={})

    data = assert_success_response(response)

    assert data["data"]["method"] == "recursive_analysis"
    assert submit_task.called
    task = Task.query.get(data["data"]["task_id"])
    resume = task.get_progress()["_resume"]
    assert resume["kind"] == "editable-pptx"
    assert resume["kwargs"]["project_id"] == project.id
