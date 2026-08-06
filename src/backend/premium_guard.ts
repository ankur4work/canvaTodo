import type { BillableAction } from "@canva/user";
import type { NextFunction, Request, Response } from "express";

/**
 * The usage id the frontend sends when its local dev override is enabled.
 * Accepted only when this backend's own override is also on.
 */
const DEV_USAGE_ID = "dev-usage-id";

/**
 * Canva puts the actions a user is entitled to on the user token as a
 * `billableActions` claim.
 *
 * `@canva/app-middleware` verifies the token's signature but its typed payload
 * only surfaces `appId`, `userId` and `brandId`, so the claim has to be read
 * off the token directly. This is safe *only* because `user.verifyToken` has
 * already run and rejected anything with a bad signature — decoding here is
 * reading an already-trusted token, not validating an untrusted one. Never
 * call this before the verification middleware.
 */
type PremiumClaims = {
  billableActions?: string[];
};

function decodeVerifiedClaims(token: string): PremiumClaims {
  const payload = token.split(".")[1];
  if (!payload) {
    return {};
  }

  try {
    const json = Buffer.from(payload, "base64url").toString("utf8");
    return JSON.parse(json) as PremiumClaims;
  } catch {
    return {};
  }
}

function bearerToken(req: Request): string | undefined {
  const header = req.header("Authorization");
  if (!header?.startsWith("Bearer ")) {
    return undefined;
  }
  return header.slice("Bearer ".length).trim();
}

/**
 * True when the local override is on. Deliberately impossible in production:
 * `NODE_ENV=production` disables it regardless of the other variable, so a
 * stray `.env` can't turn a deployed backend into a free-for-all.
 */
export function premiumDevOverrideEnabled(): boolean {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.PREMIUM_DEV_OVERRIDE === "true"
  );
}

/**
 * Rejects requests from users whose Canva plan doesn't cover `action`, and
 * requests that arrive without a tracking session id.
 *
 * Mount one guard per billable action, on its own endpoint. Sharing an
 * endpoint between two actions would let an entitlement for one be spent on
 * the other.
 */
export function requireBillableAction(action: BillableAction) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const usageId = req.header("Canva-Premium-Usage-Id");

    if (premiumDevOverrideEnabled()) {
      // eslint-disable-next-line no-console
      console.warn(
        `[premium] DEV OVERRIDE ACTIVE — '${action}' allowed without a real entitlement. Never run this in production.`,
      );
      if (!usageId) {
        res.status(400).json({
          error: "invalid_prompt",
          message: "Missing Canva-Premium-Usage-Id header.",
        });
        return;
      }
      next();
      return;
    }

    if (usageId === DEV_USAGE_ID) {
      res.status(403).json({
        error: "premium_required",
        message:
          "Received a development usage id but the dev override is disabled.",
      });
      return;
    }

    const token = bearerToken(req);
    if (!token) {
      res.status(401).json({
        error: "unauthorized",
        message: "Missing user token.",
      });
      return;
    }

    const { billableActions } = decodeVerifiedClaims(token);

    if (!billableActions?.includes(action)) {
      res.status(403).json({
        error: "premium_required",
        message: `This Canva plan does not include '${action}'.`,
      });
      return;
    }

    // Premium work must be attributable to an open tracking session, otherwise
    // Canva has no usage to bill or pay out against.
    if (!usageId) {
      res.status(400).json({
        error: "invalid_prompt",
        message: "Missing Canva-Premium-Usage-Id header.",
      });
      return;
    }

    next();
  };
}
