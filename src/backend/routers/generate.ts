import express from "express";
import type { Request, Response } from "express";
// Brings the `req.canva` type augmentation into scope.
import "@canva/app-middleware/express";
import type { BrandKit } from "../../shared/brand_kit";
import { brandDirective } from "../../shared/brand_kit";
import { putAsset } from "../asset_store";
import { getBrandKitStore } from "../brand_kit_store";
import { consumeFreeGeneration } from "../free_tier";
import { assertPromptAllowed, ModerationError } from "../moderation";
import { requireBillableAction } from "../premium_guard";
import { publicAssetOrigin } from "../public_url";
import { getProvider, ProviderError } from "../providers";
import type { GenerateOptions, GeneratedAsset } from "../providers";

const MAX_PROMPT_LENGTH = 500;

/**
 * Both tiers render at the same aspect. The premium lever is `quality` and
 * `count`, which is what actually costs more to produce and what Canva meters.
 */
const STANDARD = {
  width: 1024,
  height: 1024,
  count: 1,
  quality: "standard",
} as const;

const PREMIUM = {
  width: 1024,
  height: 1024,
  count: 4,
  quality: "high",
} as const;

const PREMIUM_STYLES = [
  "default",
  "photographic",
  "illustration",
  "3d",
  "minimal",
];

function toDataUrl(asset: GeneratedAsset): string {
  return `data:${asset.mimeType};base64,${asset.body.toString("base64")}`;
}

/**
 * Turns generated images into something the app can hand to `upload()`.
 *
 * In production each image is stashed in the asset store and returned as an
 * HTTPS URL, because a premium generation is four ~1MB PNGs and base64 would
 * make that a ~6MB JSON body. Against a localhost backend there is no publicly
 * reachable URL to give Canva, so images are inlined as data URLs instead —
 * see `public_url.ts` for why that split exists.
 */
function serialize(assets: GeneratedAsset[]) {
  const origin = publicAssetOrigin();

  return assets.map((asset) => ({
    id: asset.id,
    url: origin
      ? `${origin}/api/assets/${putAsset(asset)}`
      : toDataUrl(asset),
    width: asset.width,
    height: asset.height,
    mimeType: asset.mimeType,
  }));
}

function readPrompt(req: Request, res: Response): string | undefined {
  const { prompt } = req.body as { prompt?: unknown };

  if (typeof prompt !== "string" || prompt.trim().length === 0) {
    res.status(400).json({
      error: "invalid_prompt",
      message: "A prompt is required.",
    });
    return undefined;
  }

  if (prompt.length > MAX_PROMPT_LENGTH) {
    res.status(400).json({
      error: "invalid_prompt",
      message: `Prompts are limited to ${MAX_PROMPT_LENGTH} characters.`,
    });
    return undefined;
  }

  return prompt.trim();
}

function userId(req: Request): string {
  // Guaranteed by `user.verifyToken`, which runs before this router.
  return req.canva.user?.userId ?? "unknown";
}

/**
 * Resolves the brand kit the request asked for, if any. A missing or unknown
 * id is not an error — generation just proceeds unbranded.
 */
async function resolveBrandKit(req: Request): Promise<BrandKit | undefined> {
  const { brandKitId } = req.body as { brandKitId?: unknown };

  if (typeof brandKitId !== "string" || brandKitId.length === 0) {
    return undefined;
  }

  return getBrandKitStore().get(userId(req), brandKitId);
}

function brandOptions(kit: BrandKit | undefined) {
  return kit
    ? { brandDirective: brandDirective(kit), brandPalette: kit.palette }
    : {};
}

function handleProviderError(error: unknown, res: Response): boolean {
  // A refused prompt is the user's to fix, so it reads as an invalid prompt
  // rather than a server failure.
  if (error instanceof ModerationError) {
    res.status(400).json({
      error: "invalid_prompt",
      message: error.message,
    });
    return true;
  }

  if (!(error instanceof ProviderError)) {
    return false;
  }

  res.status(error.retryable ? 503 : 400).json({
    error: error.retryable ? "server_error" : "invalid_prompt",
    message: error.message,
  });

  return true;
}

export function createGenerateRouter(): express.Router {
  const router = express.Router();

  /**
   * Free tier. Every user can call this, on any plan. No entitlement, no
   * tracking session — this work is not billable and must never be reported
   * to Canva as premium usage.
   */
  router.post("/api/generate/standard", async (req, res, next) => {
    try {
      const prompt = readPrompt(req, res);
      if (!prompt) {
        return;
      }

      // Before the quota is touched: a refused prompt shouldn't cost the user
      // one of their daily generations.
      await assertPromptAllowed(prompt);

      const decision = consumeFreeGeneration(userId(req));

      if (!decision.allowed) {
        res.status(429).json({
          error: "free_limit_reached",
          message: "Daily free generations used up. They reset in 24 hours.",
        });
        return;
      }

      const kit = await resolveBrandKit(req);
      const options: GenerateOptions = {
        prompt,
        tier: "standard",
        ...STANDARD,
        ...brandOptions(kit),
      };

      const assets = await getProvider().generate(options);

      res.status(200).json({
        images: serialize(assets),
        freeGenerationsRemaining: decision.remaining,
      });
    } catch (error) {
      if (!handleProviderError(error, res)) {
        next(error);
      }
    }
  });

  /**
   * Premium tier.
   *
   * `requireBillableAction` runs after token verification and rejects anyone
   * whose plan doesn't include `generate_image`, and anyone who didn't send an
   * open tracking session id. Its own endpoint, per Canva's guidance, so an
   * entitlement for this action can't be spent elsewhere.
   */
  router.post(
    "/api/generate/premium",
    requireBillableAction("generate_image"),
    async (req, res, next) => {
      try {
        const prompt = readPrompt(req, res);
        if (!prompt) {
          return;
        }

        await assertPromptAllowed(prompt);

        const { style } = req.body as { style?: unknown };
        const resolvedStyle =
          typeof style === "string" && PREMIUM_STYLES.includes(style)
            ? style
            : "default";

        const kit = await resolveBrandKit(req);
        const options: GenerateOptions = {
          prompt,
          tier: "premium",
          style: resolvedStyle,
          ...PREMIUM,
          ...brandOptions(kit),
        };

        const assets = await getProvider().generate(options);

        res.status(200).json({ images: serialize(assets) });
      } catch (error) {
        if (!handleProviderError(error, res)) {
          next(error);
        }
      }
    },
  );

  return router;
}

export { PREMIUM_STYLES };
