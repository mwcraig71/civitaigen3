---
name: Disabling Vite HMR in Replit dev (middleware mode)
description: What it actually takes to kill the Vite reload loop through Replit's proxy — hmr:false alone is insufficient.
---

Rule: to fully disable Vite HMR in middleware mode you need THREE things:
1. `hmr: false` AND `ws: false` in the server options — with only `hmr: false`, Vite 5.4 still opens its HMR WebSocket server on default port 24678 (`createWebSocketServer` only no-ops when `config.server.ws === false`). That listener answers the client's poll with HTTP 426, which the client treats as "server is back" → infinite full-page reload loop (even for stale cached clients).
2. Strip the injected `<script src="/@vite/client">` from transformIndexHtml output.
3. Serve a stub module at `/@vite/client` (registered BEFORE vite.middlewares) — transformed CSS/JS modules still import `createHotContext`/`updateStyle` from it. The stub MUST really implement `updateStyle`/`removeStyle` (append `<style>` to head) or dev CSS breaks; all HMR APIs can be no-ops.

**Why:** Replit's proxy can't sustain the HMR WebSocket in the user's browser; the client's fallback (ping poll → location.reload) resets the app mid lazy-chunk load, appearing as "stuck at Loading...". Keep `fastRefresh` at default true — the React preamble is injected independently and `fastRefresh:false` is ignored by plugin-react v4 and causes preamble errors.

Related: auth-style queries (`/api/auth/user`, impersonation status) must use `on401: "returnNull"` — a thrown 401 leaves the query permanently stale in TanStack Query, so every mount refetches → request storm (dozens/sec) → 429s.
