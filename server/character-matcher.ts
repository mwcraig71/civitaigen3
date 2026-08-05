/**
 * Character–Generation matching utility.
 *
 * Given a generation's LoRA array, finds the best-matching user character by
 * counting how many of the character's LoRA IDs appear in the generation.
 *
 * Scoring rules
 * ─────────────
 * 1. Score = number of the character's LoRAs that appear in the generation.
 * 2. Higher score wins.
 * 3. Tie-break: character with fewer total LoRAs wins (more specific match).
 * 4. No match → return null (characterId stays null — no false links).
 */

import { storage } from './storage';
import { logger } from './logger';

export async function matchGenerationToCharacter(
  userId: string,
  generationLoras: Array<{ id: string; strength: number }>,
): Promise<string | null> {
  if (!generationLoras || generationLoras.length === 0) return null;

  const userCharacters = await storage.getUserCharacters(userId);
  if (!userCharacters.length) return null;

  const genLoraIds = new Set(generationLoras.map((l) => l.id));

  let bestId: string | null = null;
  let bestScore = 0;
  let bestCharTotal = Infinity;

  for (const character of userCharacters) {
    const charLoras = character.loras || [];
    if (!charLoras.length) continue;

    const score = charLoras.filter((l) => genLoraIds.has(l.id)).length;
    if (score === 0) continue;

    if (score > bestScore || (score === bestScore && charLoras.length < bestCharTotal)) {
      bestScore = score;
      bestId = character.id;
      bestCharTotal = charLoras.length;
    }
  }

  return bestId;
}

/**
 * Fetch a generation, run the matcher, and write characterId if a match is
 * found and the generation is not already linked.  Fire-and-forget safe.
 */
export async function matchAndLinkGenerationToCharacter(generationId: string): Promise<void> {
  try {
    const generation = await storage.getGeneration(generationId);
    if (!generation) return;
    if (generation.characterId) return; // already linked
    if (!generation.userId) return;

    const loras = (generation.loras as Array<{ id: string; strength: number }> | null) ?? [];
    const characterId = await matchGenerationToCharacter(generation.userId, loras);
    if (!characterId) return;

    await storage.updateGeneration(generationId, { characterId });
    logger.info(`🔗 Auto-linked generation ${generationId} → character ${characterId}`);
  } catch (err) {
    // Non-fatal — don't break the generation flow
    logger.error('character-matcher: error linking generation', err);
  }
}
