from types import SimpleNamespace

from controllers.export_controller import _project_title_filename


def test_export_filename_uses_project_theme_when_title_is_empty():
    project = SimpleNamespace(
        project_title='',
        idea_prompt='人工智能在制造业的应用\n补充说明',
        outline_text='',
        description_text='',
    )

    assert _project_title_filename(project, 'pptx', 'presentation_demo.pptx') == '人工智能在制造业的应用.pptx'


def test_export_filename_falls_back_to_project_id_name_without_topic():
    project = SimpleNamespace(project_title='', idea_prompt='', outline_text='', description_text='')

    assert _project_title_filename(project, 'pdf', 'presentation_demo.pdf') == 'presentation_demo.pdf'


def test_video_export_filename_uses_project_theme():
    project = SimpleNamespace(
        project_title='',
        idea_prompt='年度经营复盘',
        outline_text='',
        description_text='',
    )

    assert _project_title_filename(project, 'mp4', 'narration_demo.mp4') == '年度经营复盘.mp4'
