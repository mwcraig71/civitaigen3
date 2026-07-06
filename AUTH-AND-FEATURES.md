# Google Auth Switch + Feature Pass — July 6, 2026

## Google-only authentication (replaces Replit OIDC)

- `server/googleAuth.ts` replaces `server/replitAuth.ts` (deleted). Session
  user keeps the exact same shape (`req.user.claims.sub`) so zero route
  changes were needed. Login/logout/callback stay at `/api/login`,
  `/api/logout`, `/api/callback`. Demo login and the mwcraig71 admin
  auto-grant are preserved. Old users won't map over — as agreed, fresh start.
- **Setup (Google Cloud console → Credentials → OAuth client):**
  1. Authorized redirect URIs: `https://civiverse.com/api/callback`,
     `https://www.civiverse.com/api/callback`, and
     `http://localhost:5000/api/callback` for dev.
  2. Put `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` in .env, set
     `APP_DOMAINS=civiverse.com,www.civiverse.com`.
  3. The server refuses to boot without the Google credentials (fail-closed).
- **Your built-in API is unaffected**: `/api/v1/*` authenticates with Bearer
  API keys (hashed, in the api_keys table) — no session involvement. Bot
  accounts + `/api/v1/auth/login` (bot password) also still work; verified
  the whole api-v1 router has no dependency on the session layer.

## AI Enhance: Best vs Candid shots

Toggle next to the AI Enhance button (✨ Best / 📷 Candid). Candid mode
instructs Grok to drop all quality/camera language (masterpiece, 8k,
professional photography, lens jargon) and instead write amateur-snapshot
prompts: candid, unposed, phone camera, natural light, imperfect framing.
Content/subject handling is unchanged. Server: `shotStyle` on
`/api/ai-enhance-prompt`; guidance block in `server/gemini-service.ts`.

## Scene / Outfit / Prop builders — usability only, zero content changes

- **Type-to-search pickers**: specific Location, Outfit, Pose, and Panty
  pickers were plain dropdowns with hundreds of unsearchable entries; they're
  now searchable comboboxes (keyboard navigable, 44px targets). Same options,
  same values.
- **Built Prompt is now a sticky bar** with a Copy button — you can see the
  prompt assemble while you pick instead of scrolling to the bottom to find it.
- **Scene Matrix (props/lighting/camera/etc.) search now spans all groups**
  in the category — before, it silently searched only the selected group.

## Also in this drop (from the error review)
See ERROR-FIXES.md: 366 → 0 type errors, CI type-check now blocking, and the
list of real runtime bugs that surfaced (broken poll-completion, dead admin
notifications, never-firing gallery refresh, and more).

## Deploy checklist
```bash
bash cleanup.sh
git apply --index civitaigen2-fixes.patch
npm install
npm run db:push          # growth columns + push_subscriptions + shared_images.stored_image_path
# .env additions:
#   GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / APP_DOMAINS
#   ENCRYPTION_KEY (openssl rand -hex 32)
#   VAPID keys (npx web-push generate-vapid-keys)
```

## What I recommend next (not in this patch)
The "refactor the bloat" request is partially done — ~2,600 lines of dead
code deleted, and auth/crypto/logging/push/rewards/admin-middleware extracted
into focused modules. The remaining big-ticket refactor is mechanical
splitting of routes.ts (10.7k lines), generation-panel.tsx (4.4k), and
fip-fap.tsx (4.6k) into per-domain files. That's a large, risk-bearing change
best done as its own dedicated pass with nothing else in flight.
