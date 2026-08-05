/**
 * CivitAI Orchestration client for img2img and img2vid.
 *
 * Uses CivitAI's v2 workflows API: `POST /v2/consumer/workflows`. Each request
 * carries a required (but unvalidated) `workflowTemplate` string and one or
 * more `steps`. Steps are discriminated by `$type` (`imageGen` for both
 * txt2img and img2img, `videoGen` for image-to-video). The `imageGen` input
 * is further discriminated by `operation`:
 *   - `createImage` — txt2img (all ecosystems)
 *   - `editImage`   — img2img (Flux1 SdCpp ONLY as of 2026-05; other
 *                     ecosystems 400 with "No derived type found")
 *
 * The legacy `/v1/consumer/jobs` endpoint is retained only for polling
 * tokens issued by older job submissions (see `getJobStatus`); all new
 * submissions go through v2 workflows so we can drive video and img2img
 * from the same surface.
 *
 * Auth: Bearer <CIVITAI_API_KEY>.
 * Reference: https://developer.civitai.com/orchestration/reference/
 * See also: .agents/memory/civitai-v2-workflows.md for the verified shape.
 */

import { promises as dns } from "dns";

import { logger } from "./logger";
const ORCHESTRATION_BASE = "https://orchestration.civitai.com";

/**
 * Video engine slugs exposed to clients. Each maps server-side to a recipe
 * (provider engine + ecosystem + model + operation) understood by CivitAI's
 * v2 workflows API.
 */
export type VideoEngine =
  | "wan-comfy-2.1"
  | "wan-fal-2.2"
  | "wan-fal-2.5"
  | "kling-2.5"
  | "vidu-q3"
  | "ltx-2"
  | "grok-img2vid";

interface VideoRecipe {
  workflowTemplate: string; // e.g. "wan-image-to-video"
  airUrn: string;           // canonical AIR URN required by v2 workflows
  defaultWidth: number;
  defaultHeight: number;
  defaultFrames: number;
  defaultFps: number;
  allowsNsfw: boolean;
}

// AIR URNs follow `urn:air:<ecosystem>:<type>:<source>:<modelId>@<versionSlug>`.
// Only the wan-2.1 14B 480p model is publicly documented for the v2 workflows
// videoGen step right now — it's also the only one Civitai hosts on its own
// hardware (the FAL-hosted engines refuse NSFW content). We keep the other
// recipe slugs in the type for forward compat but route them to the wan-2.1
// recipe under the hood so requests don't 400 on us.
const WAN_2_1: VideoRecipe = {
  workflowTemplate: "wan-image-to-video",
  airUrn: "urn:air:wan:checkpoint:civitai:1@wan-2.1-i2v-14b-480p",
  defaultWidth: 832, defaultHeight: 480, defaultFrames: 81, defaultFps: 16,
  allowsNsfw: true,
};
const VIDEO_RECIPES: Record<VideoEngine, VideoRecipe> = {
  "wan-comfy-2.1": WAN_2_1,
  "wan-fal-2.2":   { ...WAN_2_1, airUrn: "urn:air:wan:checkpoint:civitai:1@wan-2.2-i2v-14b-480p" },
  "wan-fal-2.5":   { ...WAN_2_1, airUrn: "urn:air:wan:checkpoint:civitai:1@wan-2.2-i2v-14b-480p" },
  "kling-2.5":     WAN_2_1, // FAL Kling not yet wired; fall back to WAN
  "vidu-q3":       WAN_2_1, // FAL Vidu not yet wired; fall back to WAN
  "ltx-2":         WAN_2_1, // LTX template not yet wired; fall back to WAN
  "grok-img2vid":  { ...WAN_2_1, allowsNsfw: false }, // xAI Grok via FAL — no NSFW
};

export function getVideoRecipe(engine: VideoEngine): VideoRecipe {
  return VIDEO_RECIPES[engine] || VIDEO_RECIPES["wan-comfy-2.1"];
}

export interface OrchestrationJobResponse {
  token: string;
  jobs: Array<{
    jobId: string;
    cost?: number;
    result?: Array<{
      jobId?: string;
      available?: boolean;
      blobUrl?: string;
      url?: string;
      videoUrl?: string;
      blobKey?: string;
      mediaType?: "image" | "video";
      seed?: number;
    }>;
    scheduled?: boolean;
    /** Raw CivitAI step status — "preparing" = queued, "processing" = executing, terminal values = done/failed */
    stepStatus?: string;
  }>;
}

export interface Img2ImgInput {
  sourceImageUrl: string;
  prompt: string;
  negativePrompt?: string;
  // No longer used for routing — img2img runs on Flux 2 Klein (Civitai-hosted),
  // which is selected by ecosystem, not by a checkpoint AIR URN. Kept optional
  // for backward compatibility with existing callers.
  modelArn?: string;
  baseModel?: string;
  denoiseStrength?: number;
  steps?: number;
  cfgScale?: number;
  scheduler?: string;
  width?: number;
  height?: number;
  seed?: number;
  loras?: Array<{ id: string; strength: number }>;
  /** Klein size tier — "4b" (default, faster) or "9b" (higher fidelity, ~2× cost) */
  kleinVersion?: "4b" | "9b";
}

export interface Img2VidInput {
  sourceImageUrl: string;
  prompt: string;
  negativePrompt?: string;
  engine: VideoEngine;
  durationSeconds?: number;
  fps?: number;
  motionStrength?: number;
  seed?: number;
}

export interface Txt2ImgInput {
  prompt: string;
  negativePrompt?: string;
  modelArn: string;
  baseModel: string;
  /** Checkpoint display name — used to pick the Krea 2 tier and FAL vs comfy path. */
  modelName?: string;
  width?: number;
  height?: number;
  steps?: number;
  cfgScale?: number;
  scheduler?: string;
  clipSkip?: number;
  seed?: number;
  quantity?: number;
  loras?: Array<{ id: string; strength: number }>;
  /** Krea 2 FAL path: aspect ratio string e.g. "1:1", "16:9", "9:16". */
  aspectRatio?: string;
  /** Krea 2 FAL path: creativity level "raw" | "low" | "medium" | "high". */
  creativity?: string;
}

/**
 * Map a stored `baseModel` string to the v2 workflows `ecosystem` discriminator.
 * Only `sd1`, `sdxl`, and `flux1` are valid step discriminators — sending
 * `ecosystem:"pony"` / `"illustrious"` returns 400 "No derived type found for
 * discriminator value". Pony, Illustrious, and NoobAI are all SDXL-architecture
 * checkpoints and MUST submit as `sdxl`.
 */
export function deriveImageEcosystem(
  baseModel: string | null | undefined,
  arn?: string,
): "flux1" | "sdxl" | "sd1" {
  const bm = (baseModel || "").toLowerCase().trim();
  if (bm.includes("flux")) return "flux1";
  if (
    bm.includes("sdxl") ||
    bm.includes("pony") ||
    bm.includes("illustrious") ||
    bm.includes("noob")
  ) {
    return "sdxl";
  }
  // A non-empty baseModel that isn't flux/sdxl is genuinely SD1.5-class.
  if (bm) return "sd1";
  // baseModel is missing/unknown — don't blindly clobber a valid URN ecosystem
  // down to sd1 (that would mis-route or silently wedge an SDXL/Flux model).
  // Trust the URN's own ecosystem segment when it's a valid discriminator.
  const eco = arn?.match(/^urn:air:([^:]+):/)?.[1];
  if (eco === "flux1" || eco === "sdxl" || eco === "sd1") return eco;
  return "sd1";
}

/**
 * Rewrite the ecosystem segment of an AIR URN so it matches the step ecosystem.
 * Stored URNs are almost all `urn:air:sd1:...` regardless of the real
 * architecture (the v1 SDK tolerated the mismatch because `baseModel` was sent
 * separately). v2 silently wedges a job forever when the URN ecosystem doesn't
 * match the step `ecosystem`, so we always re-derive the prefix at submit time.
 */
export function rewriteArnEcosystem(arn: string, ecosystem: string): string {
  return arn.replace(/^urn:air:[^:]+:/, `urn:air:${ecosystem}:`);
}

/**
 * Map a UI scheduler name to the SdCpp `sampleMethod` + `schedule` enums.
 * SdCpp only supports a subset of samplers (euler, euler_a, heun, dpm2, lcm);
 * the dpmpp_* / uni_pc / ddim / lms families are comfy-only and 400 on sdcpp,
 * so anything unrecognized falls back to `euler`. A `karras` / `exponential`
 * suffix in the name maps to the matching `schedule` enum; otherwise we use the
 * ecosystem default (`simple` for flux1, `discrete` for sdxl/sd1).
 */
function mapSchedulerToSdCpp(
  uiScheduler: string | undefined,
  ecosystem: string,
): { sampleMethod: string; schedule: string } {
  const s = (uiScheduler || "").toLowerCase();
  let sampleMethod = "euler";
  if (s.includes("euler a") || s.includes("euler_a")) sampleMethod = "euler_a";
  else if (s.includes("euler")) sampleMethod = "euler";
  else if (s.includes("heun")) sampleMethod = "heun";
  else if (s.includes("lcm")) sampleMethod = "lcm";
  else if (s.includes("dpm2")) sampleMethod = "dpm2";

  let schedule = ecosystem === "flux1" ? "simple" : "discrete";
  if (s.includes("karras")) schedule = "karras";
  else if (s.includes("exponential")) schedule = "exponential";
  return { sampleMethod, schedule };
}

/** Clamp a dimension to the [lo, hi] band and round to the nearest multiple of 16. */
function roundDimensionTo16(n: number | undefined, lo: number, hi: number): number {
  const v = n ?? 1024;
  const rounded = Math.round(v / 16) * 16;
  return Math.max(lo, Math.min(hi, rounded));
}

export interface OrchestrationSubmitResult {
  token: string;
  jobId: string;
  cost: number;
}

export class CivitAIOrchestrationService {
  private platformKey: string | undefined;

  constructor() {
    this.platformKey = process.env.CIVITAI_API_KEY;
  }

  private resolveKey(userApiKey?: string): string {
    const k = userApiKey || this.platformKey;
    if (!k) {
      throw new Error(
        "CivitAI API key required for transform (set CIVITAI_API_KEY or provide a user key)"
      );
    }
    return k;
  }

  /**
   * Upload a source image to CivitAI's blob storage and return the canonical
   * blob URL. CivitAI's orchestration is strict about `sourceImage` for some
   * model families (notably Flux) — it 500s on arbitrary external URLs and
   * only accepts URLs hosted on its own blob CDN.
   */
  private async uploadSourceImageToCivitAI(
    externalUrl: string,
    userApiKey?: string
  ): Promise<string> {
    const key = this.resolveKey(userApiKey);

    // SSRF guard: block non-HTTPS schemes and RFC-1918/loopback/link-local
    // addresses so an authenticated user cannot coerce us into proxying private
    // infrastructure. We accept any publicly-routable HTTPS hostname, enabling
    // external API consumers to pass arbitrary CDN or storage URLs without
    // needing a pre-signed upload step.
    let parsed: URL;
    try {
      parsed = new URL(externalUrl);
    } catch {
      throw new Error("Invalid source image URL");
    }
    if (parsed.protocol !== "https:") {
      throw new Error("Source image URL must use HTTPS");
    }
    const h = parsed.hostname.toLowerCase();
    const PRIVATE_PATTERNS = [
      /^localhost$/,
      /^127\./,
      /^0\.0\.0\.0$/,
      /^\[?::1\]?$/,
      /^10\./,
      /^192\.168\./,
      /^172\.(1[6-9]|2\d|3[01])\./,
      /^169\.254\./,
      /^fc[0-9a-f]{2}:/i,
      /^fd[0-9a-f]{2}:/i,
      /^fe80:/i,
    ];
    if (PRIVATE_PATTERNS.some(re => re.test(h))) {
      throw new Error(`Source image URL targets a private/reserved address: ${h}`);
    }
    // DNS-level private IP guard: resolve the hostname and reject if it maps to
    // any private/loopback/reserved range. This blocks DNS rebinding and internal
    // hostnames (e.g. "internal.corp.example.com" → 10.x.x.x).
    try {
      const { address } = await dns.lookup(parsed.hostname);
      const PRIVATE_IP_RE = [
        /^127\./,
        /^0\.0\.0\.0$/,
        /^10\./,
        /^192\.168\./,
        /^172\.(1[6-9]|2\d|3[01])\./,
        /^169\.254\./,
        /^::1$/,
        /^fc[0-9a-f]{2}:/i,
        /^fd[0-9a-f]{2}:/i,
        /^fe80:/i,
      ];
      if (PRIVATE_IP_RE.some(re => re.test(address))) {
        throw new Error(`Source image URL resolves to a private IP: ${address}`);
      }
    } catch (dnsErr: any) {
      if (dnsErr.message?.includes("private IP") || dnsErr.message?.includes("private/reserved")) {
        throw dnsErr;
      }
      // DNS lookup failure (no such host) → block it
      throw new Error(`Source image URL hostname could not be resolved: ${parsed.hostname}`);
    }

    // Fetch the user-uploaded image from our storage.
    // `redirect: 'error'` prevents HTTP redirects from re-routing the request
    // to a different host and bypassing the SSRF host/IP checks above.
    const fetchRes = await fetch(externalUrl, { redirect: "error" });
    if (!fetchRes.ok) {
      throw new Error(`Failed to fetch source image (${fetchRes.status})`);
    }
    // Normalise content-type: GCS signed URLs may return application/octet-stream
    // for uploads that lacked an explicit type. CivitAI's blob endpoint accepts
    // image/* types — coerce to image/jpeg when the type is generic.
    const rawContentType = fetchRes.headers.get("content-type") || "";
    const contentType = rawContentType.startsWith("image/")
      ? rawContentType.split(";")[0].trim()
      : "image/jpeg";
    const buf = Buffer.from(await fetchRes.arrayBuffer());
    logger.info(`📥 Fetched source image: ${buf.length} bytes, content-type: ${contentType}`);

    // Push it into CivitAI's blob store. Their blob endpoint intermittently
    // returns 5xx (often with an empty body) under load, same as the workflows
    // endpoint — a bounded retry is safe because a failed upload creates nothing.
    const MAX_UPLOAD_ATTEMPTS = 3;
    let upRes!: Response;
    let upText = "";
    for (let attempt = 1; attempt <= MAX_UPLOAD_ATTEMPTS; attempt++) {
      upRes = await fetch(`${ORCHESTRATION_BASE}/v2/consumer/blobs`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": contentType,
        },
        body: buf,
      });
      upText = await upRes.text();
      if (upRes.ok || upRes.status < 500) break;
      logger.warn(
        `⚠️ CivitAI blob upload attempt ${attempt}/${MAX_UPLOAD_ATTEMPTS} failed with ${upRes.status} — ${attempt < MAX_UPLOAD_ATTEMPTS ? "retrying" : "giving up"}`
      );
      if (attempt < MAX_UPLOAD_ATTEMPTS) {
        await new Promise(r => setTimeout(r, 1000 * attempt));
      }
    }
    if (!upRes.ok) {
      throw new Error(`CivitAI blob upload failed ${upRes.status}: ${upText.slice(0, 200)}`);
    }
    let upBody: any;
    try {
      upBody = JSON.parse(upText);
    } catch {
      throw new Error("Invalid JSON from CivitAI blob upload");
    }
    const blobUrl =
      upBody.url ||
      (upBody.id ? `${ORCHESTRATION_BASE}/v2/consumer/blobs/${upBody.id}` : null);
    if (!blobUrl) {
      throw new Error("CivitAI blob upload returned no url/id");
    }
    logger.info(`📤 Re-hosted source image on CivitAI blob: ${blobUrl}`);
    return blobUrl;
  }

  /**
   * Shared POST to the v2 workflows endpoint. Both img2img and img2vid live
   * here — the legacy v1 jobs endpoint doesn't support img2img on Flux and
   * doesn't know `videoGen` at all.
   */
  private async submitWorkflow(
    body: any,
    label: string,
    userApiKey?: string
  ): Promise<OrchestrationSubmitResult> {
    const key = this.resolveKey(userApiKey);
    const url = `${ORCHESTRATION_BASE}/v2/consumer/workflows`;
    logger.info(`🎬 Workflow POST ${url} (${label})`);

    // CivitAI's orchestration endpoint intermittently returns 5xx (often with an
    // empty body) under load. A 5xx never returns a workflow id, so no trackable
    // job is created and no Buzz is charged — making a bounded retry safe and a
    // big reliability win. 4xx responses (e.g. content-policy blocks) are NOT
    // retried because the same request will keep failing.
    const MAX_ATTEMPTS = 3;
    let res!: Response;
    let text = "";
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      res = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      text = await res.text();
      if (res.ok || res.status < 500) break;
      logger.error(
        `❌ Workflow submit ${res.status} (attempt ${attempt}/${MAX_ATTEMPTS}): ${text.slice(0, 300)}`
      );
      if (attempt < MAX_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, 1500 * attempt));
      }
    }

    if (!res.ok) {
      logger.error(`❌ Workflow submit ${res.status}: ${text.slice(0, 600)}`);
      if (res.status >= 500) {
        throw new Error(`CivitAI is temporarily unavailable (HTTP ${res.status}). Please try again in a moment.`);
      }
      // Surface CivitAI's content-moderation / validation rejections as a clear,
      // user-actionable message instead of raw JSON. On a blocked prompt CivitAI
      // returns 400 { errors: { messages: ["Prompt blocked as it may violate TOS"] } }.
      let civitaiMessages: string[] = [];
      try {
        const parsed = JSON.parse(text);
        const msgs = parsed?.errors?.messages;
        if (Array.isArray(msgs)) {
          civitaiMessages = msgs.filter((m: any) => typeof m === "string");
        }
      } catch { /* non-JSON error body — fall through to generic message */ }
      const isContentBlock = civitaiMessages.some((m) =>
        /violate\s*tos|blocked|content policy|prohibited|not allowed/i.test(m)
      );
      if (isContentBlock) {
        throw new Error(
          `CivitAI rejected this prompt under its content policy (${civitaiMessages.join("; ")}). ` +
          `Edit the prompt to remove disallowed terms and try again.`
        );
      }
      if (civitaiMessages.length) {
        throw new Error(`CivitAI rejected this request: ${civitaiMessages.join("; ")}`);
      }
      throw new Error(`CivitAI workflow error ${res.status}: ${text.slice(0, 400)}`);
    }
    let wf: any;
    try { wf = JSON.parse(text); } catch {
      throw new Error("Invalid JSON from CivitAI workflow submit");
    }
    const id = wf.id || wf.token || wf.workflowId;
    if (!id) throw new Error("CivitAI workflow returned no id");
    const cost = wf.cost || wf.steps?.[0]?.cost || 0;
    return { token: id, jobId: id, cost };
  }

  async submitImg2Img(input: Img2ImgInput, userApiKey?: string): Promise<OrchestrationSubmitResult> {
    // Img2img runs on Flux 2 "Klein" via the SdCpp `createVariant` operation
    // (ecosystem: "flux2Klein"). Klein is Black Forest Labs' default Flux 2
    // variant, hosted on Civitai's own infra — so img2img works for ANY user
    // regardless of which checkpoint they picked. The selected checkpoint URN is
    // NOT used here (Klein is selected by ecosystem, not a model AIR URN), which
    // removes the old "you must pick a Flux.1 checkpoint" restriction that broke
    // img2img for almost everyone. createVariant is strength-weighted img2img:
    // `image` (a SINGLE source URL) + `strength` (0 = keep source unchanged,
    // 1 = discard it entirely; 0.6–0.8 keeps composition while changing style).
    // It's also half the cost of the instruction-based `editImage` operation.

    // Re-host the source image on CivitAI's blob CDN (the engine refuses
    // arbitrary external URLs).
    const civitaiBlobUrl = await this.uploadSourceImageToCivitAI(
      input.sourceImageUrl,
      userApiKey
    );

    // Flux 2 Klein LoRAs are a map of AIR URN → strength (a NUMBER). Note these
    // must be flux2 LoRAs; checkpoint-ecosystem LoRAs (sd1/sdxl/flux1) don't
    // apply to Klein. The Transform callers don't pass LoRAs today, so this is
    // usually empty.
    const loras: Record<string, number> = {};
    if (input.loras) {
      for (const lora of input.loras) {
        loras[lora.id] = lora.strength;
      }
    }

    // Klein safe bands (per the Flux 2 recipe): cfgScale 1–20 (sweet spot 4–6,
    // default 5), steps 4–50 (default 20). strength 0–1 (0.6–0.8 sweet spot).
    const cfgScale = Math.max(1, Math.min(input.cfgScale ?? 5, 20));
    const steps = Math.max(4, Math.min(input.steps ?? 20, 50));
    const strength = Math.max(0, Math.min(input.denoiseStrength ?? 0.7, 1));
    const width = roundDimensionTo16(input.width, 512, 1536);
    const height = roundDimensionTo16(input.height, 512, 1536);

    const stepInput: any = {
      engine: "sdcpp",
      ecosystem: "flux2Klein",
      operation: "createVariant",            // strength-weighted img2img on Klein
      modelVersion: input.kleinVersion ?? "4b", // "4b" standard or "9b" high-fidelity
      prompt: input.prompt,
      negativePrompt: input.negativePrompt || "",
      width,
      height,
      cfgScale,
      steps,
      sampleMethod: "euler",                 // recipe default; SdCppSampleMethod enum
      schedule: "simple",                    // recipe default; "normal"/"beta" are REJECTED
      // createVariant takes a SINGLE source URL in `image` (string) + `strength`.
      // This is distinct from `editImage`, which uses `images: [url]` + no
      // strength. Sending the wrong field name is silently dropped and the engine
      // generates from noise.
      image: civitaiBlobUrl,
      strength,
      quantity: 1,
      outputFormat: "jpeg",
      loras,
    };
    // seed is UInt32? — must be omitted (or a positive uint) — -1 is rejected.
    if (input.seed && input.seed > 0) stepInput.seed = input.seed;

    return this.submitWorkflow(
      {
        workflowTemplate: "img2img",         // required field; any non-empty string accepted
        tags: ["image", "image-to-image", "flux2-klein"],
        steps: [{ $type: "imageGen", input: stepInput }],
      },
      `imageGen/createVariant flux2Klein strength=${strength}`,
      userApiKey
    );
  }

  /**
   * Submit a text-to-image job via CivitAI's v2 workflows API
   * (`operation: "createImage"`). This replaces the legacy v1 SDK
   * `image.fromText` path so txt2img shares the same v2 surface as img2img /
   * img2vid. Returns a workflow ID treated as a token by the BatchPoller
   * (polled via `getWorkflowStatus`). Caller is responsible for prompt
   * sanitization before calling.
   */
  async submitTxt2Img(input: Txt2ImgInput, userApiKey?: string): Promise<OrchestrationSubmitResult> {
    // Krea 2 routes to one of two paths:
    //  • FAL  (engine:"fal")   — base Krea 2, no LoRAs, uses aspectRatio+creativity
    //  • Comfy (engine:"comfy") — community checkpoints with LoRAs (rly*, turbo tiers)
    // Routing signal: presence of LoRAs → comfy; otherwise → FAL.
    const bmLower = (input.baseModel || "").toLowerCase();
    if (bmLower.includes("krea")) {
      // Routing rules:
      //  • "Krea 2 Turbo" baseModel → always comfy (community checkpoint, supports LoRAs)
      //  • Base "KREA 2" + LoRAs selected → comfy (FAL endpoint has no LoRA support)
      //  • Base "KREA 2" + no LoRAs → FAL (fast path with aspectRatio/creativity)
      const isTurbo = bmLower.includes("turbo");
      const hasLoras = (input.loras ?? []).length > 0;
      if (isTurbo || hasLoras) {
        return this.submitKrea2ComfyTxt2Img(input, userApiKey);
      }
      return this.submitKrea2FalTxt2Img(input, userApiKey);
    }
    const ecosystem = deriveImageEcosystem(input.baseModel, input.modelArn);
    const isFlux = ecosystem === "flux1";
    if (!input.baseModel || !input.baseModel.trim()) {
      logger.warn(`⚠️ txt2img: empty baseModel — derived ecosystem=${ecosystem} from URN ${input.modelArn}`);
    }

    // Re-derive the URN ecosystem prefix from the live baseModel — stored URNs
    // are almost all `urn:air:sd1:...` regardless of architecture and v2 wedges
    // silently when the URN ecosystem doesn't match the step ecosystem.
    const modelArn = rewriteArnEcosystem(input.modelArn, ecosystem);
    if (modelArn !== input.modelArn) {
      logger.info(`🔧 txt2img URN rewrite: ${input.modelArn} → ${modelArn} (baseModel="${input.baseModel}", ecosystem=${ecosystem})`);
    }

    // LoRAs for createImage are a map of AIR-URN → strength (a NUMBER). The
    // `{ strength }` object form used by editImage is REJECTED here. Rewrite
    // each LoRA's ecosystem prefix to match the step ecosystem too.
    const loras: Record<string, number> = {};
    if (input.loras) {
      for (const lora of input.loras) {
        loras[rewriteArnEcosystem(lora.id, ecosystem)] = lora.strength;
      }
    }

    const { sampleMethod, schedule } = mapSchedulerToSdCpp(input.scheduler, ecosystem);

    // Per-ecosystem safe param bands. Flux.1 diverges to pure noise outside
    // CFG 1.0–4.5 / steps ≥20; SDXL & SD1 use the broad SD band. Dimensions
    // are clamped + rounded to a multiple of 16 (the documented constraint;
    // flux1 is additionally limited to 832–1216).
    const steps = isFlux
      ? Math.max(20, Math.min(input.steps ?? 28, 50))
      : Math.max(1, Math.min(input.steps ?? 30, 200));
    const cfgScale = isFlux
      ? Math.max(1.0, Math.min(input.cfgScale ?? 3.5, 4.5))
      : Math.max(1, Math.min(input.cfgScale ?? 7, 20));
    const width = roundDimensionTo16(input.width, isFlux ? 832 : 512, isFlux ? 1216 : 2048);
    const height = roundDimensionTo16(input.height, isFlux ? 832 : 512, isFlux ? 1216 : 2048);
    const quantity = Math.max(1, Math.min(input.quantity ?? 1, isFlux ? 4 : 12));

    const stepInput: any = {
      engine: "sdcpp",
      ecosystem,
      operation: "createImage",
      prompt: input.prompt,
      negativePrompt: input.negativePrompt || "",
      width,
      height,
      cfgScale,
      steps,
      sampleMethod,
      schedule,
      quantity,
      loras,
    };
    // Flux uses `diffuserModel`; every other ecosystem uses `model`.
    if (isFlux) stepInput.diffuserModel = modelArn;
    else stepInput.model = modelArn;
    // clipSkip is SD1-only — SDXL & Flux 400 on it.
    if (ecosystem === "sd1" && input.clipSkip) {
      stepInput.clipSkip = Math.max(1, Math.min(input.clipSkip, 12));
    }
    // seed is UInt32? — omit when random (-1 / 0 are rejected).
    if (input.seed && input.seed > 0) stepInput.seed = input.seed;

    return this.submitWorkflow(
      {
        workflowTemplate: "txt2img",
        tags: ["image", "text-to-image", input.baseModel || ecosystem],
        steps: [{ $type: "imageGen", input: stepInput }],
      },
      `imageGen/createImage base=${input.baseModel} eco=${ecosystem}`,
      userApiKey
    );
  }

  /**
   * Krea 2 base model via CivitAI's FAL-backed endpoint.
   * Documented at https://developer.civitai.com/orchestration/recipes/krea
   * Key constraints:
   *  – engine:"fal", model:"krea2", size:"medium"|"large"
   *  – Uses aspectRatio (not width/height), creativity (not steps/cfg)
   *  – Does NOT accept LoRAs, negativePrompt, steps, cfgScale, scheduler, clipSkip
   *  – quantity fans out to parallel FAL calls (max 10)
   */
  private async submitKrea2FalTxt2Img(
    input: Txt2ImgInput,
    userApiKey?: string
  ): Promise<OrchestrationSubmitResult> {
    const nmLower = (input.modelName || "").toLowerCase();
    const size = nmLower.includes("large") ? "large" : "medium";

    // aspectRatio must be one of the documented values; default 1:1
    const VALID_RATIOS = ["1:1","4:3","3:2","16:9","2.35:1","4:5","2:3","9:16"];
    const aspectRatio = VALID_RATIOS.includes(input.aspectRatio ?? "")
      ? input.aspectRatio!
      : "1:1";

    const VALID_CREATIVITY = ["raw","low","medium","high"];
    const creativity = VALID_CREATIVITY.includes(input.creativity ?? "")
      ? input.creativity!
      : "medium";

    const stepInput: any = {
      engine: "fal",
      model: "krea2",
      operation: "createImage",
      size,
      prompt: input.prompt,
      aspectRatio,
      creativity,
      quantity: Math.max(1, Math.min(input.quantity ?? 1, 10)),
    };
    if (input.seed && input.seed > 0) stepInput.seed = input.seed;

    logger.info(`🎨 Krea 2 FAL path: size=${size} aspectRatio=${aspectRatio} creativity=${creativity}`);
    return this.submitWorkflow(
      {
        workflowTemplate: "txt2img",
        tags: ["image", "text-to-image", "Krea 2"],
        steps: [{ $type: "imageGen", input: stepInput }],
      },
      `imageGen/createImage base=Krea2 engine=fal size=${size}`,
      userApiKey
    );
  }

  /**
   * Krea 2 community checkpoints via the comfy engine.
   * Used when LoRAs are selected (rly* checkpoints, turbo community models).
   * Tier mapping (aligns with ComfyUI Krea2ImageNode docs):
   *  "turbo" in name → model:"turbo"  (~18 Buzz/img, steps 1-12, cfg 0-2)
   *  "large"  in name → model:"large"  (higher quality)
   *  otherwise        → model:"medium" (default community tier)
   */
  private async submitKrea2ComfyTxt2Img(
    input: Txt2ImgInput,
    userApiKey?: string
  ): Promise<OrchestrationSubmitResult> {
    const nmLower = (input.modelName || "").toLowerCase();
    const isTurbo = nmLower.includes("turbo");
    const isLarge = nmLower.includes("large");
    const tier = isTurbo ? "turbo" : isLarge ? "large" : "medium";

    const steps = isTurbo
      ? Math.max(1, Math.min(input.steps ?? 8, 12))
      : Math.max(1, Math.min(input.steps ?? 28, 100));
    const cfgScale = isTurbo
      ? Math.max(0, Math.min(input.cfgScale ?? 1, 2))
      : Math.max(1, Math.min(input.cfgScale ?? 4, 10));
    const width = roundDimensionTo16(input.width, 512, 2048);
    const height = roundDimensionTo16(input.height, 512, 2048);

    const loras: Record<string, number> = {};
    if (input.loras) {
      for (const lora of input.loras) {
        loras[rewriteArnEcosystem(lora.id, "krea2")] = lora.strength;
      }
    }

    const stepInput: any = {
      engine: "comfy",
      ecosystem: "krea2",
      model: tier,
      operation: "createImage",
      prompt: input.prompt,
      negativePrompt: input.negativePrompt || "",
      width,
      height,
      steps,
      cfgScale,
      sampler: "euler",
      scheduler: "simple",
      quantity: Math.max(1, Math.min(input.quantity ?? 1, 12)),
      loras,
      diffusionModel: rewriteArnEcosystem(input.modelArn, "krea2"),
    };
    if (input.seed && input.seed > 0) stepInput.seed = input.seed;

    logger.info(`🎨 Krea 2 comfy path: tier=${tier} steps=${steps} cfg=${cfgScale} loras=${Object.keys(loras).length}`);
    return this.submitWorkflow(
      {
        workflowTemplate: "txt2img",
        tags: ["image", "text-to-image", "Krea 2"],
        steps: [{ $type: "imageGen", input: stepInput }],
      },
      `imageGen/createImage base=Krea2 engine=comfy tier=${tier}`,
      userApiKey
    );
  }

  /**
   * Submit an image-to-video job via CivitAI's v2 workflows API using the
   * documented `videoGen` recipe (engine/version/provider/operation keys).
   * Returns a workflow ID treated as a token by the poller.
   */
  async submitImg2Vid(input: Img2VidInput, userApiKey?: string): Promise<OrchestrationSubmitResult> {
    // Re-host source image on CivitAI's blob CDN — required for video.
    const sourceBlobUrl = await this.uploadSourceImageToCivitAI(
      input.sourceImageUrl,
      userApiKey
    );

    const duration = Math.max(1, Math.min(8, Math.round(input.durationSeconds ?? 5)));

    // --- Grok video (xAI Grok-Imagine-Video via FAL) ---
    // Docs: https://developer.civitai.com/orchestration/recipes/grok-video
    // No `version` or `provider` keys — just `engine:"grok"`.
    // No `negativePrompt` field (FAL-backed, ignores it).
    // Aspect ratio inferred from source image when `aspectRatio:"auto"`.
    // Typical runtime: 1–4 min. Content-policy blocks return `reason:"blocked"`.
    if (input.engine === "grok-img2vid") {
      const grokInput: any = {
        engine: "grok",
        operation: "image-to-video",
        images: [sourceBlobUrl],
        prompt: input.prompt,
        resolution: "720p",
        duration,
        aspectRatio: "auto",
      };
      return this.submitWorkflow(
        {
          tags: ["video", "image-to-video", "grok"],
          steps: [{ $type: "videoGen", input: grokInput }],
        },
        `videoGen grok img2vid ${duration}s`,
        userApiKey
      );
    }

    // --- WAN image-to-video via the documented `videoGen` recipe ---
    // Docs default: version:"v2.6", provider:"fal" — higher capacity, lower cost
    // (~650 Buzz/5 s vs v2.2 comfy's expensive per-pixel formula).
    // The v2.2/comfy path has very limited worker capacity and causes jobs to sit
    // in "scheduled" state indefinitely (docs: error.code="no_provider").
    //
    // IMPORTANT: the legacy request shape (`operation: "imageToVideo"` + a raw
    // model AIR-URN + `numFrames`/`sourceImage`) is not a recognized schema, so
    // the orchestrator falls back to a per-pixel price (~250 × width × height ≈
    // 100,000,000 Buzz) and the submit fails with `insufficientBuzz`. The
    // documented shape below prices ~130 Buzz/sec at 720p via fal.
    //
    // NOTE on NSFW: fal may reject explicit prompts at generation time. The caller
    // in transform.ts catches submit errors and surfaces them immediately, so the
    // user gets a clear message rather than a 35-minute timeout.
    const stepInput: any = {
      engine: "wan",
      version: "v2.6",
      provider: "fal",
      operation: "image-to-video",
      images: [sourceBlobUrl],
      prompt: input.prompt,
      // fal does not accept negativePrompt — omit it to avoid a 400 unknown-field error.
      resolution: "720p",
      duration,
    };
    if (input.seed && input.seed > 0) stepInput.seed = input.seed;

    return this.submitWorkflow(
      {
        tags: ["video", "image-to-video"],
        steps: [{ $type: "videoGen", input: stepInput }],
      },
      `videoGen wan v2.6 fal ${duration}s`,
      userApiKey
    );
  }

  /**
   * Poll a v2 workflow and return a status object in the same shape the
   * BatchPoller expects from `getJobStatus`. We translate workflow steps
   * (and their per-step `output.images`/`output.videos`) into the legacy
   * `{ jobs: [{ result: [...] }] }` envelope so the existing poller can
   * consume video results without forking.
   */
  async getWorkflowStatus(workflowId: string, userApiKey?: string): Promise<OrchestrationJobResponse> {
    const key = this.resolveKey(userApiKey);
    const url = `${ORCHESTRATION_BASE}/v2/consumer/workflows/${encodeURIComponent(workflowId)}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${key}` } });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`Workflow status ${res.status}: ${text.slice(0, 300)}`);
    }
    let wf: any;
    try { wf = JSON.parse(text); } catch {
      throw new Error("Invalid JSON from workflow status");
    }

    const step = wf.steps?.[0] || {};
    const stepStatus: string = step.status || wf.status || "processing";
    const terminal = ["succeeded", "failed", "expired", "canceled"].includes(stepStatus);

    // Log status transitions to aid debugging.
    logger.info(`🎬 Workflow ${workflowId.substring(0, 20)} step status: ${stepStatus} (terminal: ${terminal})`);

    // Collect any media artifacts the step produced.
    // Per the WAN docs the success response is:
    //   "output": { "video": { "id": "blob_...", "url": "https://.../signed.mp4" } }
    // i.e. a SINGLE `video` object — NOT an array. Promote that to primary and
    // keep `videos[]` / `outputs[]` as fallbacks for any legacy/alternative shapes.
    const media: any[] = [];
    const outImages = step.output?.images || [];
    // Primary: singular `video` object (documented v2.6 shape)
    // Fallbacks: `videos[]` array, `outputs[]` array, `files[]` array
    const rawVideoOut = step.output?.video
      ? [step.output.video]
      : step.output?.videos
      || step.output?.outputs
      || step.output?.files
      || [];
    const outVideos: any[] = Array.isArray(rawVideoOut) ? rawVideoOut : (rawVideoOut ? [rawVideoOut] : []);

    // In the v2 workflows API, output.images/videos only appear once the step
    // has produced them — the signed `url` IS the ready blob. The legacy v1
    // `available` boolean is not present, so URL presence is the readiness
    // signal. Only treat as unavailable if the upstream explicitly says so.
    //
    // NOTE: Krea 2 FAL (engine:"fal", model:"krea2") returns images with
    // `previewUrl` instead of `url` — confirmed via production logs. The same
    // pattern may apply to other FAL-backed models. Always prefer `url` but
    // fall back to `previewUrl` so these images aren't silently dropped.
    for (const img of outImages) {
      const imgUrl = img.url || img.previewUrl;
      media.push({
        blobKey: img.id || img.blobKey || imgUrl,
        blobUrl: imgUrl,
        url: imgUrl,
        available: !!imgUrl && img.available !== false,
        seed: img.seed,
        mediaType: "image" as const,
      });
    }
    for (const vid of outVideos) {
      const vidUrl = vid.url || vid.videoUrl;
      media.push({
        blobKey: vid.id || vid.blobKey || vidUrl,
        videoUrl: vidUrl,
        url: vidUrl,
        available: !!vidUrl && vid.available !== false,
        seed: vid.seed,
        mediaType: "video" as const,
      });
    }

    // If terminal-failed, log the CivitAI error reason and decide whether to
    // salvage any images that were produced before the failure.
    //
    // Background: Krea 2 FAL (and possibly other FAL-backed models) occasionally
    // reports step.status = "failed" with NO error detail while step.output.images
    // contains a fully-generated image (1024×1024, previewUrl populated). This
    // happens for transient infra / rate-limit failures where FAL completed the
    // generation but couldn't finalise the job. Salvaging these images lets the
    // user get a result instead of seeing a silent error.
    //
    // We do NOT salvage when:
    //  • The error reason mentions a content-policy block (no deliverable image)
    //  • The step status is "expired" or "canceled" (user-initiated or timed out)
    //  • No images were collected (nothing to salvage)
    if (stepStatus === "failed" || stepStatus === "expired" || stepStatus === "canceled") {
      const errReason =
        step.error ||
        step.failureReason ||
        step.errorMessage ||
        wf.error ||
        wf.failureReason ||
        wf.errorMessage ||
        step.output?.error ||
        null;

      // Salvage: failed step with output images and no known content block.
      // Only attempt on "failed" (not expired/canceled) to avoid delivering
      // half-finished or user-aborted jobs.
      const salvagableImages = media.filter(m => m.mediaType === "image" && m.url);
      const isContentBlock = errReason != null &&
        /violate|blocked|content.policy|prohibited|not.allowed|nsfw|adult|explicit/i.test(errReason);
      if (stepStatus === "failed" && salvagableImages.length > 0 && !isContentBlock) {
        // Log per-image URL origin to aid TTL/availability diagnosis.
        // Krea 2 FAL images come back with previewUrl instead of url;
        // both are blob CDN URLs but knowing which field was used helps
        // identify if TTL-related 404s start appearing in downloads.
        for (const img of outImages) {
          const origin = img.url ? "url" : img.previewUrl ? "previewUrl" : "none";
          logger.warn(
            `⚠️ Salvageable image: origin=${origin} url=${(img.url || img.previewUrl || "").substring(0, 80)}`
          );
        }
        logger.warn(
          `⚠️ CivitAI workflow ${workflowId.substring(0, 20)} status=failed but produced ` +
          `${salvagableImages.length} image(s) — salvaging (errReason=${errReason ?? "none"})`
        );
        // Force available:true on every salvaged image. The salvage path has already
        // confirmed m.url is populated (the filter above). CivitAI's v2 API permanently
        // returns available:false on FAL blobs even when their URLs are live; if we pass
        // through that flag, the BatchPoller's isResultReady check will be false for every
        // salvaged image and — because scheduled:false — the 30-second dead-output timer
        // will fire before the every-10-attempts HEAD probe can override it, causing the
        // salvaged image to be silently discarded instead of downloaded and stored.
        return {
          token: workflowId,
          jobs: [{
            jobId: workflowId,
            cost: wf.cost || 0,
            result: salvagableImages.map(m => ({ ...m, available: true })),
            scheduled: false,
            stepStatus,
          }],
        };
      }

      // Log the full step body to aid diagnosis (trim very long blobs).
      const stepSnapshot = JSON.stringify(step).slice(0, 800);
      logger.error(
        `❌ CivitAI workflow ${workflowId.substring(0, 20)} ${stepStatus}: ` +
        `${errReason ?? "(no error detail in step/wf fields)"} | step=${stepSnapshot}`
      );
      // Omit `result` (not just empty-array it) — the BatchPoller's terminal-
      // failure detector checks `!jobs[0].result`, so an empty array would
      // be truthy and the poller would never give up.
      return {
        token: workflowId,
        jobs: [{ jobId: workflowId, cost: wf.cost || 0, scheduled: false, stepStatus }],
      };
    }

    return {
      token: workflowId,
      jobs: [{
        jobId: workflowId,
        cost: wf.cost || 0,
        result: media,
        scheduled: !terminal,
        stepStatus,
      }],
    };
  }

}

export const civitaiOrchestration = new CivitAIOrchestrationService();
