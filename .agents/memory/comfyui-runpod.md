---
name: ComfyUI RunPod integration
description: How the RunPod provider actually works — ComfyUI pod, not RunPod Serverless API
---

## Rule
The "RunPod" provider talks to a self-hosted ComfyUI pod, NOT the RunPod Serverless API.

**Why:** The user's RunPod setup is a ComfyUI pod accessed via a proxy URL. RunPod Serverless API format (api.runpod.io/v2/{endpointId}/run + API key) was wrong.

## How to apply
- Config stored as `runpod_base_url` (e.g. `https://{podId}-3000.proxy.runpod.net`) + `runpod_checkpoint` (e.g. `dreamshaper_8.safetensors`)
- **No API key** — the URL is the only credential
- Port 3000, not 8188 (this template puts ComfyUI on 3000)
- Client: `server/comfyui-service.ts` — POST `/prompt` (API-format workflow JSON), poll GET `/history/{promptId}`, download via GET `/view?filename=...&subfolder=...&type=output`
- `/prompt` only accepts API-format workflows (Workflow → Export (API)), not the regular Save format — `buildTxt2ImgWorkflow()` in comfyui-service.ts builds this correctly
- ComfyUI LoRAs must be local filenames on disk (relative to `models/loras/`) — CivitAI download URLs don't work; only NV-mapped LoRAs apply
- `server/runpod-service.ts` (RunPod Serverless client) is kept in the codebase but no longer used by the generation pipeline

## Security note
ComfyUI has zero built-in auth — anyone with the URL can queue jobs. The pod ID in the URL is the only protection. Admin panel shows a warning about this.
