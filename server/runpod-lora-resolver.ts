/**
 * Resolves LoRA model IDs (internal DB IDs) to the form a RunPod endpoint
 * can actually use — either a Network Volume file path or a CivitAI download URL.
 *
 * Resolution order per LoRA:
 *   1. Admin Network Volume mapping: loraMapping[modelId] → NV filename
 *      Full path: nvBasePath.trimEnd('/') + '/' + filename
 *   2. CivitAI download URL derived from the model's stored ARN version segment:
 *      urn:air:...:civitai:{modelId}@{versionId}  →  https://civitai.com/api/download/models/{versionId}
 *   3. Fallback CivitAI URL from civitaiId (no version pinning):
 *      https://civitai.com/api/download/models/{civitaiId}
 *   4. Unresolvable — reported to the caller so it can warn the user.
 */

import { storage } from "./storage";
import { logger } from "./logger";

// ── Types ────────────────────────────────────────────────────────────────────

export interface RunPodLoRA {
  /** CivitAI download URL (on-demand download by the worker). */
  url?: string;
  /**
   * Full file path on a mounted Network Volume.
   * Typically: `{nvBasePath}/{filename}`.
   */
  path?: string;
  strength: number;
  /** Human-readable model name, forwarded for worker logging. */
  name: string;
}

export interface UnresolvableLoRA {
  modelId: string;
  name: string;
  reason: string;
}

export interface LoRAResolutionResult {
  resolved: RunPodLoRA[];
  unresolvable: UnresolvableLoRA[];
}

// ── CivitAI URL helpers ──────────────────────────────────────────────────────

const CIVITAI_DOWNLOAD_BASE = "https://civitai.com/api/download/models";

/**
 * Extract the CivitAI version ID from an AIR URN.
 * Format: urn:air:<base>:<type>:civitai:<modelId>@<versionId>
 */
function versionIdFromArn(arn: string): string | null {
  const match = arn.match(/^urn:air:[^:]+:[^:]+:civitai:\d+@(\d+)$/i);
  return match ? match[1] : null;
}

function civitaiDownloadUrl(versionId: string): string {
  return `${CIVITAI_DOWNLOAD_BASE}/${versionId}`;
}

// ── Resolver ─────────────────────────────────────────────────────────────────

/**
 * Resolve a list of `{ id, strength }` LoRA references (as stored in a
 * generation record) into URLs / Network Volume paths that a RunPod endpoint
 * can use.
 *
 * @param loras        Raw LoRA list from the generation (`{ id, strength }[]`)
 * @param nvBasePath   Network Volume base path from platform settings (may be empty)
 * @param loraMappings Admin-configured model-ID → filename map (may be empty)
 */
export async function resolveRunPodLoRAs(
  loras: Array<{ id: string; strength: number }>,
  nvBasePath: string,
  loraMappings: Record<string, string>
): Promise<LoRAResolutionResult> {
  const resolved: RunPodLoRA[] = [];
  const unresolvable: UnresolvableLoRA[] = [];

  if (!loras || loras.length === 0) {
    return { resolved, unresolvable };
  }

  const basePath = nvBasePath.trim().replace(/\/+$/, ""); // strip trailing slashes

  for (const { id, strength } of loras) {
    let model: Awaited<ReturnType<typeof storage.getModelById>> = undefined;
    try {
      model = await storage.getModelById(id);
    } catch (err) {
      logger.warn(`⚠️ [RunPod LoRA] DB lookup failed for model ${id}:`, err);
    }

    const modelName = model?.name ?? id;

    // ── 1. Network Volume mapping ──────────────────────────────────────────
    const nvFilename = loraMappings[id];
    if (nvFilename && basePath) {
      const fullPath = `${basePath}/${nvFilename.replace(/^\//, "")}`;
      logger.info(`📦 [RunPod LoRA] ${modelName} → NV path: ${fullPath}`);
      resolved.push({ path: fullPath, strength, name: modelName });
      continue;
    }

    // ── 2. CivitAI download URL from ARN ───────────────────────────────────
    if (model?.arn) {
      const versionId = versionIdFromArn(model.arn);
      if (versionId) {
        const url = civitaiDownloadUrl(versionId);
        logger.info(`🔗 [RunPod LoRA] ${modelName} → CivitAI URL (v${versionId}): ${url}`);
        resolved.push({ url, strength, name: modelName });
        continue;
      }
    }

    // ── 3. Fallback: CivitAI URL from civitaiId ────────────────────────────
    if (model?.civitaiId) {
      const url = civitaiDownloadUrl(model.civitaiId);
      logger.info(`🔗 [RunPod LoRA] ${modelName} → CivitAI URL (model ${model.civitaiId}) — no version pin`);
      resolved.push({ url, strength, name: modelName });
      continue;
    }

    // ── 4. Unresolvable ────────────────────────────────────────────────────
    const reason = model
      ? "No CivitAI ID or ARN stored — cannot derive a download URL"
      : `Model ${id} not found in the database`;
    logger.warn(`⚠️ [RunPod LoRA] ${modelName} unresolvable: ${reason}`);
    unresolvable.push({ modelId: id, name: modelName, reason });
  }

  return { resolved, unresolvable };
}

// ── Preview helper (admin use) ───────────────────────────────────────────────

export type LoRAPreviewEntry =
  | { status: "nv_path"; modelId: string; name: string; path: string }
  | { status: "civitai_url"; modelId: string; name: string; url: string; pinned: boolean }
  | { status: "unresolvable"; modelId: string; name: string; reason: string };

/**
 * Return a resolution preview for every LoRA model in the DB, without
 * actually needing a generation request.  Used by the admin panel.
 */
export async function previewAllLoRAResolutions(
  nvBasePath: string,
  loraMappings: Record<string, string>
): Promise<LoRAPreviewEntry[]> {
  const allModels = await storage.getAllModels();
  const loras = allModels.filter((m) => m.type?.toLowerCase() === "lora");
  const basePath = nvBasePath.trim().replace(/\/+$/, "");
  const entries: LoRAPreviewEntry[] = [];

  for (const model of loras) {
    const id = model.id;
    const name = model.name;

    const nvFilename = loraMappings[id];
    if (nvFilename && basePath) {
      entries.push({ status: "nv_path", modelId: id, name, path: `${basePath}/${nvFilename.replace(/^\//, "")}` });
      continue;
    }

    if (model.arn) {
      const versionId = versionIdFromArn(model.arn);
      if (versionId) {
        entries.push({ status: "civitai_url", modelId: id, name, url: civitaiDownloadUrl(versionId), pinned: true });
        continue;
      }
    }

    if (model.civitaiId) {
      entries.push({ status: "civitai_url", modelId: id, name, url: civitaiDownloadUrl(model.civitaiId), pinned: false });
      continue;
    }

    entries.push({ status: "unresolvable", modelId: id, name, reason: "No CivitAI ID or ARN stored" });
  }

  return entries;
}
