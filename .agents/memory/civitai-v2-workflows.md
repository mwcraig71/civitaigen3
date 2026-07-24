---
name: CivitAI v2 workflows shape
description: Durable decisions and gotchas for /v2/consumer/workflows (img2img, video) and the SSRF guard for source-image re-hosting.
---

## editImage source image field is `images: [url]` — `sourceImage` is silently dropped

For `operation: "editImage"` on Flux1 SdCpp, the source image goes in **`images: ["https://..."]`** — a plural array of URL strings. Sending `sourceImage: { url }` is accepted as an unknown field, silently stripped, and the engine runs with `images: []` (txt2img from noise). **Why:** CivitAI ignores unknown fields rather than rejecting them. **How to apply:** use `?dryRun=true` to confirm fields survive round-trip to the echoed body. An invalid URL returns "failed to download from URL" only if the field is actually wired.

## Flux.1 safe param band

CFG ∈ [1.0, 4.5] (sweet spot 3.5), steps ≥ 20. Values outside produce black/white noise silently. Clamp server-side before sending.

## AIR URN ecosystem must match the step ecosystem (silent wedge)

`urn:air:<ecosystem>:checkpoint:…` must match the step's `ecosystem` field. Mismatch = job wedges at `~3e-5` progress forever with no error. Re-derive ecosystem from live `baseModel` at submit time (regex-replace prefix), never trust the cached `arn`.

## Polling v2 workflows

- Poll: `GET /v2/consumer/workflows/{workflowId}`. IDs are `digits-dash-digits`, NOT UUIDs. Legacy v1 SDK 400s on these.
- `step.output.images[].url` present = image ready. No `available` boolean in v2. Check `!!url`.
- Step status: `processing` / `succeeded` / `failed` / `expired` / `canceled`.
- Recovery on server boot: detect v2 tokens by shape `/^\d+-\d+$/` and route to `getWorkflowStatus`; UUID tokens use v1 SDK.

## v1 terminal failure shape

`[{ blobKey, available: false, seed }]` with `scheduled: false` and no URL = permanent failure on first poll. Check `!job.scheduled && availableBlobs === 0 && no URL`. Do NOT wait for timeout.

## SSRF guard for source-image re-hosting

Two-layer defense in `uploadSourceImageToCivitAI`:
1. Hostname pattern check blocks literal RFC-1918/loopback strings in the URL.
2. `dns.lookup(hostname)` resolves the target IP and rejects private ranges (10.x, 192.168.x, 172.16-31.x, 127.x, ::1, link-local). This prevents DNS rebinding attacks.
**Why:** hostname-pattern-only checks can be bypassed by internal hostnames that resolve to private IPs. DNS resolution is required.
**How to apply:** any server-side image fetch from user-supplied URLs must call `dns.lookup` before fetching; the pattern check alone is insufficient.

## img2img runs on Flux 2 Klein `createVariant` (not the checkpoint)

img2img does NOT use the user's selected checkpoint. It always runs on Flux 2 "Klein" (Civitai-hosted) via `engine:"sdcpp"`, `ecosystem:"flux2Klein"`, `operation:"createVariant"`, `modelVersion:"4b"`. **Why:** the old Flux.1 `editImage` path required the user to pick a Flux checkpoint and threw for everyone else, breaking img2img for almost all users; Klein is universal and hosted so no checkpoint URN is needed. **How to apply:** `createVariant` takes a SINGLE source URL in **`image`** (string) + **`strength`** (0=keep source, 1=discard; 0.6–0.8 sweet spot) — NOT `images:[]`/`denoise` (that's `editImage`, and costs 24 vs createVariant's 12). Klein bands: cfgScale 1–20 (default 5), steps 4–50 (default 20), sampleMethod `euler` + schedule `simple` (recipe defaults). Klein LoRAs are flux2-only `{ urn: number }`. Recipe: https://developer.civitai.com/orchestration/recipes/flux2

## Denoise / strength normalization

`submitImg2Img` receives `denoiseStrength` in **0–1 float** and maps it directly to Klein's `strength`. Any caller storing percent (0–100) must divide by 100 before calling. The DB stores percent (for UI display); the orchestration layer expects float.

## Video: max duration + engine gating

Platform settings `video_max_duration_seconds` and `allowed_video_engines` (comma-separated) are enforced server-side in the `/api/transform` handler before cost deduction. Defaults: 10s, all engines (haiper/kling/wan/minimax). Admin controls in the Settings tab.

## How to probe unknown changes

POST `{"workflowTemplate":"t","steps":[{"$type":"<guess>","input":{}}]}`. `Read unrecognized type discriminator` = invalid type. `missing required properties` = valid type. `insufficientBuzz` = valid shape, just not enough balance — safe shape-confirmation signal during debugging.

## createImage (txt2img) — ecosystem discriminators + per-field rules

`operation: "createImage"` step. Valid `ecosystem` discriminators are ONLY `sd1`, `sdxl`, `flux1`; `pony`/`illustrious`/`noobai` 400 with "No derived type found". Pony, Illustrious, NoobAI are all SDXL-arch → submit as `sdxl`. Derive from `baseModel` substring match.
- Flux uses **`diffuserModel`** for the checkpoint URN; sd1/sdxl use **`model`**.
- `clipSkip` is **SD1-only** — SDXL/Flux 400 on it. Omit otherwise.
- LoRAs are a map **`{ urn: number }`** (strength as a bare number). The `{ strength }` object form used by editImage is REJECTED for createImage.
- `seed` is UInt32? — omit when random (-1/0 rejected).
- Rewrite each LoRA URN's ecosystem prefix to match the step ecosystem too (same silent-wedge rule as the checkpoint).

## SdCpp sampler/schedule enums (validated via whatif)

`sampleMethod` valid: **euler, euler_a, heun, dpm2, lcm**. The dpmpp_* family, uni_pc, ddim, lms, dpm_fast/adaptive all 400 (comfy-only) → fall back to `euler`.
`schedule` valid: **discrete, karras, simple, exponential, ays, gits, sgm_uniform** (`normal`/`beta` rejected). Defaults: `discrete` for sd1/sdxl, `simple` for flux1.
**Why:** sdcpp engine supports only a subset; map UI scheduler names (which include karras/exponential suffixes) onto these two fields. **How to apply:** see `mapSchedulerToSdCpp` in civitai-orchestration.ts.

## Krea 2 checkpoints — comfy engine, not sdcpp

baseModel "Krea 2" checkpoints are NOT sd1/sdxl/flux1 — submitting as sd1 wedges silently. Correct shape: `engine:"comfy"`, `ecosystem:"krea2"`, `model:"turbo"|"raw"` (pick by checkpoint name containing "turbo"), `operation:"createImage"`, checkpoint URN in **`diffusionModel`** (nullable), `sampler`/`scheduler` comfy enums (euler/simple OK), loras as `{urn:number}` map. Turbo defaults steps 8 / cfg 1 (clamp low); raw 28 / 4. Costs ~18 (turbo) / ~50 (raw) Buzz per image. Separately, `engine:"fal"`, `model:"krea2"` is Krea's hosted service — no checkpoints/LoRAs/negative prompts, aspectRatio instead of width/height. **How to apply:** any new baseModel family may need its own comfy ecosystem — check `https://orchestration.civitai.com/v2/consumer/recipes/imageGen/openapi.yaml` for `Comfy<Family>ImageGenInput` schemas before assuming sd1 fallback.

## Comfy jobs keep blobs `available:false` for the entire run

Comfy-engine jobs (Krea 2 etc.) report results with signed URLs but `available:false` from submit until completion — 3+ min per image, longer for batches. A dead-output heuristic must be lenient while `scheduled:true` (20-min window; 35-min hard cap backstops) and only fast-fail (30s) once `scheduled:false` — that's the true content-filter/dropped-output case. Verified live: Krea 2 turbo single image succeeded after ~3 min with available:false throughout.

## whatif vs dryRun

`?whatif=true` returns a real cost estimate (`transactions.list[].amount` buzz) + echoed input WITHOUT charging — use it to confirm a full payload is accepted before a paid submit. Dimensions need not be div-16 for whatif to pass, but round to 16 anyway per the documented constraint.

## Ecosystem derivation fallback when baseModel is missing

`deriveImageEcosystem(baseModel, arn?)`: when baseModel is empty/unknown, do NOT blindly default to `sd1` — that clobbers a valid SDXL/Flux URN and silently wedges the job. Fall back to the URN's own ecosystem segment if it's a valid discriminator (flux1/sdxl/sd1), only then default sd1. **Why:** most stored URNs carry a bogus sd1 prefix, but when baseModel gives no signal the URN is the only hint we have — a correct sdxl/flux1 URN must win. **How to apply:** always pass the modelArn as the 2nd arg.
