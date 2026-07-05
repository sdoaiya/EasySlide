# EasySlide Setup

Full documentation: https://www.ezppt.cn/

## Install and Start Backend

```bash
# From the EasySlide project root
cd easyslide
cp .env.example .env
# Edit .env — at minimum set an AI provider key (see below)
cd backend
uv sync
uv run alembic upgrade head
uv run python app.py
```

Backend starts on http://localhost:5011.

## Required Configuration

Edit `.env` with at least one AI provider:

```env
# Google Gemini (default)
AI_PROVIDER_FORMAT=gemini
GOOGLE_API_KEY=your-key

# OR OpenAI-compatible
AI_PROVIDER_FORMAT=openai
OPENAI_API_KEY=your-key
OPENAI_BASE_URL=https://api.openai.com/v1
```

Supported providers: `gemini`, `openai`, `vertex`, `lazyllm`, `anthropic`.

## Verify

```bash
curl -sf http://localhost:5011/health
```

## Install easyslide-cli

```bash
# Option A: use directly from project root (no install needed)
uv run easyslide-cli --help

# Option B: install globally (then use easyslide-cli directly)
uv tool install .
easyslide-cli --help
```

If the backend runs on a non-default port, pass `--base-url` or set `EASYSLIDE_CLI_BASE_URL`.

