import { db } from "./db";
import { characters, models } from "@shared/schema";
import { and, eq, ilike, or, sql } from "drizzle-orm";
import { logger } from "./logger";

/**
 * Idempotent startup seeder: creates one shared character per "RLY Thot Shot"
 * LoRA that targets the KREA 2 ecosystem, named after the LoRA's subject
 * (e.g. "RLY Thot Shot - Annika (KREA 2 + ZiB/ZiT)" → character "Annika"),
 * with base model KREA 2 Turbo and the LoRA attached.
 *
 * Idempotency key: a SHARED character that already has the LoRA's model id in
 * its `loras` list. Unrelated user characters with the same name never block
 * seeding. The whole run executes inside a transaction holding an advisory
 * lock, so concurrent instances/restarts cannot double-insert.
 *
 * Runs in every environment. Where the RLY LoRAs or the KREA 2 Turbo
 * checkpoint haven't been synced into the models table, it logs and does
 * nothing.
 */
export async function seedRlyKrea2Characters(): Promise<void> {
  try {
    await db.transaction(async (tx) => {
      // Serialize concurrent seeder runs (released automatically at commit)
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('seed-rly-krea2-characters'))`);

      // The LoRAs: RLY Thot Shot models in the KREA 2 ecosystem (some rows
      // have baseModel ZImageTurbo but are KREA 2-capable per their name).
      const rlyLoras = await tx
        .select({ id: models.id, name: models.name })
        .from(models)
        .where(
          and(
            ilike(models.type, "%lora%"),
            ilike(models.name, "RLY Thot Shot%"),
            or(eq(models.baseModel, "Krea 2"), ilike(models.name, "%KREA 2%")),
          ),
        );

      if (rlyLoras.length === 0) {
        logger.info("ℹ️ RLY character seeder: no RLY KREA 2 LoRAs in models table — skipping");
        return;
      }

      // Base model: prefer the exact "Krea 2 Turbo" checkpoint, fall back to
      // any KREA turbo checkpoint.
      const turboCandidates = await tx
        .select({ id: models.id, name: models.name })
        .from(models)
        .where(and(eq(models.type, "checkpoint"), ilike(models.name, "%krea%turbo%")));
      const turbo =
        turboCandidates.find((m) => m.name.trim().toLowerCase() === "krea 2 turbo") ??
        turboCandidates[0];
      if (!turbo) {
        logger.warn("⚠️ RLY character seeder: no KREA 2 Turbo checkpoint found — skipping");
        return;
      }

      // Idempotency: LoRA ids already attached to any SHARED character.
      const sharedChars = await tx
        .select({ loras: characters.loras })
        .from(characters)
        .where(eq(characters.isShared, true));
      const seededLoraIds = new Set<string>();
      for (const c of sharedChars) {
        for (const l of c.loras ?? []) seededLoraIds.add(l.id);
      }

      let created = 0;
      for (const lora of rlyLoras) {
        if (seededLoraIds.has(lora.id)) continue;

        // "RLY Thot Shot - Annika (KREA 2 + ZiB/ZiT)" → "Annika"
        const match = lora.name.match(/RLY Thot Shot\s*-\s*([^(]+?)\s*(?:\(|$)/i);
        const subject = match?.[1]
          ?.replace(/[^\p{L}\p{N}\s'-]/gu, "") // drop emoji/symbols
          .trim();
        if (!subject) {
          logger.warn(`⚠️ RLY character seeder: could not extract a name from "${lora.name}" — skipping`);
          continue;
        }

        await tx.insert(characters).values({
          name: subject,
          description: `RLY Thot Shot — ${subject} (KREA 2 Turbo)`,
          basePrompt: `rly${subject.toLowerCase().replace(/\s+/g, "")}, photorealistic photo of ${subject}, beautiful woman, detailed skin texture, natural lighting, ultra detailed, 8k`,
          negativePrompt:
            "bad anatomy, ugly, blurry, low quality, deformed, extra limbs, watermark, text",
          category: "User Characters/Female",
          source: "User",
          isPublic: true,
          isShared: true,
          baseModel: turbo.id,
          // KREA 2 Turbo tier sweet spot: ~10 steps, CFG ~1.5 (cfgScale stored as int*10)
          steps: 10,
          cfgScale: 15,
          loras: [{ id: lora.id, strength: 1.0 }],
        });
        seededLoraIds.add(lora.id);
        created++;
        logger.info(`✅ RLY character seeder: created shared character "${subject}" (LoRA: ${lora.name})`);
      }

      if (created > 0) {
        logger.info(`✅ RLY character seeder: created ${created} shared character(s) on "${turbo.name}"`);
      }
    });
  } catch (error) {
    logger.error("⚠️ RLY character seeder failed:", error);
  }
}
