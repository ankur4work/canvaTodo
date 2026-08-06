import type { BillableAction } from "@canva/user";
import { monetization } from "@canva/user";
import { devForcePremium } from "./config";

/**
 * The usage id used when the local dev override is on. The backend accepts it
 * only when its own `PREMIUM_DEV_OVERRIDE` switch is enabled.
 */
export const DEV_USAGE_ID = "dev-usage-id";

/**
 * Runs a single billable unit of work inside a Canva tracking session.
 *
 * Canva measures premium usage by what happens between opening and closing a
 * tracking session, so `work` must contain the billable call and nothing else.
 * Keep analytics, thumbnail fetches, asset uploads and any other incidental
 * requests outside of it, or you will inflate your own reported usage.
 *
 * The session is closed in a `finally` block so a failed generation still ends
 * the session rather than leaving it open.
 *
 * @param action The billable action being performed.
 * @param work   Receives the tracking session id, which must be forwarded to
 *               your backend as the `Canva-Premium-Usage-Id` header.
 */
export async function runBillableAction<T>(
  action: BillableAction,
  work: (usageId: string) => Promise<T>,
): Promise<T> {
  // Locally, before Canva accepts the app, `openTrackingSession` rejects.
  // Run the same code path with a stand-in id so the end-to-end flow is still
  // exercisable on your machine.
  if (devForcePremium()) {
    return work(DEV_USAGE_ID);
  }

  const session = await monetization.openTrackingSession({ action });

  try {
    return await work(session.id);
  } finally {
    await session.closeTrackingSession();
  }
}
