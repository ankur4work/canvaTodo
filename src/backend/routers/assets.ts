import express from "express";
import { getAsset } from "../asset_store";

/**
 * Serves generated images to Canva.
 *
 * This router is mounted *before* token verification, and that is deliberate
 * rather than an oversight. Canva fetches asset URLs server-side, from its own
 * infrastructure — there is no Canva user token available to attach to that
 * request, so an authenticated endpoint here would simply never be reachable.
 *
 * What protects it instead is the id: 32 bytes of CSPRNG output minted per
 * asset, expiring within the hour. The URL is the capability. Nothing here
 * reads user input beyond that id, and a miss is indistinguishable from an
 * expiry, so the endpoint leaks nothing about what other ids might exist.
 */
export function createAssetRouter(): express.Router {
  const router = express.Router();

  router.get("/api/assets/:id", (req, res) => {
    const asset = getAsset(req.params.id);

    if (!asset) {
      res.status(404).json({
        error: "not_found",
        message: "That image has expired.",
      });
      return;
    }

    /**
     * Open CORS, deliberately, and different from every other route here.
     *
     * `@canva/asset`'s type declarations require that a `thumbnailUrl` "must
     * support Cross-Origin Resource Sharing", and Canva renders that thumbnail
     * inside its own editor UI while the upload is queued — not inside the app
     * iframe. The global `cors()` config allows only the app origin, so the
     * browser fetched the image, then discarded it, and `upload()` failed. The
     * server log showed a clean 200, which made it look like the asset path
     * was working.
     *
     * `*` gives away nothing: the endpoint is already unauthenticated, and the
     * only thing protecting an asset is the unguessable id in the URL. CORS
     * never protected it and was never meant to.
     */
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");

    res.setHeader("Content-Type", asset.mimeType);
    res.setHeader("Content-Length", String(asset.body.byteLength));
    // Immutable content behind an unguessable id, so it is safe to cache — but
    // only for as long as the store will actually still serve it.
    res.setHeader("Cache-Control", "private, max-age=3600");
    // Canva checks Content-Type strictly; stop any sniffing from overriding it.
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.status(200).send(asset.body);
  });

  return router;
}
