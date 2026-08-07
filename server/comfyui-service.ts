/**
 * ComfyUI HTTP API client for image generation.
 *
 * Talks to a ComfyUI instance (typically a RunPod pod) via:
 *   POST  {baseUrl}/prompt         — submit a workflow, returns { prompt_id }
 *   GET   {baseUrl}/history/{id}   — poll for completion, returns output filenames
 *   GET   {baseUrl}/view?...       — download an output image (used as blobUrl)
 *   GET   {baseUrl}/system_stats   — connectivity test (no auth needed)
 *
 * ComfyUI has NO API key.  The base URL itself is the credential — keep it secret.
 * The base URL format for a RunPod pod at port 3000:
 *   https://{podId}-3000.proxy.runpod.net
 *
 * Workflows must be submitted in "API format" (Workflow → Export (API) in the
 * ComfyUI UI), NOT the regular Save format.  This client builds workflows from
 * scratch so the format is always correct.
 */

import { logger } from "./logger";
import { randomUUID } from "crypto";

// ── Types ────────────────────────────────────────────────────────────────────

export interface ComfyUIGenerationRequest {
  prompt: string;
  negativePrompt?: string;
  width: number;
  height: number;
  steps: number;
  cfgScale: number;
  /** ComfyUI sampler name — e.g. "euler", "dpm_2", "dpmpp_2m" */
  scheduler?: string;
  clipSkip?: number;
  seed?: number;
  /** Checkpoint filename as it appears in ComfyUI's model list, e.g. "v1-5-pruned-emaonly.safetensors" */
  checkpointName: string;
  /**
   * Only NV-path LoRAs are usable by ComfyUI — the filename (not full path)
   * relative to the ComfyUI models/loras/ directory.
   */
  loras?: Array<{ filename: string; strength: number; name?: string }>;
}

export interface ComfyUIHistoryResult {
  done: boolean;
  /** Output image descriptors when done === true */
  images?: Array<{ filename: string; subfolder: string; type: string }>;
  error?: string;
}

// ── Sampler / scheduler mapping ───────────────────────────────────────────────

/**
 * Map the app's scheduler strings to ComfyUI sampler + scheduler pairs.
 * ComfyUI separates sampler (algorithm) from scheduler (noise schedule).
 */
function mapScheduler(s: string | undefined): { sampler_name: string; scheduler: string } {
  if (!s) return { sampler_name: "euler", scheduler: "normal" };
  const lower = s.toLowerCase();
  if (lower.includes("dpm++ 2m karras") || lower.includes("dpmpp_2m_karras"))
    return { sampler_name: "dpmpp_2m", scheduler: "karras" };
  if (lower.includes("dpm++ sde karras") || lower.includes("dpmpp_sde_karras"))
    return { sampler_name: "dpmpp_sde", scheduler: "karras" };
  if (lower.includes("dpm++ 2m") || lower.includes("dpmpp_2m"))
    return { sampler_name: "dpmpp_2m", scheduler: "normal" };
  if (lower.includes("euler a") || lower.includes("euler_ancestral"))
    return { sampler_name: "euler_ancestral", scheduler: "normal" };
  if (lower.includes("ddim"))
    return { sampler_name: "ddim", scheduler: "ddim_uniform" };
  if (lower.includes("unipc") || lower.includes("uni_pc"))
    return { sampler_name: "uni_pc", scheduler: "normal" };
  if (lower.includes("karras"))
    return { sampler_name: "euler", scheduler: "karras" };
  // Default: Euler
  return { sampler_name: "euler", scheduler: "normal" };
}

// ── Workflow builder ──────────────────────────────────────────────────────────

/**
 * Build a ComfyUI API-format workflow JSON for text-to-image with optional LoRAs.
 *
 * Node layout:
 *   1  CheckpointLoaderSimple
 *   10-19  LoraLoader (one per LoRA, chained: each takes model+clip from the previous)
 *   2  CLIPTextEncode (positive) — uses CLIP output of last loader in chain
 *   3  CLIPTextEncode (negative) — same
 *   4  EmptyLatentImage
 *   5  KSampler — uses MODEL output of last loader in chain
 *   6  VAEDecode
 *   7  SaveImage
 */
export function buildTxt2ImgWorkflow(req: ComfyUIGenerationRequest): Record<string, unknown> {
  const { sampler_name, scheduler } = mapScheduler(req.scheduler);
  const loras = req.loras ?? [];

  // Node IDs
  const CKPT_ID = "1";
  const POSITIVE_ID = "2";
  const NEGATIVE_ID = "3";
  const LATENT_ID = "4";
  const KSAMPLER_ID = "5";
  const DECODE_ID = "6";
  const SAVE_ID = "7";
  // LoRA nodes get IDs 10, 11, 12, …
  const loraNodeIds = loras.map((_, i) => String(10 + i));

  // After all loaders: model output is [lastNodeId, 0], clip is [lastNodeId, 1]
  const lastLoaderModelRef: [string, number] =
    loraNodeIds.length > 0 ? [loraNodeIds[loraNodeIds.length - 1], 0] : [CKPT_ID, 0];
  const lastLoaderClipRef: [string, number] =
    loraNodeIds.length > 0 ? [loraNodeIds[loraNodeIds.length - 1], 1] : [CKPT_ID, 1];

  const workflow: Record<string, unknown> = {
    // Checkpoint loader
    [CKPT_ID]: {
      class_type: "CheckpointLoaderSimple",
      inputs: { ckpt_name: req.checkpointName },
    },

    // Positive prompt
    [POSITIVE_ID]: {
      class_type: "CLIPTextEncode",
      inputs: { text: req.prompt, clip: lastLoaderClipRef },
    },

    // Negative prompt
    [NEGATIVE_ID]: {
      class_type: "CLIPTextEncode",
      inputs: { text: req.negativePrompt || "", clip: lastLoaderClipRef },
    },

    // Latent canvas
    [LATENT_ID]: {
      class_type: "EmptyLatentImage",
      inputs: { width: req.width, height: req.height, batch_size: 1 },
    },

    // KSampler
    [KSAMPLER_ID]: {
      class_type: "KSampler",
      inputs: {
        model: lastLoaderModelRef,
        positive: [POSITIVE_ID, 0],
        negative: [NEGATIVE_ID, 0],
        latent_image: [LATENT_ID, 0],
        seed: req.seed ?? -1,
        steps: req.steps,
        cfg: req.cfgScale,
        sampler_name,
        scheduler,
        denoise: 1.0,
      },
    },

    // VAE decode
    [DECODE_ID]: {
      class_type: "VAEDecode",
      inputs: { samples: [KSAMPLER_ID, 0], vae: [CKPT_ID, 2] },
    },

    // Save
    [SAVE_ID]: {
      class_type: "SaveImage",
      inputs: { filename_prefix: "ComfyUI", images: [DECODE_ID, 0] },
    },
  };

  // Insert LoRA loader nodes, chaining model+clip through each
  for (let i = 0; i < loras.length; i++) {
    const nodeId = loraNodeIds[i];
    const prevModelRef: [string, number] = i === 0 ? [CKPT_ID, 0] : [loraNodeIds[i - 1], 0];
    const prevClipRef: [string, number] = i === 0 ? [CKPT_ID, 1] : [loraNodeIds[i - 1], 1];
    workflow[nodeId] = {
      class_type: "LoraLoader",
      inputs: {
        lora_name: loras[i].filename,
        strength_model: loras[i].strength,
        strength_clip: loras[i].strength,
        model: prevModelRef,
        clip: prevClipRef,
      },
    };
  }

  return workflow;
}

// ── ComfyUI service class ─────────────────────────────────────────────────────

export class ComfyUIService {
  private baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = (baseUrl || process.env.COMFYUI_BASE_URL || "").replace(/\/+$/, "");
  }

  isAvailable(): boolean {
    return !!this.baseUrl;
  }

  /**
   * Submit a workflow in API format.
   * Returns the prompt_id to poll with checkHistory().
   */
  async submitWorkflow(workflow: Record<string, unknown>): Promise<{ promptId: string }> {
    if (!this.isAvailable()) {
      throw new Error("ComfyUI base URL is not configured.");
    }

    const clientId = randomUUID();
    const url = `${this.baseUrl}/prompt`;
    logger.info(`🟣 [ComfyUI] Submitting workflow to ${url}`);

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: workflow, client_id: clientId }),
      signal: AbortSignal.timeout(30_000),
    });

    const text = await res.text();
    if (!res.ok) {
      let detail = text.slice(0, 400);
      try {
        const parsed = JSON.parse(text);
        if (parsed?.error?.message) detail = parsed.error.message;
        else if (parsed?.node_errors) detail = `Node errors: ${JSON.stringify(parsed.node_errors)}`;
      } catch { /* ignore */ }
      throw new Error(`ComfyUI /prompt returned HTTP ${res.status}: ${detail}`);
    }

    let data: any;
    try { data = JSON.parse(text); } catch {
      throw new Error("ComfyUI returned invalid JSON on workflow submit.");
    }

    const promptId = data.prompt_id;
    if (!promptId) {
      throw new Error(`ComfyUI returned no prompt_id: ${text.slice(0, 200)}`);
    }

    logger.info(`✅ [ComfyUI] Workflow queued — prompt_id: ${promptId}`);
    return { promptId };
  }

  /**
   * Check the history endpoint for a completed prompt.
   * Returns { done: false } while still running, or { done: true, images } on success.
   */
  async checkHistory(promptId: string): Promise<ComfyUIHistoryResult> {
    if (!this.isAvailable()) throw new Error("ComfyUI base URL is not configured.");

    const url = `${this.baseUrl}/history/${promptId}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });

    if (!res.ok) {
      throw new Error(`ComfyUI /history returned HTTP ${res.status}`);
    }

    const data: any = await res.json();
    const entry = data[promptId];

    // Not in history yet → still queued/running
    if (!entry) return { done: false };

    const status = entry.status;
    const completed: boolean = status?.completed === true;
    const statusStr: string = status?.status_str || "";

    if (!completed) return { done: false };

    // Check for error
    if (statusStr === "error" || (status?.messages ?? []).some((m: any[]) => m[0] === "execution_error")) {
      const errMsg = (status?.messages ?? [])
        .filter((m: any[]) => m[0] === "execution_error")
        .map((m: any[]) => m[1]?.exception_message || JSON.stringify(m[1]))
        .join("; ") || "ComfyUI execution error";
      logger.error(`❌ [ComfyUI] Prompt ${promptId} errored: ${errMsg}`);
      return { done: true, error: errMsg };
    }

    // Extract output images from all nodes' outputs
    const images: Array<{ filename: string; subfolder: string; type: string }> = [];
    const outputs: Record<string, any> = entry.outputs || {};
    for (const nodeId of Object.keys(outputs)) {
      const nodeOut = outputs[nodeId];
      if (Array.isArray(nodeOut.images)) {
        for (const img of nodeOut.images) {
          if (img.filename && img.type === "output") {
            images.push({ filename: img.filename, subfolder: img.subfolder || "", type: img.type });
          }
        }
      }
    }

    if (images.length === 0) {
      return { done: true, error: "ComfyUI completed but no output images were found in history." };
    }

    logger.info(`✅ [ComfyUI] Prompt ${promptId} completed — ${images.length} image(s)`);
    return { done: true, images };
  }

  /**
   * Build a full HTTPS URL for a ComfyUI output image.
   * This URL can be passed directly to processIndividualImage as blobUrl.
   */
  getImageViewUrl(filename: string, subfolder: string, type: string): string {
    const params = new URLSearchParams({ filename, subfolder, type });
    return `${this.baseUrl}/view?${params.toString()}`;
  }

  /**
   * Probe the /system_stats endpoint to verify connectivity.
   * Returns a human-readable success/failure message.
   */
  async testConnection(): Promise<{ success: boolean; message: string }> {
    if (!this.baseUrl) {
      return { success: false, message: "ComfyUI base URL is not configured." };
    }
    try {
      const res = await fetch(`${this.baseUrl}/system_stats`, {
        signal: AbortSignal.timeout(10_000),
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        const gpuCount = data?.system?.gpu_count ?? data?.devices?.length ?? "?";
        return { success: true, message: `ComfyUI is reachable (${gpuCount} GPU(s) reported).` };
      }
      if (res.status === 404) {
        // Some versions don't have /system_stats — try /object_info instead
        const r2 = await fetch(`${this.baseUrl}/object_info`, { signal: AbortSignal.timeout(5_000) });
        if (r2.ok) return { success: true, message: "ComfyUI is reachable (/system_stats not available but /object_info responded)." };
      }
      return { success: false, message: `ComfyUI returned HTTP ${res.status}. Check the base URL.` };
    } catch (err: any) {
      if (err?.name === "TimeoutError") {
        return { success: false, message: "Connection timed out — is the RunPod pod running?" };
      }
      return { success: false, message: `Connection failed: ${err?.message ?? String(err)}` };
    }
  }
}

// Singleton using env vars; override at call time via explicit constructor args
export const comfyuiService = new ComfyUIService();
