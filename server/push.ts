import webpush from "web-push";
import { db } from "./db";
import { pushSubscriptions } from "@shared/schema";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

/**
 * Web push notifications. Requires VAPID keys in env:
 *   VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY  (generate: npx web-push generate-vapid-keys)
 *   VAPID_SUBJECT                          (mailto: or https: contact URI)
 * Without keys the module no-ops so the app still boots.
 */

const PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || "";
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "";
const SUBJECT = process.env.VAPID_SUBJECT || "mailto:admin@civiverse.com";

export const pushEnabled = Boolean(PUBLIC_KEY && PRIVATE_KEY);

if (pushEnabled) {
  webpush.setVapidDetails(SUBJECT, PUBLIC_KEY, PRIVATE_KEY);
} else {
  logger.warn("[push] VAPID keys not set — web push disabled. Generate with: npx web-push generate-vapid-keys");
}

export function getVapidPublicKey(): string {
  return PUBLIC_KEY;
}

export async function saveSubscription(
  userId: string,
  sub: { endpoint: string; keys: { p256dh: string; auth: string } }
): Promise<void> {
  await db
    .insert(pushSubscriptions)
    .values({ userId, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: { userId, p256dh: sub.keys.p256dh, auth: sub.keys.auth },
    });
}

export async function removeSubscription(endpoint: string): Promise<void> {
  await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint));
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

/** Send to every registered device for a user. Dead endpoints are pruned. */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<number> {
  if (!pushEnabled) return 0;
  const subs = await db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId));
  let delivered = 0;
  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(payload),
          { TTL: 60 * 60 } // stale "ready" notifications aren't useful after an hour
        );
        delivered++;
      } catch (error: any) {
        if (error?.statusCode === 404 || error?.statusCode === 410) {
          // Subscription expired or revoked — clean up
          await removeSubscription(sub.endpoint).catch(() => {});
        } else {
          logger.warn(`[push] Failed to send to ${userId}:`, error?.statusCode || error?.message);
        }
      }
    })
  );
  return delivered;
}
