---
name: CivitAI img2vid videoGen recipe shape
description: Correct WAN img2vid API shape, provider choice, output field, and NSFW handling.
---

img2vid must use the **documented videoGen discriminator shape**: four keys `engine`/`version`/`provider`/`operation` plus `images:[url]`, `prompt`, `resolution`, `duration`.

**Current production defaults** (v2.6/fal — docs recommended default):
- `version: "v2.6"`, `provider: "fal"`, `operation: "image-to-video"`
- `resolution: "720p"`, `duration: 1–8` (seconds)
- Do NOT pass `negativePrompt` — fal rejects it with a 400 unknown-field error
- Do NOT pass `seed` unless the user pinned one
- Cost: ~130 Buzz/sec at 720p (~650 Buzz for a 5-second clip)

**Why v2.6/fal, not v2.2/comfy:**
The v2.2/comfy path has extremely limited worker capacity. The docs troubleshooting table lists `error.code="no_provider"` as the cause of jobs sitting in `scheduled` state indefinitely — exactly what we observed (18–24 min hangs, then 35-min timeout). v2.6/fal has much higher capacity and is cheaper.

**Correct output field name:**
The success response puts the video under `step.output.video` (singular object), NOT `step.output.videos` (plural array):
```json
"output": { "video": { "id": "blob_...", "url": "https://.../signed.mp4" } }
```
Always read `step.output.video` first; keep `videos[]`/`outputs[]` as fallbacks for legacy shapes.

**NSFW on fal:**
fal may reject explicit prompts at generation time. The transform route's error handler detects NSFW-pattern errors and shows a user-friendly message ("Try a less explicit prompt") instead of the raw API error string.

**Why NOT legacy shape:**
`operation:"imageToVideo"` + raw model AIR-URN + `numFrames/sourceImage` is unrecognized — orchestrator falls back to per-pixel pricing (~250 × w × h ≈ 100M Buzz) and fails with `insufficientBuzz`.

Docs: https://developer.civitai.com/orchestration/recipes/wan
