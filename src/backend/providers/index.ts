import { mockProvider } from "./mock";
import { openAiProvider } from "./openai";
import type { ImageProvider } from "./types";

/**
 * Providers keyed by the value of the `IMAGE_PROVIDER` environment variable.
 *
 * - `mock`   — SVG placeholders, no API key, for testing the billing path.
 * - `openai` — real generation, needs `OPENAI_API_KEY`.
 *
 * A new provider only has to implement `ImageProvider`. It must not perform
 * its own entitlement checks — by the time `generate` is called, the request
 * has already passed `requireBillableAction` and is inside an open tracking
 * session.
 */
const providers: Record<string, ImageProvider> = {
  mock: mockProvider,
  openai: openAiProvider,
};

export function getProvider(): ImageProvider {
  const requested = process.env.IMAGE_PROVIDER ?? "mock";
  const provider = providers[requested];

  if (!provider) {
    throw new Error(
      `Unknown IMAGE_PROVIDER '${requested}'. Registered: ${Object.keys(providers).join(", ")}.`,
    );
  }

  return provider;
}

export type { GenerateOptions, GeneratedAsset, ImageProvider } from "./types";
export { ProviderError } from "./types";
