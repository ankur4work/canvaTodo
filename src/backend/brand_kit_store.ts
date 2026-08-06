import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { BrandKit, BrandKitDraft } from "../shared/brand_kit";
import { BRAND_KIT_LIMIT } from "../shared/brand_kit";

export type CreateResult =
  | { ok: true; kit: BrandKit }
  | { ok: false; reason: "limit_reached" };

export interface BrandKitStore {
  list(userId: string): Promise<BrandKit[]>;
  get(userId: string, kitId: string): Promise<BrandKit | undefined>;
  create(userId: string, draft: BrandKitDraft): Promise<CreateResult>;
  remove(userId: string, kitId: string): Promise<boolean>;
}

type Data = Record<string, BrandKit[]>;

/**
 * A JSON-file store, sized for a single backend instance on a VPS.
 *
 * Writes go to a temp file and are renamed into place, so a crash mid-write
 * can't truncate the data. Writes are also chained, so two concurrent requests
 * can't interleave a read-modify-write.
 *
 * This does not scale past one process — two instances would each hold their
 * own copy in memory and clobber each other. Swap in a Postgres or SQLite
 * implementation of `BrandKitStore` before you run more than one; nothing
 * outside this file needs to change.
 */
export class JsonFileBrandKitStore implements BrandKitStore {
  private readonly filePath: string;
  private cache?: Data;
  private writeChain: Promise<unknown> = Promise.resolve();

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  private async load(): Promise<Data> {
    if (this.cache) {
      return this.cache;
    }

    try {
      const raw = await readFile(this.filePath, "utf8");
      this.cache = JSON.parse(raw) as Data;
    } catch {
      // Missing or unreadable file — start empty rather than crashing the
      // server on first boot.
      this.cache = {};
    }

    return this.cache;
  }

  private async persist(data: Data): Promise<void> {
    const directory = path.dirname(this.filePath);
    await mkdir(directory, { recursive: true });

    const temp = `${this.filePath}.${randomUUID()}.tmp`;
    await writeFile(temp, JSON.stringify(data, null, 2), "utf8");
    await rename(temp, this.filePath);
  }

  /** Serialises mutations so concurrent requests can't lose writes. */
  private mutate<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.writeChain.then(operation, operation);
    // Keep the chain alive even if this operation rejects.
    this.writeChain = next.catch(() => undefined);
    return next;
  }

  async list(userId: string): Promise<BrandKit[]> {
    const data = await this.load();
    return data[userId] ?? [];
  }

  async get(userId: string, kitId: string): Promise<BrandKit | undefined> {
    const kits = await this.list(userId);
    return kits.find((kit) => kit.id === kitId);
  }

  create(userId: string, draft: BrandKitDraft): Promise<CreateResult> {
    return this.mutate(async () => {
      const data = await this.load();
      const kits = data[userId] ?? [];

      if (kits.length >= BRAND_KIT_LIMIT) {
        return { ok: false, reason: "limit_reached" } as const;
      }

      const kit: BrandKit = {
        id: randomUUID(),
        name: draft.name.trim(),
        palette: draft.palette,
        styleNotes: draft.styleNotes.trim(),
      };

      data[userId] = [...kits, kit];
      await this.persist(data);

      return { ok: true, kit } as const;
    });
  }

  remove(userId: string, kitId: string): Promise<boolean> {
    return this.mutate(async () => {
      const data = await this.load();
      const kits = data[userId] ?? [];
      const remaining = kits.filter((kit) => kit.id !== kitId);

      if (remaining.length === kits.length) {
        return false;
      }

      data[userId] = remaining;
      await this.persist(data);

      return true;
    });
  }
}

let store: BrandKitStore | undefined;

export function getBrandKitStore(): BrandKitStore {
  if (!store) {
    store = new JsonFileBrandKitStore(
      process.env.BRAND_KIT_DATA_FILE ??
        path.join(process.cwd(), "data", "brand-kits.json"),
    );
  }

  return store;
}

/** Test seam. */
export function setBrandKitStore(next: BrandKitStore | undefined): void {
  store = next;
}
