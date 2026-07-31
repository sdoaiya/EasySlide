import hashlib
import sqlite3

from backend.tests.fixtures.legacy_content_projects import (
    PROJECT_IDS,
    build_legacy_content_projects_database,
    expected_legacy_counts,
    read_legacy_counts,
)


def test_legacy_fixture_is_repeatable(tmp_path):
    first = build_legacy_content_projects_database(tmp_path / "first.db")
    second = build_legacy_content_projects_database(tmp_path / "second.db")

    assert read_legacy_counts(first) == expected_legacy_counts()
    assert read_legacy_counts(second) == expected_legacy_counts()
    assert hashlib.sha256(first.read_bytes()).hexdigest() == hashlib.sha256(second.read_bytes()).hexdigest()


def test_legacy_fixture_covers_all_required_project_shapes(tmp_path):
    database = build_legacy_content_projects_database(tmp_path / "legacy.db")
    connection = sqlite3.connect(database)
    connection.row_factory = sqlite3.Row
    try:
        projects = {
            row["id"]: row
            for row in connection.execute("SELECT * FROM projects ORDER BY id")
        }
        assert projects[PROJECT_IDS["blank"]]["status"] == "DRAFT"
        assert projects[PROJECT_IDS["image"]]["render_mode"] == "image"
        assert projects[PROJECT_IDS["native"]]["render_mode"] == "native"
        assert projects[PROJECT_IDS["renovation"]]["template_image_path"]
        assert projects[PROJECT_IDS["complex"]]["narration_preferences"]

        complex_id = PROJECT_IDS["complex"]
        assert connection.execute("SELECT COUNT(*) FROM tasks WHERE project_id = ? AND status = 'RUNNING'", (complex_id,)).fetchone()[0] == 1
        assert connection.execute("SELECT COUNT(*) FROM materials WHERE project_id = ?", (complex_id,)).fetchone()[0] == 1
        assert connection.execute("SELECT COUNT(*) FROM reference_files WHERE project_id = ?", (complex_id,)).fetchone()[0] == 1
        assert connection.execute("SELECT COUNT(*) FROM narration_versions").fetchone()[0] == 1
        assert connection.execute("PRAGMA foreign_key_check").fetchall() == []
    finally:
        connection.close()
