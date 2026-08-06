import { assertPromptAllowed, ModerationError } from "../moderation";

/**
 * The moderation endpoint is stubbed rather than called. These tests are about
 * this app's policy — which categories block, what happens when the service is
 * down, whether a refusal leaks detail — not about OpenAI's classifier.
 */
function stubModeration(categories: Record<string, boolean>) {
  return jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ results: [{ flagged: true, categories }] }),
  });
}

describe("assertPromptAllowed", () => {
  const originalFetch = global.fetch;
  const originalKey = process.env.OPENAI_API_KEY;

  beforeEach(() => {
    process.env.OPENAI_API_KEY = "test-key";
    delete process.env.MODERATION_FAIL_MODE;
    jest.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env.OPENAI_API_KEY = originalKey;
    jest.restoreAllMocks();
  });

  it("allows an ordinary prompt", async () => {
    global.fetch = stubModeration({}) as unknown as typeof fetch;

    await expect(
      assertPromptAllowed("a calm mountain lake at sunrise"),
    ).resolves.toBeUndefined();
  });

  it("blocks a prompt flagged in a blocking category", async () => {
    global.fetch = stubModeration({
      "sexual/minors": true,
    }) as unknown as typeof fetch;

    await expect(assertPromptAllowed("some prompt")).rejects.toBeInstanceOf(
      ModerationError,
    );
  });

  it("allows categories that are flagged but not blocking", async () => {
    // A battle scene trips `violence`; refusing it would be a false positive
    // on exactly the kind of image people legitimately ask for.
    global.fetch = stubModeration({
      violence: true,
      sexual: true,
    }) as unknown as typeof fetch;

    await expect(
      assertPromptAllowed("a dramatic battle scene"),
    ).resolves.toBeUndefined();
  });

  it("does not reveal which category tripped", async () => {
    global.fetch = stubModeration({
      "hate/threatening": true,
    }) as unknown as typeof fetch;

    await expect(assertPromptAllowed("some prompt")).rejects.toThrow(
      /can't be used/i,
    );
    await expect(assertPromptAllowed("some prompt")).rejects.not.toThrow(
      /hate/i,
    );
  });

  describe("local backstop", () => {
    it("blocks sexualised minors without calling the API at all", async () => {
      const fetchSpy = jest.fn();
      global.fetch = fetchSpy as unknown as typeof fetch;

      await expect(
        assertPromptAllowed("a nude child on a beach"),
      ).rejects.toBeInstanceOf(ModerationError);

      // It must hold even if OpenAI is unreachable, so it runs first.
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("does not fire on an innocent prompt containing a minor term", async () => {
      global.fetch = stubModeration({}) as unknown as typeof fetch;

      await expect(
        assertPromptAllowed("a child's birthday party with balloons"),
      ).resolves.toBeUndefined();
    });

    it("applies even with no API key configured", async () => {
      delete process.env.OPENAI_API_KEY;

      await expect(
        assertPromptAllowed("explicit photo of a teen"),
      ).rejects.toBeInstanceOf(ModerationError);
    });
  });

  describe("when the moderation service fails", () => {
    it("allows the prompt by default, so an outage doesn't stop the app", async () => {
      global.fetch = jest
        .fn()
        .mockRejectedValue(new Error("network down")) as unknown as typeof fetch;

      await expect(
        assertPromptAllowed("a calm mountain lake"),
      ).resolves.toBeUndefined();
    });

    it("refuses when MODERATION_FAIL_MODE=closed", async () => {
      jest.resetModules();
      process.env.MODERATION_FAIL_MODE = "closed";
      global.fetch = jest
        .fn()
        .mockRejectedValue(new Error("network down")) as unknown as typeof fetch;

      // The flag is read at module load, so re-import to pick it up.
      const reloaded = await import("../moderation");

      await expect(
        reloaded.assertPromptAllowed("a calm mountain lake"),
      ).rejects.toBeInstanceOf(reloaded.ModerationError);
    });

    it("treats a non-200 from the API as a failure", async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 500,
      }) as unknown as typeof fetch;

      await expect(
        assertPromptAllowed("a calm mountain lake"),
      ).resolves.toBeUndefined();
    });
  });
});
