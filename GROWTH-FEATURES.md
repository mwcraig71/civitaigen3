# Growth & Retention Features — July 5, 2026

Four engagement systems added. All verified: tsc error distribution identical
to baseline, eslint 0 errors, 18/18 tests pass.

## ⚠️ Requires a schema push

New columns on `users`: `last_daily_claim_at`, `daily_streak`,
`referral_code` (unique), `referred_by`, `referral_count`.

```bash
npm run db:push
```

Run this before deploying — the new endpoints 500 without the columns.

## 1. Daily Buzz claim + streaks (retention)

- `POST /api/rewards/daily-claim`, `GET /api/rewards/daily-status`
- Schedule: 10 → 15 → 20 → 25 → 30 → 40 → 50 Buzz, capped at day 7+.
  Miss a day (UTC) and the streak resets. Tune in `server/rewards.ts`.
- Header shows a pulsing "🎁 +N" chip when unclaimed; a 🔥 streak counter
  after claiming. Claim → toast + credits refresh.
- Race-safe (guarded UPDATE), every claim logged to credit_transactions.
- Streak math is pure and unit-tested (`server/__tests__/rewards.test.ts`),
  including the UTC-midnight boundary case.

## 2. Referral program (growth)

- `GET /api/referral` (lazy-generates an 8-char unambiguous code),
  `POST /api/referral/redeem`.
- Both sides get 100 Buzz. Guards: one redemption per account, no self-referral,
  only within 7 days of signup, race-safe. Constants in `server/rewards.ts`.
- Settings page: "Invite Friends" card — copy link (`/?ref=CODE`), friends-joined
  count, redeem input.
- `?ref=` on any visit is captured to localStorage and auto-redeemed after
  the user signs in (survives the OAuth redirect).

## 3. Trending feed ranking (session length)

- New `sort=trending` on `/api/shared-images`, now the feed default.
  Score = (likes + 2×remixes + 0.05×views + 1) / (age_hours + 2)^1.5 —
  Hacker News-style gravity; remixes weigh double because someone spent
  credits on them.
- Feed sort toggle cycles Trending → Newest → Oldest.
- Trending starts at the top of the ranking (random-start only applies to
  chronological modes).

## 4. Remix counts (social proof / creator retention)

- `remixCount` computed per shared image (subquery on
  generations.source_shared_image_id) and returned by the feed API.
- Feed overlay shows a "🔁 N" badge; remixes also feed the trending score.

## Suggested next steps
- Web push for "your images are ready" (service worker + VAPID) — the biggest
  remaining return-visit lever given the 2–3 min generation time.
- Weekly event leaderboard (events table already exists; add ranking by likes
  within the event window + Buzz prizes).
- Remix tree view ("see what your image inspired") on the image modal.
- Track claim/referral funnels in your analytics before tuning reward values.
