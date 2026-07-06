/**
 * Daily reward / streak logic. Pure functions so they're unit-testable
 * without a database. All day math uses UTC calendar days.
 */

/** Buzz awarded for a given streak day (1-based). Capped at day 7+. */
export const DAILY_REWARD_SCHEDULE = [10, 15, 20, 25, 30, 40, 50];

export function rewardForStreak(streak: number): number {
  const idx = Math.min(Math.max(streak, 1), DAILY_REWARD_SCHEDULE.length) - 1;
  return DAILY_REWARD_SCHEDULE[idx];
}

export function utcDayNumber(date: Date): number {
  return Math.floor(date.getTime() / 86_400_000);
}

export type ClaimEvaluation =
  | { canClaim: false; reason: 'already_claimed'; nextStreak: number }
  | { canClaim: true; nextStreak: number; reward: number };

/**
 * Evaluate a claim attempt.
 * - Same UTC day as last claim -> already claimed.
 * - Last claim was yesterday (UTC) -> streak continues.
 * - Otherwise (older or never) -> streak resets to 1.
 */
export function evaluateClaim(
  lastClaimAt: Date | null,
  currentStreak: number,
  now: Date = new Date()
): ClaimEvaluation {
  const today = utcDayNumber(now);
  if (lastClaimAt) {
    const lastDay = utcDayNumber(lastClaimAt);
    if (lastDay === today) {
      return { canClaim: false, reason: 'already_claimed', nextStreak: currentStreak };
    }
    if (lastDay === today - 1) {
      const nextStreak = currentStreak + 1;
      return { canClaim: true, nextStreak, reward: rewardForStreak(nextStreak) };
    }
  }
  return { canClaim: true, nextStreak: 1, reward: rewardForStreak(1) };
}

/** Streak shown in UI: today's claim keeps it, yesterday's keeps it, older resets to 0. */
export function effectiveStreak(lastClaimAt: Date | null, storedStreak: number, now: Date = new Date()): number {
  if (!lastClaimAt) return 0;
  const diff = utcDayNumber(now) - utcDayNumber(lastClaimAt);
  return diff <= 1 ? storedStreak : 0;
}

/** Random, unambiguous referral code (no 0/O/1/I). */
export function generateReferralCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

export const REFERRAL_REWARD_REFERRER = 100;
export const REFERRAL_REWARD_INVITEE = 100;
/** Window after signup during which a referral code can be redeemed. */
export const REFERRAL_REDEEM_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
