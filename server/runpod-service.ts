/**
 * RunPod Serverless API service for image generation.
 *
 * Submits jobs to a RunPod Serverless endpoint (e.g. a ComfyUI worker) via:
 *   POST  https://api.runpod.io/v2/{endpointId}/run
 *   GET   https://api.runpod.io/v2/{endpointId}/status/{jobId}
 *   GET   https://api.runpod.io/v2/{endpointId}/health
 *
 * Input schema sent to the endpoint is the common simplified diffusion-model
 * format. The endpoint-side worker is expected to accept these fields directly
 * (or a ComfyUI wrapper that translates them). LoRAs are forwarded as-is for
 * endpoints that support them.
 *
 * Output is normalised from multiple common RunPod output shapes:
 *   - { images: ["https://..."], seeds: [12345] }
 *   - { image: "https://...", seed: 12345 }
 *   - ["https://..."]
 *   - "https://..."
 *   - [{ url: "..." }]
 *
 * Credentials are loaded from platform settings (runpod_api_key and
 * runpod_endpoint_id), falling back to RUNPOD_API_KEY / RUNPOD_ENDPOINT_ID
 * environment variables. Pass explicit values to the constructor to override.
 */

import { logger } from "./logger";

const RUNPOD_API_BASE = "https://api.runpod.io/v2";

export interface RunPodGenerationRequest {
  prompt: string;
  negativePrompt?: string;
  width: number;
  height: number;
  steps: number;
  cfgScale: number;
  scheduler?: string;
  clipSkip?: number;
  seed?: number;
  /**
   * Resolved LoRAs — each entry carries either a Network Volume path or a
   * CivitAI download URL (plus the human-readable model name for worker logs).
   * Raw internal DB IDs are NOT accepted here; use resolveRunPodLoRAs() first.
   */
  loras?: Array<{ url?: string; path?: string; strength: number; name?: string }>;
}

export type RunPodJobStatusCode =
  | "IN_QUEUE"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED"
  | "TIMED_OUT";

export interface RunPodJobResult {
  jobId: string;
  status: RunPodJobStatusCode;
  imageUrls?: string[];
  seed?: number;
  error?: string;
  /**
   * True when the endpoint returned base64-encoded images (data: URIs) instead
   * of HTTPS URLs.  The poller surfaces this as a user-friendly error since
   * base64 payloads cannot be stored via the existing processIndividualImage
   * path.  The fix is to configure the RunPod endpoint to upload images to an
   * external CDN/S3 bucket and return HTTPS URLs.
   */
  hasBase64Images?: boolean;
}

export class RunPodService {
  private apiKey: string;
  private endpointId: string;

  constructor(apiKey?: string, endpointId?: string) {
    this.apiKey = apiKey || process.env.RUNPOD_API_KEY || "";
    this.endpointId = endpointId || process.env.RUNPOD_ENDPOINT_ID || "";
  }

  isAvailable(): boolean {
    return !!(this.apiKey && this.endpointId);
  }

  /**
   * Submit one generation job and return the RunPod job ID.
   */
  async submitJob(request: RunPodGenerationRequest): Promise<{ jobId: string }> {
    if (!this.isAvailable()) {
      throw new Error(
        "RunPod API key and endpoint ID must both be configured before submitting jobs."
      );
    }

    const input: Record<string, any> = {
      prompt: request.prompt,
      negative_prompt: request.negativePrompt || "",
      width: Math.max(64, Math.min(2048, request.width)),
      height: Math.max(64, Math.min(2048, request.height)),
      steps: Math.max(1, Math.min(150, request.steps)),
      cfg_scale: Math.max(1, Math.min(30, request.cfgScale)),
      scheduler: request.scheduler || "Euler",
      clip_skip: request.clipSkip ?? 2,
      seed: request.seed ?? -1,
    };

    if (request.loras && request.loras.length > 0) {
      input.loras = request.loras;
    }

    const url = `${RUNPOD_API_BASE}/${this.endpointId}/run`;
    logger.info(`🟣 [RunPod] Submitting job to ${url}`);

    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ input }),
    });

    const text = await res.text();

    if (!res.ok) {
      if (res.status === 401) {
        throw new Error("RunPod API key is invalid or expired.");
      }
      if (res.status === 404) {
        throw new Error(
          `RunPod endpoint ${this.endpointId} not found. Check your endpoint ID.`
        );
      }
      throw new Error(`RunPod API error ${res.status}: ${text.slice(0, 300)}`);
    }

    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error("RunPod returned invalid JSON on job submission.");
    }

    const jobId = data.id;
    if (!jobId) {
      throw new Error(`RunPod returned no job ID: ${text.slice(0, 200)}`);
    }

    logger.info(`✅ [RunPod] Job submitted: ${jobId} (status: ${data.status})`);
    return { jobId };
  }

  /**
   * Poll the status of a RunPod job and normalise the result.
   */
  async checkStatus(jobId: string): Promise<RunPodJobResult> {
    if (!this.isAvailable()) {
      throw new Error("RunPod credentials not configured.");
    }

    const url = `${RUNPOD_API_BASE}/${this.endpointId}/status/${jobId}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });

    if (!res.ok) {
      throw new Error(`RunPod status check failed: ${res.status}`);
    }

    const data = await res.json();
    const status = (data.status || "IN_QUEUE") as RunPodJobStatusCode;

    // ── Normalise output to a flat list of image URLs ────────────────────────
    const imageUrls: string[] = [];
    let seed: number | undefined;

    let hasBase64Images = false;

    if (status === "COMPLETED" && data.output !== undefined && data.output !== null) {
      const out = data.output;

      /** Extract one candidate string — returns true if it was accepted. */
      const acceptCandidate = (v: unknown): boolean => {
        if (typeof v !== "string") return false;
        if (v.startsWith("http://") || v.startsWith("https://")) {
          imageUrls.push(v);
          return true;
        }
        if (v.startsWith("data:image/")) {
          // Base64 data URI — common from default ComfyUI RunPod workers.
          // We cannot pass these to processIndividualImage (Node fetch doesn't
          // support data: URIs).  Flag so the caller can surface a helpful error.
          hasBase64Images = true;
          logger.warn(
            `⚠️ [RunPod] Job ${jobId}: output contains a base64-encoded image. ` +
            `Configure your endpoint to upload to S3/CDN and return HTTPS URLs.`
          );
          return false;
        }
        return false;
      };

      if (typeof out === "string") {
        acceptCandidate(out);
      } else if (Array.isArray(out)) {
        for (const item of out) {
          if (!acceptCandidate(item) && item && typeof item === "object") {
            acceptCandidate(item.url ?? item.image ?? item.imageUrl ?? null);
            if (item.seed !== undefined) seed = item.seed;
          }
        }
      } else if (typeof out === "object") {
        // { images: [...], seeds: [...] }  — most common ComfyUI wrapper shape
        if (Array.isArray(out.images)) {
          for (const img of out.images) acceptCandidate(img);
        } else {
          acceptCandidate(out.image ?? out.imageUrl ?? out.url ?? null);
        }

        // Seed: prefer seeds[0] → seed → info.seed
        if (Array.isArray(out.seeds) && out.seeds.length > 0) seed = out.seeds[0];
        else if (out.seed !== undefined) seed = out.seed;
        else if (out.info?.seed !== undefined) seed = out.info.seed;
      }
    }

    if (status === "COMPLETED") {
      logger.info(
        `✅ [RunPod] Job ${jobId} completed — ${imageUrls.length} URL(s)` +
        (hasBase64Images ? ", base64 image(s) detected (cannot use)" : "")
      );
    }

    return {
      jobId,
      status,
      imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
      seed,
      error: typeof data.error === "string" ? data.error : undefined,
      hasBase64Images: hasBase64Images || undefined,
    };
  }

  /**
   * Probe the endpoint's health route to validate credentials without spending
   * any credits. Returns a human-readable success/failure message.
   */
  async testConnection(): Promise<{ success: boolean; message: string }> {
    if (!this.apiKey) {
      return { success: false, message: "API key is not set." };
    }
    if (!this.endpointId) {
      return { success: false, message: "Endpoint ID is not set." };
    }

    try {
      const res = await fetch(
        `${RUNPOD_API_BASE}/${this.endpointId}/health`,
        {
          headers: { Authorization: `Bearer ${this.apiKey}` },
          signal: AbortSignal.timeout(10_000),
        }
      );

      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        const workers =
          (data?.workers?.idle ?? 0) + (data?.workers?.running ?? 0);
        return {
          success: true,
          message: `Endpoint is reachable (${workers} worker${workers !== 1 ? "s" : ""} available).`,
        };
      }
      if (res.status === 401) {
        return { success: false, message: "Invalid API key — check your RunPod API key." };
      }
      if (res.status === 404) {
        return {
          success: false,
          message: `Endpoint "${this.endpointId}" not found — check your endpoint ID.`,
        };
      }
      return { success: false, message: `Endpoint returned HTTP ${res.status}.` };
    } catch (err: any) {
      if (err?.name === "TimeoutError") {
        return { success: false, message: "Connection timed out — RunPod may be unreachable." };
      }
      return { success: false, message: `Connection failed: ${err?.message ?? String(err)}` };
    }
  }
}

// Singleton using env vars; overridden at call time via explicit constructor args
// when platform-setting credentials are preferred.
export const runpodService = new RunPodService();
