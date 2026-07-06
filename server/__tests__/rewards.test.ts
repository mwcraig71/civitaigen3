import { describe, it, expect } from "vitest";
import {
  evaluateClaim,
  effectiveStreak,
  rewardForStreak,
  generateReferralCode,
  DAILY_REWARD_SCHEDULE,
} from "../rewards";

const day = (n: number) => new Date(n * 86_400_000 + 12 * 3_600_000); // noon UTC on day n

describe("daily reward schedule", () => {
  it("escalates and caps at day 7", () => {
    expect(rewardForStreak(1)).toBe(DAILY_REWARD_SCHEDULE[0]);
    expect(rewardForStreak(7)).toBe(50);
    expect(rewardForStreak(30)).toBe(50);
    expect(rewardForStreak(0)).toBe(DAILY_REWARD_SCHEDULE[0]); // defensive
  });
});

describe("evaluateClaim", () => {
  it("first-ever claim starts streak at 1", () => {
    const r = evaluateClaim(null, 0, day(100));
    expect(r).toEqual({ canClaim: true, nextStreak: 1, reward: rewardForStreak(1) });
  });

  it("same-day second claim is rejected", () => {
    const r = evaluateClaim(day(100), 3, new Date(day(100).getTime() + 3_600_000));
    expect(r.canClaim).toBe(false);
  });

  it("next-day claim continues the streak", () => {
    const r = evaluateClaim(day(100), 3, day(101));
    expect(r).toEqual({ canClaim: true, nextStreak: 4, reward: rewardForStreak(4) });
  });

  it("skipping a day resets the streak", () => {
    const r = evaluateClaim(day(100), 6, day(102));
    expect(r).toEqual({ canClaim: true, nextStreak: 1, reward: rewardForStreak(1) });
  });

  it("UTC day boundary: 23:59 then 00:01 counts as consecutive days", () => {
    const late = new Date(100 * 86_400_000 + 23 * 3_600_000 + 59 * 60_000);
    const early = new Date(101 * 86_400_000 + 60_000);
    const r = evaluateClaim(late, 1, early);
    expect(r.canClaim).toBe(true);
    expect(r.nextStreak).toBe(2);
  });
});

describe("effectiveStreak", () => {
  it("keeps streak for today and yesterday, resets otherwise", () => {
    expect(effectiveStreak(day(100), 5, day(100))).toBe(5);
    expect(effectiveStreak(day(100), 5, day(101))).toBe(5);
    expect(effectiveStreak(day(100), 5, day(102))).toBe(0);
    expect(effectiveStreak(null, 5, day(102))).toBe(0);
  });
});

describe("generateReferralCode", () => {
  it("is 8 chars from the unambiguous alphabet", () => {
    for (let i = 0; i < 50; i++) {
      const code = generateReferralCode();
      expect(code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/);
    }
  });
});
