/**
 * Prompt moderation.
 *
 * Canva's app review expects a generative AI app to have thought about
 * offensive input, and their own generative AI template ships a filter. This
 * is that filter: it runs before any provider call, on both tiers, so a
 * rejected prompt costs nothing and is never billed.
 *
 * The real work is done by OpenAI's moderation endpoint rather than a
 * hand-written word list. A keyword list is trivially defeated by rewording
 * and racks up false positives on innocent prompts ("a scene from the Great
 * Fire of London"), which matters here because a false positive blocks a
 * paying user from the thing they came for. The moderation endpoint is free
 * and does not count against image quota.
 */

const ENDPOINT = "https://api.openai.com/v1/moderations";
const MODEL = process.env.OPENAI_MODERATION_MODEL ?? "omni-moderation-latest";
const TIMEOUT_MS = Number(process.env.MODERATION_TIMEOUT_MS ?? 8_000);

/**
 * What to do when the moderation service itself is unreachable.
 *
 * `open` (the default) lets generation proceed, so an OpenAI incident degrades
 * the filter rather than taking the whole app down. The local backstop below
 * still applies either way. Set `MODERATION_FAIL_MODE=closed` to refuse
 * instead if you would rather be conservative.
 */
const FAIL_CLOSED =
  process.env.MODERATION_FAIL_MODE?.trim().toLowerCase() === "closed";

export class ModerationError extends Error {
  constructor(message = "That prompt can't be used.") {
    super(message);
    this.name = "ModerationError";
  }
}

/**
 * Categories that block generation outright.
 *
 * Deliberately narrower than "everything the API can flag". `violence` alone
 * would reject a battle scene and `sexual` alone would reject fine-art nudes,
 * neither of which is what this filter is for. These are the categories where
 * generating the image would be harmful regardless of intent.
 */
const BLOCKING_CATEGORIES = [
  "sexual/minors",
  "hate/threatening",
  "harassment/threatening",
  "self-harm/intent",
  "self-harm/instructions",
  "violence/graphic",
];

/**
 * Local backstop for the one category where failing open is not acceptable:
 * sexualised depictions of minors. Matches only when a minor term and a sexual
 * term appear together, which keeps "a child's birthday party" clear while
 * still catching the obvious cases if OpenAI is unreachable.
 */
const MINOR_TERMS =
  /\b(child|children|kid|kids|minor|minors|toddler|infant|baby|babies|preteen|pre-teen|teen|teens|teenage|teenager|underage|schoolgirl|schoolboy|boy|girl)\b/i;
const SEXUAL_TERMS =
  /\b(nude|nudes|naked|nsfw|porn|porno|pornographic|erotic|erotica|sexual|sexy|sex|lewd|explicit|fetish|topless|undressed|lingerie)\b/i;

function violatesLocalBackstop(prompt: string): boolean {
  return MINOR_TERMS.test(prompt) && SEXUAL_TERMS.test(prompt);
}

type ModerationResponse = {
  results?: {
    flagged?: boolean;
    categories?: Record<string, boolean>;
  }[];
};

async function flaggedCategories(
  prompt: string,
  apiKey: string,
): Promise<string[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: MODEL, input: prompt }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Moderation returned ${response.status}`);
    }

    const body = (await response.json()) as ModerationResponse;
    const categories = body.results?.[0]?.categories ?? {};

    return BLOCKING_CATEGORIES.filter((category) => categories[category]);
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Throws `ModerationError` if the prompt must not be generated.
 *
 * The thrown message is intentionally vague. Telling a user exactly which
 * category tripped turns the filter into an oracle for probing its edges, and
 * the app shows a single "try rewording it" message regardless.
 */
export async function assertPromptAllowed(prompt: string): Promise<void> {
  if (violatesLocalBackstop(prompt)) {
    throw new ModerationError();
  }

  const apiKey = process.env.OPENAI_API_KEY;

  // No key means the mock provider is in use and nothing reaches a real model.
  // The backstop above has already run.
  if (!apiKey) {
    return;
  }

  let blocked: string[];
  try {
    blocked = await flaggedCategories(prompt, apiKey);
  } catch (caught) {
    // eslint-disable-next-line no-console
    console.warn(
      `[moderation] check failed, ${FAIL_CLOSED ? "refusing" : "allowing"} the prompt:`,
      caught instanceof Error ? caught.message : caught,
    );

    if (FAIL_CLOSED) {
      throw new ModerationError(
        "Prompts can't be checked right now. Please try again shortly.",
      );
    }
    return;
  }

  if (blocked.length > 0) {
    throw new ModerationError();
  }
}
