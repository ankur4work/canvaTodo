import { user } from "@canva/app-middleware/express";
import cors from "cors";
import "dotenv/config";
import express from "express";
import { createBaseServer } from "../../utils/backend/base_backend/create";
import { premiumDevOverrideEnabled } from "./premium_guard";
import { requestLog } from "./request_log";
import { createAssetRouter } from "./routers/assets";
import { createBrandKitRouter } from "./routers/brand_kits";
import { createGenerateRouter } from "./routers/generate";

async function main() {
  const APP_ID = process.env.CANVA_APP_ID;

  if (!APP_ID) {
    throw new Error(
      "The CANVA_APP_ID environment variable is undefined. Set it in the project's .env file — the backend cannot verify user tokens without it.",
    );
  }

  if (premiumDevOverrideEnabled()) {
    // eslint-disable-next-line no-console
    console.warn(
      "\n[premium] PREMIUM_DEV_OVERRIDE is enabled. Premium endpoints will skip entitlement checks.\n[premium] This is for local testing only. Unset it before deploying.\n",
    );
  }

  const router = express.Router();

  // First, so it captures everything — including unauthenticated asset fetches
  // from Canva and requests that CORS or token verification later rejects.
  router.use(requestLog());

  /**
   * Only this app's own origin may call the backend.
   *
   * Canva serves each app from `https://app-<APP_ID>.canva-apps.com`, with the
   * id lowercased. Locking CORS to that origin means a page on some other site
   * can't drive your paid endpoints using a token it scraped.
   */
  const appOrigin =
    process.env.CANVA_APP_ORIGIN?.trim() ||
    `https://app-${APP_ID.toLowerCase()}.canva-apps.com`;

  router.use(
    cors({
      origin: appOrigin,
      optionsSuccessStatus: 200,
    }),
  );

  /**
   * Generated images, mounted ahead of token verification.
   *
   * Canva fetches asset URLs from its own infrastructure and has no Canva user
   * token to send, so this endpoint cannot require one — it would be
   * unreachable by the only client that needs it. Access is controlled by the
   * unguessable, expiring id in the URL instead. See `routers/assets.ts`.
   */
  router.use(createAssetRouter());

  /**
   * Verifies the Canva user token on every request and populates
   * `req.canva.user`. Everything mounted after this line is authenticated.
   */
  router.use(user.verifyToken({ appId: APP_ID }));

  router.use(createBrandKitRouter());
  router.use(createGenerateRouter());

  const server = createBaseServer(router);
  server.start(process.env.CANVA_BACKEND_PORT);
}

main();
