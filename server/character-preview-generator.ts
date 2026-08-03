/**
 * Generates a preview image for a shared character using its KREA 2 base model
 * and attached LoRAs, then persists the result to object storage and updates
 * the character's imageUrl.
 *
 * This module is intentionally self-contained: it submits directly to the
 * CivitAI v2 orchestration API and polls for completion without touching the
 * main generation pipeline or BatchPoller (no user session, no DB generation
 * row needed).
 */

import { randomUUID } from "crypto";
import { logger } from "./logger";
import { storage } from "./storage";
import { civitaiOrchestration } from "./civitai-orchestration";
import { objectStorageClient, parseObjectPath } from "./objectStorage";
import type { Character } from "@shared/schema";

/** Max time (ms) to wait for a single generation before giving up. */
const POLL_TIMEOUT_MS = 8 * 60 * 1000; // 8 minutes

/** Polling interval (ms) between status checks. */
const POLL_INTERVAL_MS = 6_000;

/** Between characters in the backfill loop — avoid hammering the API. */
const BETWEEN_CHARS_DELAY_MS = 4_000;

/**
 * Poll a CivitAI v2 workflow until it succeeds, fails, or times out.
 * Returns the first image URL on success, throws on failure/timeout.
 */
async function pollWorkflowUntilDone(
  token: string,
  characterName: string,
): Promise<string> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

    const status = await civitaiOrchestration.getWorkflowStatus(token);
    const job = status.jobs?.[0];
    if (!job) continue;

    // Terminal failure: result is absent (not even an empty array)
    if (job.scheduled === false && !job.result) {
      throw new Error(`Workflow ${token} failed/cancelled for character "${characterName}"`);
    }

    // Still running
    if (job.scheduled !== false) continue;

    // Succeeded — find the first available image
    const images = (job.result ?? []).filter(
      (r) => r.mediaType === "image" && r.available && r.url,
    );
    if (images.length === 0) {
      throw new Error(`Workflow ${token} finished but produced no images for "${characterName}"`);
    }
    return images[0].url as string;
  }
  throw new Error(
    `Workflow ${token} timed out after ${POLL_TIMEOUT_MS / 1000}s for character "${characterName}"`,
  );
}

/**
 * Download `imageUrl`, upload to object storage at
 * `<PRIVATE_OBJECT_DIR>/characters/<characterId>/preview.jpg`,
 * and return the storage path.
 */
async function storeCharacterPreview(
  characterId: string,
  imageUrl: string,
): Promise<string> {
  const privateObjectDir = (process.env.PRIVATE_OBJECT_DIR || "").trim();
  if (!privateObjectDir) {
    throw new Error("PRIVATE_OBJECT_DIR not set — cannot store character preview");
  }

  const storagePath = `${privateObjectDir}/characters/${characterId}/preview.jpg`;
  const { bucketName, objectName } = parseObjectPath(storagePath);

  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(
      `Failed to download preview image (${response.status}): ${imageUrl}`,
    );
  }
  const buffer = Buffer.from(await response.arrayBuffer());

  const bucket = objectStorageClient.bucket(bucketName);
  await bucket.file(objectName).save(buffer, {
    metadata: { contentType: "image/jpeg" },
  });

  logger.info(
    `📁 Stored character preview for ${characterId} at ${storagePath}`,
  );
  return storagePath;
}

/**
 * Generate and persist a preview image for a single shared character.
 * - Resolves the base model ARN and LoRA ARNs from the database.
 * - Submits a txt2img via the CivitAI v2 workflows API.
 * - Polls until complete, downloads, stores to object storage.
 * - Updates character.imageUrl in the database.
 *
 * Throws if generation fails; callers should catch and continue.
 */
export async function generateCharacterPreviewImage(
  character: Character,
): Promise<void> {
  logger.info(
    `🖼️  Generating preview for character "${character.name}" (${character.id})`,
  );

  // --- 1. Resolve base model ARN ---
  if (!character.baseModel) {
    throw new Error(`Character "${character.name}" has no baseModel`);
  }
  const baseModelRecord = await storage.getModelById(character.baseModel);
  if (!baseModelRecord?.arn) {
    throw new Error(
      `Base model ${character.baseModel} not found or missing ARN for "${character.name}"`,
    );
  }

  // --- 2. Resolve LoRA ARNs ---
  const lorasWithArns: Array<{ id: string; strength: number }> = [];
  for (const lora of character.loras ?? []) {
    const loraModel = await storage.getModelById(lora.id);
    if (loraModel?.arn) {
      lorasWithArns.push({ id: loraModel.arn, strength: lora.strength ?? 1.0 });
    } else {
      logger.warn(
        `⚠️  LoRA ${lora.id} missing ARN for character "${character.name}" — skipping`,
      );
    }
  }

  // --- 3. Build prompt ---
  const prompt = character.basePrompt
    || `photorealistic photo of ${character.name}, beautiful woman, detailed skin texture, natural lighting, ultra detailed, 8k`;
  const negativePrompt =
    character.negativePrompt
    || "bad anatomy, ugly, blurry, low quality, deformed, extra limbs, watermark, text";

  // Portrait dimensions work well for character cards
  const width = 832;
  const height = 1216;

  // Use character steps/cfg if set, otherwise Krea 2 Turbo defaults
  const steps = character.steps ?? 10;
  const cfgScale = character.cfgScale != null ? character.cfgScale / 10 : 1.5;

  // --- 4. Submit txt2img ---
  const submit = await civitaiOrchestration.submitTxt2Img(
    {
      prompt,
      negativePrompt,
      modelArn: baseModelRecord.arn,
      baseModel: baseModelRecord.baseModel || "",
      modelName: baseModelRecord.name,
      width,
      height,
      steps,
      cfgScale,
      scheduler: "Euler",
      clipSkip: 2,
      seed: Math.floor(Math.random() * 2147483647),
      quantity: 1,
      loras: lorasWithArns,
    },
  );
  logger.info(
    `🚀 Submitted preview generation for "${character.name}", workflow: ${submit.token}`,
  );

  // --- 5. Poll ---
  const imageUrl = await pollWorkflowUntilDone(submit.token, character.name);
  logger.info(`✅ Preview generated for "${character.name}": ${imageUrl}`);

  // --- 6. Store ---
  const storagePath = await storeCharacterPreview(character.id, imageUrl);

  // --- 7. Update character ---
  await storage.updateCharacter(character.id, { imageUrl: storagePath });
  logger.info(
    `✅ Character "${character.name}" imageUrl updated to ${storagePath}`,
  );
}

/**
 * Process all shared characters that currently lack a preview image.
 * Runs sequentially with a short delay between each to be gentle on the API.
 *
 * Returns a summary { processed, failed, skipped }.
 */
export async function backfillSharedCharacterPreviews(): Promise<{
  processed: number;
  failed: number;
  skipped: number;
}> {
  const sharedCharacters = await storage.getSharedCharacters();
  const todo = sharedCharacters.filter((c) => !c.imageUrl);

  logger.info(
    `🔄 Character preview backfill: ${todo.length} of ${sharedCharacters.length} shared characters need images`,
  );

  let processed = 0;
  let failed = 0;
  const skipped = sharedCharacters.length - todo.length;

  for (const character of todo) {
    try {
      await generateCharacterPreviewImage(character);
      processed++;
    } catch (err) {
      failed++;
      logger.error(
        `❌ Failed to generate preview for "${character.name}": ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }

    // Throttle
    if (processed + failed < todo.length) {
      await new Promise((r) => setTimeout(r, BETWEEN_CHARS_DELAY_MS));
    }
  }

  logger.info(
    `✅ Character preview backfill complete: processed=${processed} failed=${failed} skipped=${skipped}`,
  );
  return { processed, failed, skipped };
}
