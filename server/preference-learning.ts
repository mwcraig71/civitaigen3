import { logger } from "./logger";
import { storage } from "./storage";
import { geminiService } from "./gemini-service";

/**
 * Learns from an image the user liked/favorited: merges the image's prompt
 * into their learned style profile so future AI Enhance presses reflect it.
 * Fire-and-forget safe — never throws, all failures are logged and swallowed
 * so liking an image can never break on a learning error.
 */
export async function learnFromLikedImage(userId: string, prompt: string | null | undefined): Promise<void> {
  try {
    if (!userId || !prompt || !prompt.trim()) return;
    const user = await storage.getUser(userId);
    if (!user) return;
    const updated = await geminiService.updateLearnedProfile(
      prompt,
      user.learnedStyleProfile ?? null,
      'liked',
    );
    if (updated) {
      await storage.updateUser(userId, { learnedStyleProfile: updated } as any);
      logger.info('🧠 Learned style profile updated from liked image:', {
        userId,
        count: updated.enhanceCount,
      });
    }
  } catch (e) {
    logger.error('⚠️ Failed to learn from liked image:', e);
  }
}
