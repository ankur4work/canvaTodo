import { randomUUID } from "node:crypto";
import type { GenerateOptions, GeneratedAsset, ImageProvider } from "./types";

/**
 * A deterministic, dependency-free stand-in for a real image model.
 *
 * It exists so the whole billing path — entitlement check, tracking session,
 * usage header, backend authorization, asset upload — can be run and verified
 * end to end without an API key or a cent of inference spend. Replace it with
 * a real provider before you submit; keep it around for tests.
 */

function hash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function hueFrom(seed: number, offset: number): number {
  return (seed + offset) % 360;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Wraps text so long prompts don't overflow the canvas. */
function wrap(text: string, perLine: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > perLine && current) {
      lines.push(current);
      current = word;
      if (lines.length === maxLines) {
        break;
      }
    } else {
      current = candidate;
    }
  }

  if (current && lines.length < maxLines) {
    lines.push(current);
  }

  const truncated =
    lines.length === maxLines &&
    words.join(" ").length > lines.join(" ").length;

  if (truncated) {
    const last = lines[maxLines - 1] ?? "";
    lines[maxLines - 1] = `${last.slice(0, perLine - 1)}…`;
  }

  return lines;
}

function renderSvg(options: GenerateOptions, variation: number): string {
  const { prompt, width, height, tier, style, brandPalette } = options;
  const seed = hash(`${prompt}:${style ?? ""}:${variation}`);
  const gradientId = `g${seed.toString(36)}`;

  // When a brand kit is applied, draw with its actual colours. That makes
  // brand-locking verifiable end to end without an API key: change the
  // palette, regenerate, see different colours.
  const [brandStart, brandEnd] = (() => {
    const primary = brandPalette?.[0];
    if (primary === undefined) {
      return [undefined, undefined] as const;
    }
    const secondary =
      brandPalette?.[variation % brandPalette.length] ?? primary;
    return [primary, secondary] as const;
  })();

  const startColour = brandStart ?? `hsl(${hueFrom(seed, 0)} 72% 52%)`;
  const endColour = brandEnd ?? `hsl(${hueFrom(seed, 140)} 68% 42%)`;

  const lines = wrap(prompt, 26, 3);
  const fontSize = Math.round(width / 22);
  const lineHeight = Math.round(fontSize * 1.35);
  const startY = height / 2 - ((lines.length - 1) * lineHeight) / 2;

  const text = lines
    .map(
      (line, index) =>
        `<text x="50%" y="${startY + index * lineHeight}" text-anchor="middle" ` +
        `dominant-baseline="middle" font-family="Inter, Segoe UI, sans-serif" ` +
        `font-size="${fontSize}" font-weight="600" fill="#ffffff">${escapeXml(line)}</text>`,
    )
    .join("");

  const badge =
    tier === "premium"
      ? `High quality · ${style ?? "default"}`
      : "Standard";

  // Blobs give each variation a distinct look without any real model.
  const blobs = [0, 1, 2]
    .map((index) => {
      const bs = hash(`${seed}:${index}`);
      const cx = bs % width;
      const cy = (bs >> 8) % height;
      const r = (bs >> 16) % Math.round(width / 3);
      return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#ffffff" opacity="0.07"/>`;
    })
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="${gradientId}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${escapeXml(startColour)}"/>
      <stop offset="100%" stop-color="${escapeXml(endColour)}"/>
    </linearGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#${gradientId})"/>
  ${blobs}
  ${text}
  <text x="50%" y="${height - Math.round(height / 14)}" text-anchor="middle" font-family="Inter, Segoe UI, sans-serif" font-size="${Math.round(fontSize * 0.6)}" fill="#ffffff" opacity="0.75">${escapeXml(badge)} · sample output</text>
</svg>`;
}

export const mockProvider: ImageProvider = {
  name: "mock",

  async generate(options: GenerateOptions): Promise<GeneratedAsset[]> {
    return Array.from({ length: options.count }, (_unused, variation) => ({
      id: randomUUID(),
      mimeType: "image/svg+xml" as const,
      width: options.width,
      height: options.height,
      body: Buffer.from(renderSvg(options, variation), "utf8"),
    }));
  },
};
