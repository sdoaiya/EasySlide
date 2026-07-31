import importlib.util
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
SPEC = importlib.util.spec_from_file_location("check_release_staging", ROOT / "scripts" / "check_release_staging.py")
staging = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(staging)


def test_release_staging_allows_source_paths():
    assert staging.blocked(["backend/services/podcast_service.py", "frontend/src/App.tsx", "node_modules"]) == []


def test_release_staging_blocks_generated_paths_case_insensitively():
    paths = [
        "Frontend\\Dist\\index.html",
        "BACKEND\\BUILD\\app.exe",
        "Debug.LOG",
        "Some\\Node_Modules\\pkg\\index.js",
        "Tests\\.Pytest_Cache\\v\\cache\\nodeids",
        ".codex-tmp\\scratch.txt",
    ]
    assert staging.blocked(paths) == [path.replace("\\", "/") for path in paths]
