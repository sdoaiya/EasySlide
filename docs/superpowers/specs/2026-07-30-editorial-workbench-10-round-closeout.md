# Editorial Workbench: 10-Round Closeout

The "editorial workbench" direction is compatible with the unified Content Spine + PPT + video + podcast plan. The ten rounds below are implementation gates, not new product scope.

| Round | Gate | Result |
|---|---|---|
| R1 | Tokens, buttons, labels, shadows, paper surface | Pass in existing UI primitive tests |
| R2 | Four-column project wall and cross-mode status | Pass: URL/native PPT status and video/podcast dashboard aggregation are covered |
| R3 | Create flow and uninitialized workspace states | Pass in content-project route tests |
| R4 | One stationary 216px project rail and semantic links | Pass after project rail switched to complementary + links |
| R5 | Shared PPT/video/podcast shell | Pass in focused workspace tests |
| R6 | Image-only global material boundary and keyboard/touch actions | Pass: focus-within and 40px actions added; ProjectCard no longer nests interactive semantics |
| R7 | Global export task visibility and recovery | Pass: global panel remains available and `/tasks` provides a stable task-center route |
| R8 | Anime.js, reduced motion, Escape and dialog semantics | Pass: route animation, reduced motion, dialog Escape and focus return are covered |
| R9 | 1280x720, 1440x900, 1920x1080, 125% and overflow | Pass: Playwright editorial wall and responsive suite passed |
| R10 | Full tests, build, lint, real media and packaged smoke | Partial: code/media fixtures and packaged smoke pass; Fish Audio credentials, human listening sign-off and release checklist remain external gates |

## Smallest reruns

```text
frontend: BASE_URL=http://127.0.0.1:61628 npm.cmd run test:e2e -- editorial-workbench-home.spec.ts apple-ui-keyboard.spec.ts
frontend: npm.cmd run test:run -- src/tests/utils.projectUtils.test.ts src/tests/components/ExportTasksPanel.pause.test.tsx src/tests/components/MaterialSelector.media.test.tsx
backend: uv run pytest backend/tests/unit/test_audio_mix_service.py backend/tests/unit/test_podcast_service.py backend/tests/unit/test_video_workspace_service.py -q
frontend: npm.cmd run build:check
frontend: npm.cmd run lint
```

## Explicit blockers

1. Backend dashboard statistics still aggregate PPT pages only.
2. ProjectCard still exposes a button-like container around child buttons.
3. The quality report modal still needs shared focus return.
4. Real Fish Audio single/guest speaker samples and human listening sign-off require credentials and external media.
