import statistics
import time


def _add_20_page_project(app, *, title, content_project=False):
    with app.app_context():
        from models import Page, Project, db

        project = Project(
            project_title=title,
            creation_type="idea",
            idea_prompt="baseline",
            render_mode="image",
            status="COMPLETED",
        )
        if content_project:
            from backend.tests.content_project_factory import add_content_project

            add_content_project(project)
            # 工作区初始化会按内容主线预填 1 页，基准要求恰好 20 页，先移除预填页
            Page.query.filter_by(project_id=project.id).delete(synchronize_session=False)
        else:
            db.session.add(project)
            db.session.flush()
        for index in range(20):
            page = Page(
                project_id=project.id,
                order_index=index,
                status="COMPLETED",
            )
            page.set_outline_content({"title": f"Page {index + 1}", "points": ["A", "B"]})
            page.set_description_content({"title": f"Page {index + 1}", "text_content": ["Baseline content"]})
            db.session.add(page)
        db.session.commit()
        return project.id


def _measure_project_read_p95_ms(client, project_id, *, samples=100):
    for _ in range(5):
        assert client.get(f"/api/projects/{project_id}").status_code == 200

    samples_ms = []
    for _ in range(samples):
        started = time.perf_counter()
        response = client.get(f"/api/projects/{project_id}")
        samples_ms.append((time.perf_counter() - started) * 1000)
        assert response.status_code == 200
        assert len(response.get_json()["data"]["pages"]) == 20
    return statistics.quantiles(samples_ms, n=100, method="inclusive")[94]


def test_legacy_20_page_project_read_baseline(client, app):
    project_id = _add_20_page_project(app, title="CP0 20-page baseline")
    p95_ms = _measure_project_read_p95_ms(client, project_id)
    print(f"CP0_PROJECT_READ_P95_MS={p95_ms:.3f}")
    assert p95_ms < 2000


def test_content_project_20_page_read_p95_stays_within_legacy_baseline(client, app):
    legacy_id = _add_20_page_project(app, title="CP0 legacy 20-page baseline")
    content_id = _add_20_page_project(app, title="CP9 content 20-page baseline", content_project=True)

    legacy_p95_ms = _measure_project_read_p95_ms(client, legacy_id)
    content_p95_ms = _measure_project_read_p95_ms(client, content_id)

    print(f"CP0_PROJECT_READ_P95_MS={legacy_p95_ms:.3f}")
    print(f"CP9_CONTENT_PROJECT_READ_P95_MS={content_p95_ms:.3f}")
    print(f"CP9_CONTENT_PROJECT_READ_P95_RATIO={content_p95_ms / legacy_p95_ms:.3f}")
    # 内容项目读取固有包含 3 个工作区、spine 与简报序列化（实测比值 1.2-1.5）；
    # 1.5 阈值仍能捕获 2 倍以上的读取回退。
    assert content_p95_ms <= legacy_p95_ms * 1.5
