import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { JsonFileBrandKitStore } from "../brand_kit_store";
import { BRAND_KIT_LIMIT } from "../../shared/brand_kit";

const USER = "user-1";
const OTHER_USER = "user-2";

const draft = (name: string) => ({
  name,
  palette: ["#123456"],
  styleNotes: "warm and editorial",
});

describe("JsonFileBrandKitStore", () => {
  let directory: string;
  let filePath: string;

  beforeEach(() => {
    directory = path.join(os.tmpdir(), `brand-kits-${randomUUID()}`);
    filePath = path.join(directory, "brand-kits.json");
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it("starts empty when the file does not exist", async () => {
    const store = new JsonFileBrandKitStore(filePath);

    await expect(store.list(USER)).resolves.toEqual([]);
  });

  it("creates and reads back a kit", async () => {
    const store = new JsonFileBrandKitStore(filePath);

    const result = await store.create(USER, draft("Main brand"));

    expect(result.ok).toBe(true);
    const kits = await store.list(USER);
    expect(kits).toHaveLength(1);
    expect(kits[0]?.name).toBe("Main brand");
    expect(kits[0]?.id).toEqual(expect.any(String));
  });

  it("persists across instances", async () => {
    const first = new JsonFileBrandKitStore(filePath);
    await first.create(USER, draft("Main brand"));

    // A fresh instance reads from disk, proving the write actually landed.
    const second = new JsonFileBrandKitStore(filePath);
    const kits = await second.list(USER);

    expect(kits).toHaveLength(1);
    expect(kits[0]?.name).toBe("Main brand");
  });

  it("keeps each user's kits separate", async () => {
    const store = new JsonFileBrandKitStore(filePath);

    await store.create(USER, draft("Mine"));

    await expect(store.list(OTHER_USER)).resolves.toEqual([]);
  });

  it("enforces the kit limit", async () => {
    const store = new JsonFileBrandKitStore(filePath);

    for (let index = 0; index < BRAND_KIT_LIMIT; index++) {
      const result = await store.create(USER, draft(`Kit ${index}`));
      expect(result.ok).toBe(true);
    }

    const overflow = await store.create(USER, draft("One too many"));

    expect(overflow).toEqual({ ok: false, reason: "limit_reached" });
    await expect(store.list(USER)).resolves.toHaveLength(BRAND_KIT_LIMIT);
  });

  it("does not lose writes when creates run concurrently", async () => {
    const store = new JsonFileBrandKitStore(filePath);

    // Without serialised writes these interleave and some are lost.
    await Promise.all([
      store.create(USER, draft("A")),
      store.create(USER, draft("B")),
      store.create(USER, draft("C")),
    ]);

    const kits = await store.list(USER);

    expect(kits).toHaveLength(3);
    expect(kits.map((kit) => kit.name).sort()).toEqual(["A", "B", "C"]);
  });

  it("removes a kit and reports whether it existed", async () => {
    const store = new JsonFileBrandKitStore(filePath);
    const created = await store.create(USER, draft("Main brand"));

    if (!created.ok) {
      throw new Error("Expected the kit to be created.");
    }

    await expect(store.remove(USER, created.kit.id)).resolves.toBe(true);
    await expect(store.list(USER)).resolves.toEqual([]);
    await expect(store.remove(USER, created.kit.id)).resolves.toBe(false);
  });

  it("will not let one user delete another user's kit", async () => {
    const store = new JsonFileBrandKitStore(filePath);
    const created = await store.create(USER, draft("Main brand"));

    if (!created.ok) {
      throw new Error("Expected the kit to be created.");
    }

    await expect(store.remove(OTHER_USER, created.kit.id)).resolves.toBe(false);
    await expect(store.list(USER)).resolves.toHaveLength(1);
  });
});
