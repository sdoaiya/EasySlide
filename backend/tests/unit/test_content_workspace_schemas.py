import copy
import json
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator


SCHEMA_DIR = Path(__file__).parents[3] / "shared" / "content"


def load_schema(name):
    schema = json.loads((SCHEMA_DIR / name).read_text(encoding="utf-8"))
    Draft202012Validator.check_schema(schema)
    return schema


VALID_SPINE = {
    "schema_version": 1,
    "topic": {"value": "供应链韧性", "needs_confirmation": False},
    "audience": {"value": "管理层", "needs_confirmation": True},
    "goal": {"value": "形成行动共识", "needs_confirmation": False},
    "sources": [
        {"source_id": "source.prompt", "kind": "prompt", "ref": "project.idea_prompt", "title": "创建输入"}
    ],
    "research": [],
    "viewpoints": [
        {"item_id": "viewpoint.1", "statement": "韧性需要可观测性", "source_refs": ["source.prompt"], "needs_confirmation": False}
    ],
    "facts": [],
    "sections": [
        {"section_id": "section.1", "title": "现状", "summary": "识别风险", "key_points": ["风险分层"], "fact_refs": [], "source_refs": ["source.prompt"]}
    ],
    "narrative": {"opening": "从风险开始", "progression": ["现状", "行动"], "conclusion": "建立机制"},
    "needs_confirmation": ["/audience"],
}

VALID_VIDEO = {
    "schema_version": 1,
    "title": "供应链韧性",
    "aspect_ratio": "16:9",
    "scenes": [
        {
            "scene_id": "scene.1",
            "title": "风险",
            "visual": {"kind": "video", "source_ref": "/files/materials/clip.mp4", "source_revision": 2},
            "narration": {"mode": "single", "text": "先看风险。", "segments": []},
            "subtitles": {"enabled": True, "text": "先看风险。"},
            "duration_ms": 4200,
            "transition": "fade",
            "animation": {"intensity": "subtle", "cues": []},
            "audio_cues": [],
        }
    ],
}

VALID_PODCAST = {
    "schema_version": 1,
    "title": "供应链对话",
    "format": "dialogue",
    "language": "zh-CN",
    "speakers": [
        {"speaker_id": "host", "name": "主持人", "voice_ref": "edge:zh-CN-XiaoxiaoNeural"},
        {"speaker_id": "guest", "name": "嘉宾", "voice_ref": "fish:guest-1"},
    ],
    "segments": [
        {"segment_id": "segment.1", "speaker_id": "host", "text": "欢迎。", "locked": False, "audio_cues": [], "source_ref": "/files/materials/script.md", "source_kind": "transcript"}
    ],
    "mixing": {"bgm_asset_ref": None, "ducking": True, "fade_in_ms": 500, "fade_out_ms": 800},
    "cover": {"asset_ref": None, "title": "供应链对话", "subtitle": "第一期"},
}

VALID_DIFF = {
    "schema_version": 1,
    "items": [
        {"item_id": "diff.section.1", "path": "/sections/section.1/title", "operation": "replace", "change_type": "structure", "before": "现状", "after": "风险现状", "source_ref": "section.1"},
        {"item_id": "diff.fact.2", "path": "/facts/fact.2", "operation": "add", "change_type": "fact", "before": None, "after": {"statement": "新增事实"}, "source_ref": None},
    ],
}


@pytest.mark.parametrize(
    ("schema_name", "document"),
    [
        ("content-spine.schema.json", VALID_SPINE),
        ("video-workspace.schema.json", VALID_VIDEO),
        ("podcast-workspace.schema.json", VALID_PODCAST),
        ("sync-diff.schema.json", VALID_DIFF),
    ],
)
def test_content_workspace_schema_accepts_canonical_document(schema_name, document):
    Draft202012Validator(load_schema(schema_name)).validate(document)


@pytest.mark.parametrize(
    ("schema_name", "document", "mutate"),
    [
        ("content-spine.schema.json", VALID_SPINE, lambda value: value.update({"unexpected": True})),
        ("content-spine.schema.json", VALID_SPINE, lambda value: value["sections"][0].pop("section_id")),
        ("video-workspace.schema.json", VALID_VIDEO, lambda value: value["scenes"][0].update({"duration_ms": 0})),
        ("video-workspace.schema.json", VALID_VIDEO, lambda value: value["scenes"][0]["visual"].update({"kind": "ppt-slide"})),
        ("podcast-workspace.schema.json", VALID_PODCAST, lambda value: value.update({"speakers": value["speakers"][:1]})),
        ("podcast-workspace.schema.json", VALID_PODCAST, lambda value: value["segments"][0].pop("locked")),
        ("sync-diff.schema.json", VALID_DIFF, lambda value: value["items"][1].update({"before": "must-be-null"})),
        ("sync-diff.schema.json", VALID_DIFF, lambda value: value["items"][0].update({"path": "sections/0"})),
    ],
)
def test_content_workspace_schema_rejects_invalid_document(schema_name, document, mutate):
    invalid = copy.deepcopy(document)
    mutate(invalid)

    errors = list(Draft202012Validator(load_schema(schema_name)).iter_errors(invalid))

    assert errors


def test_sync_diff_requires_explicit_before_and_after_values():
    invalid = copy.deepcopy(VALID_DIFF)
    invalid["items"][0].pop("before")

    errors = list(Draft202012Validator(load_schema("sync-diff.schema.json")).iter_errors(invalid))

    assert errors


def test_sync_diff_rejects_empty_candidate():
    invalid = {"schema_version": 1, "items": []}

    errors = list(Draft202012Validator(load_schema("sync-diff.schema.json")).iter_errors(invalid))

    assert errors
