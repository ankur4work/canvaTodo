import {
  assetStoreStats,
  getAsset,
  putAsset,
  resetAssetStore,
} from "../asset_store";
import type { GeneratedAsset } from "../providers";

function asset(bytes = 16): GeneratedAsset {
  return {
    id: "asset-1",
    mimeType: "image/png",
    width: 1024,
    height: 1024,
    body: Buffer.alloc(bytes, 1),
  };
}

describe("asset store", () => {
  beforeEach(() => {
    resetAssetStore();
    jest.useRealTimers();
  });

  it("round-trips a stored asset", () => {
    const id = putAsset(asset());
    const stored = getAsset(id);

    expect(stored?.mimeType).toBe("image/png");
    expect(stored?.body.byteLength).toBe(16);
  });

  it("mints unguessable, unique ids", () => {
    const ids = new Set(Array.from({ length: 50 }, () => putAsset(asset())));

    expect(ids.size).toBe(50);

    // The URL is the only thing protecting the asset, so a short or
    // predictable id would be the whole security story failing.
    for (const id of ids) {
      expect(id.length).toBeGreaterThanOrEqual(40);
      expect(id).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });

  it("returns undefined for an unknown id", () => {
    expect(getAsset("nope")).toBeUndefined();
  });

  it("expires assets once the TTL passes", () => {
    const id = putAsset(asset());
    const realNow = Date.now;

    try {
      Date.now = () => realNow() + 61 * 60 * 1000;
      expect(getAsset(id)).toBeUndefined();
    } finally {
      Date.now = realNow;
    }
  });

  it("tracks total bytes and releases them on expiry", () => {
    const id = putAsset(asset(1000));
    expect(assetStoreStats()).toEqual({ count: 1, bytes: 1000 });

    const realNow = Date.now;
    try {
      Date.now = () => realNow() + 61 * 60 * 1000;
      getAsset(id);
    } finally {
      Date.now = realNow;
    }

    expect(assetStoreStats()).toEqual({ count: 0, bytes: 0 });
  });
});
