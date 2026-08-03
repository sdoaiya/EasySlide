import json


def add_content_project(
    project,
    *,
    source_fields=None,
    ppt_settings=None,
    ppt_stage='DRAFT',
):
    from models import db
    from services.content_spine_service import (
        canonical_json,
        create_spine,
        document_hash,
        get_spine_sections,
    )
    from services.project_workspace_service import (
        create_workspace_set,
        initialize_workspace_from_snapshot,
    )

    source_fields = source_fields or {'idea_prompt': project.project_title or project.id}
    settings = {
        'render_mode': 'image',
        'image_aspect_ratio': '16:9',
        **(ppt_settings or {}),
    }
    db.session.add(project)
    db.session.flush()
    project.content_spine = create_spine(project.id, source_fields)
    # fixture 契约：初始化前把 raw-source 回退提升为结构化章节（等价于 confirm），
    # 保持「工作区初始化预填 1 页」的既有测试假设
    document = json.loads(project.content_spine.document_json)
    if not document.get('sections'):
        sections = get_spine_sections(document)
        if sections:
            document['sections'] = sections
            project.content_spine.document_json = canonical_json(document)
            project.content_spine.content_hash = document_hash(document)
    project.workspaces.extend(create_workspace_set(project.id))
    db.session.flush()
    spine = project.content_spine
    initialize_workspace_from_snapshot(
        project.id,
        'ppt',
        spine.revision,
        spine.content_hash,
        json.loads(spine.document_json),
        settings,
    )
    ppt = next(workspace for workspace in project.workspaces if workspace.kind == 'ppt')
    ppt.stage = ppt_stage
    ppt.state = 'ready' if ppt_stage in {
        'COMPLETED', 'IMAGES_GENERATED', 'NATIVE_DECK_GENERATED',
    } else 'draft'
    return project
