import { monetization } from "@canva/user";
import { useCallback, useEffect, useState } from "react";
import {
  PREMIUM_ACTION,
  PREMIUM_APPS_ENROLLED,
  devForcePremium,
} from "./config";

/**
 * - `loading`     — we haven't heard back from Canva yet.
 * - `premium`     — the user's Canva plan covers this billable action.
 * - `free`        — the user is on a plan that doesn't cover it. Show the
 *                   crown affordances and let them upgrade.
 * - `unavailable` — the monetization API isn't available to this app at all.
 *                   That is the expected state until Canva accepts the app
 *                   into the Premium Apps Program. The UI must then hide every
 *                   premium affordance and behave like a purely free app:
 *                   shipping a crown that leads nowhere would fail app review.
 */
export type PremiumStatus = "loading" | "premium" | "free" | "unavailable";

export type PremiumAccess = {
  status: PremiumStatus;
  /** Convenience flag — the user may perform the billable action right now. */
  isPremium: boolean;
  /** Whether premium affordances should be rendered at all. */
  showPremiumUi: boolean;
  /** Re-checks entitlement, e.g. after an upgrade. */
  refresh: () => void;
  /**
   * Opens Canva's upgrade dialog. Resolves `true` if the user came back
   * entitled. Canva owns this dialog — do not build your own upgrade screen.
   */
  requestUpgrade: () => Promise<boolean>;
};

export function usePremiumAccess(): PremiumAccess {
  const [status, setStatus] = useState<PremiumStatus>("loading");

  const check = useCallback(async (): Promise<PremiumStatus> => {
    if (devForcePremium()) {
      return "premium";
    }

    // Until Canva accepts the app, don't touch the monetization API at all —
    // see the note on PREMIUM_APPS_ENROLLED for why this isn't inferred.
    if (!PREMIUM_APPS_ENROLLED) {
      return "unavailable";
    }

    try {
      const enabled = await monetization.isEnabled(PREMIUM_ACTION);
      return enabled ? "premium" : "free";
    } catch {
      // `monetization.isEnabled` rejects for apps that haven't been accepted
      // into the Premium Apps Program. Treat that as "no premium tier exists"
      // rather than as an error the user should see.
      return "unavailable";
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    void check().then((next) => {
      if (!cancelled) {
        setStatus(next);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [check]);

  const requestUpgrade = useCallback(async () => {
    if (devForcePremium()) {
      setStatus("premium");
      return true;
    }

    if (!PREMIUM_APPS_ENROLLED) {
      setStatus("unavailable");
      return false;
    }

    try {
      const response =
        await monetization.requestEnableBillableAction(PREMIUM_ACTION);

      if (response.status === "granted") {
        setStatus("premium");
        return true;
      }

      // "denied" simply means the user closed the dialog. Not an error.
      return false;
    } catch {
      setStatus("unavailable");
      return false;
    }
  }, []);

  return {
    status,
    isPremium: status === "premium",
    showPremiumUi: status === "free" || status === "premium",
    refresh: () => {
      void check().then(setStatus);
    },
    requestUpgrade,
  };
}
