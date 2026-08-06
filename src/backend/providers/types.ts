export type GenerationTier = "standard" | "premium";

/**
 * Maps to how much the provider is asked to spend on a single image. The
 * premium tier is what Canva meters, so this is the lever that has to be
 * visibly better.
 */
export type GenerationQuality = "standard" | "high";

export type GenerateOptions = {
  prompt: string;
  tier: GenerationTier;
  quality: GenerationQuality;
  /**
   * The user's brand kit rendered to prompt direction. Applied to every
   * generation so the user never has to restate their palette.
   */
  brandDirective?: string;
  /**
   * The raw palette behind `brandDirective`. Providers that draw locally (the
   * mock) render with it directly; model-backed providers use the text
   * directive instead.
   */
  brandPalette?: string[];
  /** Premium only. Ignored by the standard tier. */
  style?: string;
  /** How many variations to return. */
  count: number;
  width: number;
  height: number;
};

export type GeneratedAsset = {
  id: string;
  mimeType: "image/svg+xml" | "image/png" | "image/jpeg";
  width: number;
  height: number;
  /** Raw bytes of the image, ready to be served or encoded. */
  body: Buffer;
};

/**
 * Swap in a real model by implementing this interface and registering it in
 * `./index.ts`. Everything else — entitlement checks, tracking sessions,
 * billing attribution — stays exactly the same.
 *
 * Implementations must not perform their own entitlement checks. By the time
 * `generate` runs, the request has already passed `requireBillableAction` and
 * is inside an open tracking session.
 */
export interface ImageProvider {
  readonly name: string;
  generate(options: GenerateOptions): Promise<GeneratedAsset[]>;
}

/** Thrown by providers so the router can map failures to a clean status. */
export class ProviderError extends Error {
  readonly retryable: boolean;

  constructor(message: string, retryable = false) {
    super(message);
    this.name = "ProviderError";
    this.retryable = retryable;
  }
}
