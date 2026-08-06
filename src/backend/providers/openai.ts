import { randomUUID } from "node:crypto";
import type { GenerateOptions, GeneratedAsset, ImageProvider } from "./types";
import { ProviderError } from "./types";

const ENDPOINT = "https://api.openai.com/v1/images/generations";
const MODEL = process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-1";
const REQUEST_TIMEOUT_MS = Number(process.env.OPENAI_TIMEOUT_MS ?? 120_000);

/**
 * `gpt-image-1` supports 1024x1024, 1536x1024 and 1024x1536. Anything else is
 * rejected, so map the requested aspect onto the nearest supported size rather
 * than passing raw numbers through.
 */
function sizeFor(options: GenerateOptions): string {
  const ratio = options.width / options.height;

  if (ratio > 1.2) {
    return "1536x1024";
  }
  if (ratio < 0.85) {
    return "1024x1536";
  }
  return "1024x1024";
}

function dimensionsOf(size: string): { width: number; height: number } {
  const [width, height] = size.split("x").map(Number);
  return { width: width ?? 1024, height: height ?? 1024 };
}

function buildPrompt(options: GenerateOptions): string {
  const parts = [options.prompt.trim()];

  if (options.brandDirective) {
    parts.push(options.brandDirective);
  }

  if (options.style && options.style !== "default") {
    parts.push(`Style: ${options.style}.`);
  }

  return parts.join(" ");
}

type ImagesResponse = {
  data?: { b64_json?: string }[];
  error?: { message?: string };
};

async function requestOneImage(
  prompt: string,
  size: string,
  quality: "low" | "high",
  apiKey: string,
): Promise<Buffer> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: MODEL, prompt, n: 1, size, quality }),
      signal: controller.signal,
    });
  } catch (caught) {
    const aborted = caught instanceof Error && caught.name === "AbortError";
    throw new ProviderError(
      aborted ? "Image generation timed out." : "Could not reach OpenAI.",
      true,
    );
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    let detail = "";
    try {
      const body = (await response.json()) as ImagesResponse;
      detail = body.error?.message ?? "";
    } catch {
      // Non-JSON error body.
    }

    // 429 and 5xx are worth retrying; a 400 means the prompt itself was
    // rejected and retrying would fail identically.
    const retryable = response.status === 429 || response.status >= 500;
    throw new ProviderError(
      `OpenAI returned ${response.status}${detail ? `: ${detail}` : ""}`,
      retryable,
    );
  }

  const body = (await response.json()) as ImagesResponse;
  const encoded = body.data?.[0]?.b64_json;

  if (!encoded) {
    throw new ProviderError("OpenAI returned no image data.", true);
  }

  return Buffer.from(encoded, "base64");
}

/**
 * OpenAI image generation.
 *
 * Variations are requested as separate concurrent calls rather than with
 * `n > 1`. It costs the same, gives more varied results, and means one failed
 * variation doesn't discard the whole batch.
 */
export const openAiProvider: ImageProvider = {
  name: "openai",

  async generate(options: GenerateOptions): Promise<GeneratedAsset[]> {
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      throw new ProviderError(
        "OPENAI_API_KEY is not set. Set it in .env, or use IMAGE_PROVIDER=mock.",
      );
    }

    const size = sizeFor(options);
    const { width, height } = dimensionsOf(size);
    const quality = options.quality === "high" ? "high" : "low";
    const prompt = buildPrompt(options);

    const results = await Promise.allSettled(
      Array.from({ length: options.count }, () =>
        requestOneImage(prompt, size, quality, apiKey),
      ),
    );

    const assets: GeneratedAsset[] = results
      .filter(
        (result): result is PromiseFulfilledResult<Buffer> =>
          result.status === "fulfilled",
      )
      .map((result) => ({
        id: randomUUID(),
        mimeType: "image/png" as const,
        width,
        height,
        body: result.value,
      }));

    if (assets.length === 0) {
      // Surface the first real reason rather than a generic failure.
      const firstRejection = results.find(
        (result): result is PromiseRejectedResult => result.status === "rejected",
      );
      const reason = firstRejection?.reason;

      throw reason instanceof ProviderError
        ? reason
        : new ProviderError("Image generation failed.", true);
    }

    return assets;
  },
};
