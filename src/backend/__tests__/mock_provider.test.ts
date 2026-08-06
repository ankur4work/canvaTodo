import { mockProvider } from "../providers/mock";
import type { GenerateOptions, GeneratedAsset } from "../providers/types";

const premiumOptions: GenerateOptions = {
  prompt: "A calm mountain lake at sunrise",
  tier: "premium",
  quality: "high",
  style: "photographic",
  count: 4,
  width: 1024,
  height: 1024,
};

/** Fails the test loudly rather than propagating an undefined. */
function first(assets: GeneratedAsset[]): GeneratedAsset {
  const [asset] = assets;
  if (!asset) {
    throw new Error("Expected at least one generated asset.");
  }
  return asset;
}

function svgOf(assets: GeneratedAsset[]): string {
  return first(assets).body.toString("utf8");
}

describe("mockProvider", () => {
  it("returns the requested number of assets", async () => {
    const assets = await mockProvider.generate(premiumOptions);

    expect(assets).toHaveLength(4);
    expect(new Set(assets.map((asset) => asset.id)).size).toBe(4);
  });

  it("produces well-formed SVG at the requested size", async () => {
    const assets = await mockProvider.generate(premiumOptions);
    const asset = first(assets);
    const svg = asset.body.toString("utf8");

    expect(asset.mimeType).toBe("image/svg+xml");
    expect(asset.width).toBe(1024);
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg.trimEnd().endsWith("</svg>")).toBe(true);
    expect(svg).toContain(`width="1024"`);
  });

  it("varies each result so the four premium images differ", async () => {
    const assets = await mockProvider.generate(premiumOptions);
    const bodies = new Set(assets.map((asset) => asset.body.toString("utf8")));

    expect(bodies.size).toBe(4);
  });

  it("is deterministic for the same prompt", async () => {
    const first = await mockProvider.generate(premiumOptions);
    const second = await mockProvider.generate(premiumOptions);

    expect(svgOf(first)).toBe(svgOf(second));
  });

  it("escapes prompt text so a prompt can't inject markup", async () => {
    const svg = svgOf(
      await mockProvider.generate({
        ...premiumOptions,
        prompt: `a <script>alert(1)</script> & "quotes"`,
        count: 1,
      }),
    );

    expect(svg).not.toContain("<script>");
    expect(svg).toContain("&lt;script&gt;");
  });

  it("truncates very long prompts instead of overflowing the canvas", async () => {
    const svg = svgOf(
      await mockProvider.generate({
        ...premiumOptions,
        prompt: "word ".repeat(200),
        count: 1,
      }),
    );

    // Three wrapped lines at most, plus the badge line.
    expect(svg.match(/<text/g)?.length).toBeLessThanOrEqual(4);
    expect(svg).toContain("…");
  });

  it("renders with the brand palette when a brand kit is applied", async () => {
    const svg = svgOf(
      await mockProvider.generate({
        ...premiumOptions,
        count: 1,
        brandPalette: ["#123456", "#abcdef"],
        brandDirective: "Use strictly this colour palette: #123456, #abcdef.",
      }),
    );

    // Brand-locking has to be visible in the output, not just in the prompt.
    expect(svg).toContain("#123456");
  });
});
