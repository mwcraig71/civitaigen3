---
name: CivitAI blob availability flag
description: A CivitAI result carrying a signed blobUrl while `available` is false is a DEAD blob (404) — the output was dropped/moderated; deliver only on `available === true`.
---

# CivitAI blob `available === true` is the ONLY honest readiness signal

When polling `getJobStatus` (v1 jobs endpoint: `orchestration.civitai.com/v1/consumer/jobs?token=`),
each entry in `job.result[]` has an `available` boolean plus a signed `blobUrl` (images) /
`url` / `videoUrl` (video), on host `orchestration-new.civitai.com`.

**A present signed URL is NOT proof the image exists.** Verified by GET on such a URL: it
returns **HTTP 404 `{"title":"Not Found"}`** even though the `sig` is valid and `exp` is a
year out. So when `available:false` but a blobUrl is present, the blob was never stored —
CivitAI silently dropped the output. On this NSFW app the usual cause is **CivitAI's own
content filter blocking the prompt** (extreme prompts submit fine but produce no blob); a
server-side job failure does the same.

**Rule:** deliver a result ONLY when `available === true`. Do NOT fall back to
"finished + has URL = ready" — that URL 404s and the download just churns.

**Why:** an earlier fix assumed `available` lagged behind a ready blob and treated a
present URL on a finished job as ready. That premise was never tested and is FALSE (404).
Trusting the URL makes the poller try to download dead blobs forever.

**Dead-output terminal failure (how to not hang):** the poller must give up when results
are present but `availableBlobs` stays 0. In the BatchPoller result handler
(server/routes.ts), when `availableBlobs === 0`, three exits:
1. Job finished (`scheduled:false`) with NO url at all → fail immediately.
2. Fast path: track in-memory `resultsUnavailableSince`, fail after `DEAD_OUTPUT_MS`
   (30s when `scheduled:false`, 5min when `scheduled:true`). Reset when `availableBlobs>0`.
3. Restart-proof backstop: fail when `job.scheduled === false` AND the generation's
   PERSISTED `createdAt` is >30min old (cached in `pollerInfo.generationCreatedAtMs`).

**Why the persistent backstop matters (the real "prod hangs forever" bug):** every
in-memory timer (`attempts`, `resultsUnavailableSince`, `lastProgressTime`, the 35-min hard
cap) is reset when recovery-service re-creates pollers on restart/deploy. A user who
**republishes constantly** keeps resetting the clock, so dead jobs never reach any timeout →
perpetual "0/1 ready" loop. Dev isn't restarted constantly, so there timers run out and jobs
resolve — that is the actual explanation for "dev works, prod doesn't," NOT a key/env
difference (`CIVITAI_API_KEY` is a global secret, identical in dev and prod). The only
restart-proof clock is the DB `createdAt`. Gate the age-cap on `scheduled === false` so long
CivitAI queue latency (20-30min, reported as `scheduled:true`) is never age-failed.

On any dead-output exit: mark failed + refund `transformCost` + broadcast a user-facing
message pointing at content filters.
