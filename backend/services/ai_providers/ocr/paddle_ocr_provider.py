"""PaddleOCR-VL provider used by settings OCR test."""

import json
import os
import time
from pathlib import Path
from typing import Any, Optional

import requests


JOB_URL = "https://paddleocr.aistudio-app.com/api/v2/ocr/jobs"
MODEL = "PaddleOCR-VL-1.6"
DEFAULT_TOKEN = "57762e2be68fe4d0a5ae0aed5230a07d75314a74"


class PaddleOCRProvider:
    def __init__(self, token: str, job_url: str = JOB_URL, model: str = MODEL):
        self.token = token
        self.job_url = job_url
        self.model = model

    def recognize(self, file_path: str, max_wait_time: int = 120) -> dict[str, Any]:
        headers = {"Authorization": f"bearer {self.token}"}
        optional_payload = {
            "useDocOrientationClassify": False,
            "useDocUnwarping": False,
            "useChartRecognition": False,
        }

        if file_path.startswith("http"):
            response = requests.post(
                self.job_url,
                json={"fileUrl": file_path, "model": self.model, "optionalPayload": optional_payload},
                headers={**headers, "Content-Type": "application/json"},
                timeout=60,
            )
        else:
            path = Path(file_path)
            if not path.exists():
                raise FileNotFoundError(f"File not found: {file_path}")
            with path.open("rb") as f:
                response = requests.post(
                    self.job_url,
                    headers=headers,
                    data={"model": self.model, "optionalPayload": json.dumps(optional_payload)},
                    files={"file": f},
                    timeout=60,
                )

        response.raise_for_status()
        job_id = response.json()["data"]["jobId"]
        deadline = time.time() + max_wait_time

        while time.time() < deadline:
            result_response = requests.get(f"{self.job_url}/{job_id}", headers=headers, timeout=30)
            result_response.raise_for_status()
            data = result_response.json()["data"]
            state = data["state"]
            if state == "done":
                return self._load_jsonl_result(data["resultUrl"]["jsonUrl"])
            if state == "failed":
                raise RuntimeError(data.get("errorMsg") or "PaddleOCR job failed")
            time.sleep(5)

        raise TimeoutError("PaddleOCR job timed out")

    def _load_jsonl_result(self, jsonl_url: str) -> dict[str, Any]:
        response = requests.get(jsonl_url, timeout=60)
        response.raise_for_status()
        markdown_parts: list[str] = []
        page_count = 0

        for line in response.text.strip().splitlines():
            if not line.strip():
                continue
            result = json.loads(line)["result"]
            for item in result.get("layoutParsingResults", []):
                markdown_parts.append(item.get("markdown", {}).get("text", ""))
                page_count += 1

        text = "\n\n".join(part for part in markdown_parts if part).strip()
        return {
            "recognized_text": text,
            "markdown_content": text,
            "words_result_num": len(text.split()),
            "page_count": page_count,
        }


def create_paddle_ocr_provider(token: Optional[str] = None) -> PaddleOCRProvider:
    return PaddleOCRProvider(token or os.getenv("PADDLE_OCR_TOKEN") or DEFAULT_TOKEN)
