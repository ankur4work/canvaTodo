import { randomBytes } from "node:crypto";
import type { GeneratedAsset } from "./providers";

/**
 * Short-lived store for generated images so they can be served over HTTPS
 * instead of inlined into the JSON response as base64 data URLs.
 *
 * Why this exists: `gpt-image-1` returns PNGs around 1MB each, and a premium
 * generation produces four of them. Base64 inflates bytes by ~33%, so the
 * response body for one premium generation approaches 6MB — every byte of it
 * held in memory by the backend, pushed through the JSON serializer, and
 * parsed again in the app iframe. Serving URLs keeps the JSON response in the
 * hundreds of bytes and lets Canva fetch the images directly.
 *
 * This is deliberately in-process rather than S3-backed. It is one moving part
 * fewer for a single-VPS deployment, and the lifetime required is minutes:
 * Canva copies the image into its own asset storage at upload time, so nothing
 * here needs to survive past that. Swap `putAsset`/`getAsset` for an object
 * storage client if you ever run more than one backend instance — a URL minted
 * by instance A is a 404 on instance B.
 */

/**
 * How long a generated image stays fetchable. Long enough that a user can
 * browse results and insert one unhurried; short enough that abandoned
 * generations don't accumulate.
 */
const TTL_MS = Number(process.env.ASSET_TTL_MS ?? 60 * 60 * 1000);

/**
 * Ceiling on total bytes held. Past this the oldest assets are dropped, which
 * bounds memory on a busy instance at the cost of a stale URL 404ing — the app
 * surfaces that as a normal insert failure.
 */
const MAX_BYTES = Number(process.env.ASSET_CACHE_MAX_BYTES ?? 512 * 1024 * 1024);

type StoredAsset = {
  body: Buffer;
  mimeType: string;
  expiresAt: number;
};

/** Insertion-ordered, which is what makes the oldest-first eviction below work. */
const assets = new Map<string, StoredAsset>();
let totalBytes = 0;

function drop(id: string): void {
  const existing = assets.get(id);
  if (existing) {
    totalBytes -= existing.body.byteLength;
    assets.delete(id);
  }
}

function evict(now: number): void {
  for (const [id, asset] of assets) {
    if (now >= asset.expiresAt) {
      drop(id);
    }
  }

  // Map iteration is insertion order, so this drops least-recently-stored first.
  for (const id of assets.keys()) {
    if (totalBytes <= MAX_BYTES) {
      break;
    }
    drop(id);
  }
}

/**
 * Stores an asset and returns its id.
 *
 * The id is 32 bytes of CSPRNG output rather than the asset's own uuid. The
 * serving endpoint cannot be authenticated — Canva fetches asset URLs from its
 * own infrastructure, with no Canva user token to present — so the URL itself
 * is the capability. That is only safe if the id is unguessable, and a v4 uuid
 * that also appears in an API response body is weaker than it looks.
 */
export function putAsset(asset: GeneratedAsset): string {
  const now = Date.now();
  const id = randomBytes(32).toString("base64url");

  assets.set(id, {
    body: asset.body,
    mimeType: asset.mimeType,
    expiresAt: now + TTL_MS,
  });
  totalBytes += asset.body.byteLength;

  evict(now);

  return id;
}

export function getAsset(id: string): StoredAsset | undefined {
  const asset = assets.get(id);

  if (!asset) {
    return undefined;
  }

  if (Date.now() >= asset.expiresAt) {
    drop(id);
    return undefined;
  }

  return asset;
}

/** Exposed for tests. */
export function resetAssetStore(): void {
  assets.clear();
  totalBytes = 0;
}

/** Exposed for tests. */
export function assetStoreStats(): { count: number; bytes: number } {
  return { count: assets.size, bytes: totalBytes };
}
