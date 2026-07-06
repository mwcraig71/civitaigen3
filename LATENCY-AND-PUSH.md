# Image Latency Fix + Web Push — July 5, 2026

## The "ready but not showing" bug — root cause

The pipeline was already fast end-to-end: CivitAI returns → server writes the
DB row → WebSocket delivers the CDN image URL to the browser instantly → the
client even inserts it into the Recent Generations cache optimistically.

Then the gallery threw that away. `image-gallery.tsx` rendered EVERY grid
image as `/api/images/:id` instead of the URL it was handed. For a fresh
image (not yet in object storage) that endpoint makes the server download
the full image from the CDN, run sharp watermark compositing, and stream it
back — per grid cell, on the same single instance that is simultaneously
running the background watermark-and-store pipeline for the whole batch.
That server-side traffic jam was your extra 1–2 minutes. (The green "Ready!"
placeholder appears instantly because it's driven by the WebSocket, which is
why you saw ready-but-no-image.)

## The fix

- The gallery now renders `generation.imageUrl` as-is: fresh images load
  directly from the CDN (instant), stored images keep using `/api/images/:id`
  (streamed from object storage, as before). One helper: `getDisplayImageUrl`.
- `decoding="sync"` → `"async"` on grid images so a batch doesn't block paint.
- Trade-off (deliberate): brand-new images display un-watermarked for the
  first ~minute until background storage completes; downloads and shares still
  always get the watermarked copy.

## Web push: "Your images are ready 🎨"

Generation takes 2–3 minutes — exactly when people close the tab. Now:

- The first time a user starts a generation, the browser asks for notification
  permission (high-intent moment, one attempt per browser).
- When a batch finishes AND the user has no open WebSocket (they left), every
  registered device gets a push; tapping it opens /generate.
- No spam: connected users get nothing (they see it live), notifications
  expire after 1 hour, dead subscriptions are auto-pruned.

Pieces: `push_subscriptions` table, `server/push.ts` (web-push + VAPID),
subscribe/unsubscribe endpoints, `client/public/sw.js` service worker,
`client/src/lib/push.ts` registration helper.

## Deployment steps (in Replit, where your .env lives)

```bash
npm install                          # picks up web-push
npm run db:push                      # REQUIRED: push_subscriptions table + the 5 growth columns
npx web-push generate-vapid-keys     # once; put the output in .env:
# VAPID_PUBLIC_KEY=...
# VAPID_PRIVATE_KEY=...
# VAPID_SUBJECT=mailto:you@yourdomain.com
```

I could not run `db:push` from here — DATABASE_URL lives only in your Replit
environment (and production credentials shouldn't leave it). Without VAPID
keys the app still runs; push is simply disabled with a boot-time warning.
