---
name: BatchPoller video branching
description: How to add new output media types without forking the polling system.
---

The existing `BatchPoller` polls `civitaiRequest` entries and dispatches `processIndividualResult` for image results. When adding a new media type (e.g. video), tag the tracker entry with `mediaType` and branch inside the poller's per-result loop to a dedicated handler (e.g. `processIndividualVideo`).

**Why:** Forking the poller into a parallel `VideoPoller` class duplicates WebSocket broadcasts, batch tracking, credit-refund logic, and stuck-recovery — all of which are deeply entangled with the original poller.

**How to apply:** Set `mediaType` on the tracker registration. In the poll loop, check `civitaiRequest.mediaType === 'video'` (or per-result `result.mediaType`) and dispatch to the alternate handler. The handler still writes to the same `generations` row (filling video-specific columns) and broadcasts the same `generation_image_ready` / `generation_batch_complete` WS events, so the gallery just needs to render `<video>` when `videoUrl` is set.
