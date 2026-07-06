/**
 * Web push registration. Call enablePushNotifications() at a moment of intent
 * (e.g. right after the user starts a generation) — it registers the service
 * worker, asks for permission if needed, and uploads the subscription.
 */

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

export function pushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export async function enablePushNotifications(): Promise<boolean> {
  if (!pushSupported()) return false;
  if (Notification.permission === 'denied') return false;

  try {
    const keyResponse = await fetch('/api/push/vapid-public-key');
    if (!keyResponse.ok) return false;
    const { publicKey } = await keyResponse.json();
    if (!publicKey) return false; // push not configured server-side

    const registration = await navigator.serviceWorker.register('/sw.js');

    if (Notification.permission === 'default') {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') return false;
    }

    const existing = await registration.pushManager.getSubscription();
    const subscription =
      existing ||
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      }));

    const response = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(subscription.toJSON()),
    });
    return response.ok;
  } catch (error) {
    console.warn('Push setup failed:', error);
    return false;
  }
}
