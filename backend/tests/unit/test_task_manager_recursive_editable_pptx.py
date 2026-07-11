from PIL import Image
from unittest.mock import patch

from models import Page, Project, Task, db
from services import task_manager
from services.export_service import ExportError, ExportWarnings
from services.file_service import FileService


def test_export_editable_task_uses_recursive_analysis_builder(client, app):
    project = Project(id="task-recursive-editable", creation_type="idea", export_high_fidelity_editable=True)
    page = Page(project_id=project.id, order_index=0)
    page.set_outline_content({"title": "后台导出", "points": ["写入文件", "文本可编辑"]})
    page.set_description_content({"text": "任务完成后可以下载。"})
    task = Task(project_id=project.id, task_type="EXPORT_EDITABLE_PPTX", status="PENDING")
    db.session.add_all([project, page, task])
    db.session.commit()

    file_service = FileService(app.config["UPLOAD_FOLDER"])
    page.generated_image_path = file_service.save_generated_image(
        Image.new("RGB", (320, 180), "white"),
        project.id,
        page.id,
    )
    db.session.commit()

    with patch(
        "services.export_service.ExportService.create_editable_pptx_with_recursive_analysis",
        return_value=(None, ExportWarnings()),
    ) as create_pptx:
        task_manager.export_editable_pptx_with_recursive_analysis_task(
            task.id,
            project.id,
            "recursive-task.pptx",
            file_service,
            app=app,
        )

    db.session.refresh(task)
    progress = task.get_progress()
    output_path = file_service.get_absolute_path(f"{project.id}/exports/recursive-task.pptx")
    assert task.status == "COMPLETED"
    assert progress["method"] == "recursive_analysis"
    assert progress["download_url"] == f"/files/{project.id}/exports/recursive-task.pptx"
    assert create_pptx.call_args.kwargs["output_file"] == output_path
    assert create_pptx.call_args.kwargs["image_paths"]
    assert create_pptx.call_args.kwargs["export_extractor_method"] == "hybrid"
    assert create_pptx.call_args.kwargs["export_high_fidelity_editable"] is True


def test_export_editable_task_retries_without_inpaint_when_layout_analysis_fails(client, app):
    project = Project(id="task-recursive-no-inpaint-fallback", creation_type="idea")
    page = Page(project_id=project.id, order_index=0)
    task = Task(project_id=project.id, task_type="EXPORT_EDITABLE_PPTX", status="PENDING")
    db.session.add_all([project, page, task])
    db.session.commit()

    file_service = FileService(app.config["UPLOAD_FOLDER"])
    page.generated_image_path = file_service.save_generated_image(
        Image.new("RGB", (320, 180), "white"),
        project.id,
        page.id,
    )
    db.session.commit()

    warnings = ExportWarnings()
    with patch(
        "services.export_service.ExportService.create_editable_pptx_with_recursive_analysis",
        side_effect=[
            ExportError("背景修复卡住", error_type="layout_analysis"),
            (None, warnings),
        ],
    ) as create_pptx:
        task_manager.export_editable_pptx_with_recursive_analysis_task(
            task.id,
            project.id,
            "recursive-fallback.pptx",
            file_service,
            app=app,
        )

    db.session.refresh(task)
    progress = task.get_progress()
    assert task.status == "COMPLETED"
    assert create_pptx.call_count == 2
    assert create_pptx.call_args_list[0].kwargs["export_inpaint_method"] == "hybrid"
    assert create_pptx.call_args_list[1].kwargs["export_inpaint_method"] == "none"
    assert "背景修复失败" in progress["warnings"][0]


def test_export_editable_task_continues_when_style_provider_init_fails(client, app):
    project = Project(id="task-style-provider-fallback", creation_type="idea")
    page = Page(project_id=project.id, order_index=0)
    task = Task(project_id=project.id, task_type="EXPORT_EDITABLE_PPTX", status="PENDING")
    db.session.add_all([project, page, task])
    db.session.commit()

    file_service = FileService(app.config["UPLOAD_FOLDER"])
    page.generated_image_path = file_service.save_generated_image(
        Image.new("RGB", (320, 180), "white"),
        project.id,
        page.id,
    )
    db.session.commit()

    with patch(
        "services.image_editability.TextAttributeExtractorFactory.create_caption_model_extractor",
        side_effect=RuntimeError("not connected"),
    ), patch(
        "services.export_service.ExportService.create_editable_pptx_with_recursive_analysis",
        return_value=(None, ExportWarnings()),
    ) as create_pptx:
        task_manager.export_editable_pptx_with_recursive_analysis_task(
            task.id,
            project.id,
            "style-fallback.pptx",
            file_service,
            app=app,
        )

    db.session.refresh(task)
    assert task.status == "COMPLETED"
    assert create_pptx.call_args.kwargs["text_attribute_extractor"] is None
    assert any("默认文本样式" in warning for warning in task.get_progress()["warnings"])


def test_export_editable_task_does_not_retry_stalled_analysis(client, app):
    project = Project(id="task-no-overlapping-retry", creation_type="idea")
    page = Page(project_id=project.id, order_index=0)
    task = Task(project_id=project.id, task_type="EXPORT_EDITABLE_PPTX", status="PENDING")
    db.session.add_all([project, page, task])
    db.session.commit()

    file_service = FileService(app.config["UPLOAD_FOLDER"])
    page.generated_image_path = file_service.save_generated_image(
        Image.new("RGB", (320, 180), "white"),
        project.id,
        page.id,
    )
    db.session.commit()

    with patch(
        "services.export_service.ExportService.create_editable_pptx_with_recursive_analysis",
        side_effect=ExportError(
            "版面分析卡住",
            error_type="layout_analysis",
            details={"pending_pages": [1]},
        ),
    ) as create_pptx:
        task_manager.export_editable_pptx_with_recursive_analysis_task(
            task.id,
            project.id,
            "no-overlap.pptx",
            file_service,
            app=app,
        )

    db.session.refresh(task)
    assert task.status == "FAILED"
    assert create_pptx.call_count == 1
