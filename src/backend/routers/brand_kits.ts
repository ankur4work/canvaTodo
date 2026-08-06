import express from "express";
import type { Request } from "express";
import "@canva/app-middleware/express";
import type { BrandKitDraft } from "../../shared/brand_kit";
import {
  MAX_PALETTE_COLOURS,
  validateBrandKit,
} from "../../shared/brand_kit";
import { getBrandKitStore } from "../brand_kit_store";

function userId(req: Request): string {
  // Guaranteed by `user.verifyToken`, which runs before this router.
  return req.canva.user?.userId ?? "unknown";
}

function readDraft(body: unknown): BrandKitDraft | undefined {
  if (body == null || typeof body !== "object") {
    return undefined;
  }

  const { name, palette, styleNotes } = body as Record<string, unknown>;

  if (typeof name !== "string") {
    return undefined;
  }
  if (!Array.isArray(palette) || palette.length > MAX_PALETTE_COLOURS) {
    return undefined;
  }
  if (!palette.every((entry): entry is string => typeof entry === "string")) {
    return undefined;
  }

  return {
    name,
    palette,
    styleNotes: typeof styleNotes === "string" ? styleNotes : "",
  };
}

export function createBrandKitRouter(): express.Router {
  const router = express.Router();

  router.get("/api/brand-kits", async (req, res, next) => {
    try {
      res.status(200).json({ kits: await getBrandKitStore().list(userId(req)) });
    } catch (error) {
      next(error);
    }
  });

  router.post("/api/brand-kits", async (req, res, next) => {
    try {
      const draft = readDraft(req.body);

      if (!draft) {
        res.status(400).json({
          error: "invalid_brand_kit",
          message: "Brand kit is malformed.",
        });
        return;
      }

      const invalid = validateBrandKit(draft);
      if (invalid) {
        res.status(400).json({ error: "invalid_brand_kit", message: invalid });
        return;
      }

      const result = await getBrandKitStore().create(userId(req), draft);

      if (!result.ok) {
        res.status(409).json({
          error: "brand_kit_limit_reached",
          message: "You've reached the maximum number of brand kits.",
        });
        return;
      }

      res.status(201).json({ kit: result.kit });
    } catch (error) {
      next(error);
    }
  });

  router.delete("/api/brand-kits/:id", async (req, res, next) => {
    try {
      const removed = await getBrandKitStore().remove(
        userId(req),
        req.params.id ?? "",
      );

      res.sendStatus(removed ? 204 : 404);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
