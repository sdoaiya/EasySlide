import argparse
import re
import sys
from datetime import date
from pathlib import Path

from validate_fish_acceptance_summary import validate_summary as validate_fish_summary
from validate_video_acceptance_summary import validate_summary as validate_video_summary


DEFAULT_CHECKLIST = Path("docs/superpowers/reports/2026-07-29-media-release-acceptance-checklist.md")
REQUIRED_FIELDS = ("验收人", "日期", "样本项目 ID", "输出文件路径", "单人项目 ID", "多人项目 ID")
PLACEHOLDER_RE = re.compile(r"^(?:<.*>|待填|待签|TBD|TODO|N/A|NA|-)$", re.IGNORECASE)


def incomplete_result_rows(text):
    seen = False
    bad = []
    for line in text.splitlines():
        if not line.startswith("|") or "---" in line or "通过标准" in line:
            continue
        cells = [cell.strip() for cell in line.strip("|").split("|")]
        if len(cells) >= 3 and cells[-1]:
            seen = True
            if not cells[-1].startswith("通过"):
                bad.append(line)
    if not seen:
        raise AssertionError("checklist contains no acceptance result rows")
    return bad


def section(text, heading):
    start = text.find(heading)
    if start < 0:
        raise AssertionError(f"checklist missing section: {heading}")
    end = text.find("\n## ", start + 1)
    return text[start:] if end < 0 else text[start:end]


def field_pattern(field):
    return rf"-\s*{re.escape(field)}(?:（[^）]*）|\([^)]*\))?\s*[：:]"


def field_value(text, field):
    match = re.search(field_pattern(field) + r"\s*(.+)", text)
    if not match:
        raise AssertionError(f"checklist missing {field}")
    value = match.group(1).strip()
    if not value:
        raise AssertionError(f"checklist missing {field}")
    if PLACEHOLDER_RE.match(value):
        raise AssertionError(f"checklist contains placeholder {field}: {value}")
    return value


def validate_date(value, label):
    try:
        date.fromisoformat(value)
    except ValueError as exc:
        raise AssertionError(f"{label} must be YYYY-MM-DD: {value}") from exc


def listed_ids(value):
    return {item.strip() for item in re.split(r"[,，、\s]+", value) if item.strip()}


def check(path):
    if not path.exists():
        raise AssertionError(f"checklist missing: {path}")
    text = path.read_text(encoding="utf-8-sig")
    if "待签" in text:
        raise AssertionError("checklist still contains pending signoff markers")
    bad_rows = incomplete_result_rows(text)
    if bad_rows:
        raise AssertionError("checklist contains non-passing result rows:\n" + "\n".join(bad_rows))
    for field in REQUIRED_FIELDS:
        if re.search(field_pattern(field) + r"\s*(?:\r?\n|$)", text):
            raise AssertionError(f"checklist missing {field}")
    video_section = section(text, "## 2. 视频")
    fish_section = section(text, "## 3. 播客")
    field_value(video_section, "验收人")
    field_value(fish_section, "验收人")
    validate_date(field_value(video_section, "日期"), "video signoff date")
    validate_date(field_value(fish_section, "日期"), "podcast signoff date")
    video = validate_video_summary(Path(field_value(video_section, "输出文件路径")))
    video_ids = listed_ids(field_value(video_section, "样本项目 ID"))
    expected_video_ids = {video["independent_video"]["project_id"], video["ppt_video"]["project_id"]}
    if video_ids != expected_video_ids:
        raise AssertionError(f"video project IDs do not match summary: {sorted(video_ids)} != {sorted(expected_video_ids)}")
    fish = validate_fish_summary(Path(field_value(fish_section, "输出文件路径")))
    single_id = field_value(fish_section, "单人项目 ID")
    dialogue_id = field_value(fish_section, "多人项目 ID")
    if single_id != fish["single"]["project_id"]:
        raise AssertionError(f"single podcast project ID does not match summary: {single_id} != {fish['single']['project_id']}")
    if dialogue_id != fish["dialogue"]["project_id"]:
        raise AssertionError(f"dialogue podcast project ID does not match summary: {dialogue_id} != {fish['dialogue']['project_id']}")


def main():
    parser = argparse.ArgumentParser(description="Check media release acceptance checklist signoff fields.")
    parser.add_argument("checklist", nargs="?", type=Path, default=DEFAULT_CHECKLIST)
    args = parser.parse_args()
    try:
        check(args.checklist)
    except AssertionError as exc:
        print(str(exc), file=sys.stderr)
        return 1
    print(f"media acceptance signoff check: ok ({args.checklist})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
