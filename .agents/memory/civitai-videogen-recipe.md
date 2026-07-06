---
name: CivitAI img2vid videoGen recipe shape
description: Why img2vid must use the documented videoGen discriminator shape, not a raw model URN.
---

img2vid (and any `videoGen` step) must use the **documented recipe shape**: four discriminator keys `engine`/`version`/`provider`/`operation` plus `images:[url]`, `prompt`, `resolution`, `duration` — NOT the legacy `operation:"imageToVideo"` + raw model AIR-URN + `numFrames/frameRate/sourceImage`.

**Why:** an unrecognized payload is not rejected — the orchestrator falls back to a per-pixel price (~250 × width × height ≈ 100,000,000 Buzz) and the submit fails with `insufficientBuzz`, which misleadingly looks like the account is out of Buzz. Correct-shape whatif at 480p×5s = ~2225 Buzz.

**How to apply:** For this NSFW platform use the **Civitai-hosted** provider (`provider:"comfy"`, `version:"v2.2"`) — the FAL providers are cheaper but refuse NSFW content. Always run `?whatif=true` before a real submit to read `cost.total`; an absurd total (millions) means the request shape is wrong, not that Buzz is depleted. Docs: https://developer.civitai.com/orchestration/recipes/wan.md
