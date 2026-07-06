---
name: CivitAI orchestration scope
description: What the CivitAI JS SDK does and doesn't cover, and how to reach the orchestration API directly.
---

The `civitai` npm SDK only wraps `textToImage`. txt2img, img2img, img2vid, inpainting, upscaling, training all go through `https://orchestration.civitai.com/v2/consumer/workflows` (the documented v2 workflows API) called directly with `fetch` and a Bearer API key. (The older `/v2/consumer/jobs` path is legacy — do not add new job types there.)

**Why:** SDK is stale relative to the orchestration spec. Avoid trying to wedge new job types into the SDK — read https://developer.civitai.com/orchestration/reference/ and POST raw JSON.

**How to apply:** When adding any non-txt2img generation type, create a thin fetch client (see `server/civitai-orchestration.ts`) that returns `{ token }` like the SDK does, then feed that token into the existing `BatchPoller` so polling / WS / archival stays uniform. Surface 5xx as "service unavailable" — orchestration occasionally returns HTTP 500 with empty body during their outages and that is not a code bug on our side.
