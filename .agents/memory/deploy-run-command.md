---
name: Deploy run command must set NODE_ENV
description: Why publishing failed twice — run command shape for autoscale deploys
---

Rule: the deploy run command must be `npm run start` (which sets NODE_ENV=production), not `node dist/index.js`.

**Why:** server/index.ts branches on env — without NODE_ENV=production it starts the Vite dev server in the prod container, /src/main.tsx does not exist there, health checks on / return 500, and the app crash-loops at the promote step. Also the build emits dist/index.js (ESM), never dist/index.cjs.

**How to apply:** whenever touching deploy config, verify locally with `PORT=5199 npm run start` then curl / for a 200 before suggesting publish.
