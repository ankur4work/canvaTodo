/**
 * Shared between the frontend and the backend. Keep this file free of imports
 * so it can be bundled into the app and required by the server alike.
 */

export type BrandKit = {
  id: string;
  name: string;
  /** Hex colors, e.g. "#1A73E8". First entry is treated as the primary. */
  palette: string[];
  /** Free-text direction, e.g. "warm, editorial, lots of negative space". */
  styleNotes: string;
};

export type BrandKitDraft = Omit<BrandKit, "id">;

/**
 * Brand kits are free for every user.
 *
 * They can't be a paid feature: Canva only meters the twelve billable actions,
 * so gating kit count would restrict something you'd never be paid for while
 * making the free tier worse. The premium lever is the generation itself.
 * This limit exists only to bound storage.
 */
export const BRAND_KIT_LIMIT = 3;

export const MAX_PALETTE_COLORS = 6;
export const MAX_KIT_NAME_LENGTH = 40;
export const MAX_STYLE_NOTES_LENGTH = 200;

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export function isValidHexColor(value: string): boolean {
  return HEX_COLOR.test(value);
}

export type BrandKitValidationError =
  | "name_required"
  | "name_too_long"
  | "palette_required"
  | "palette_too_large"
  | "palette_invalid_color"
  | "style_notes_too_long";

/** Shared so the frontend can pre-validate and the backend can enforce. */
export function validateBrandKit(
  draft: BrandKitDraft,
): BrandKitValidationError | undefined {
  const name = draft.name.trim();

  if (name.length === 0) {
    return "name_required";
  }
  if (name.length > MAX_KIT_NAME_LENGTH) {
    return "name_too_long";
  }
  if (draft.palette.length === 0) {
    return "palette_required";
  }
  if (draft.palette.length > MAX_PALETTE_COLORS) {
    return "palette_too_large";
  }
  if (!draft.palette.every(isValidHexColor)) {
    return "palette_invalid_color";
  }
  if (draft.styleNotes.length > MAX_STYLE_NOTES_LENGTH) {
    return "style_notes_too_long";
  }

  return undefined;
}

/**
 * Turns a brand kit into prompt direction.
 *
 * This is the whole point of the app: the user's palette and tone are applied
 * on every generation without them having to describe it each time, which is
 * what Canva's built-in generator can't do.
 */
export function brandDirective(kit: BrandKit): string {
  const parts = [
    `Use strictly this color palette: ${kit.palette.join(", ")}.`,
    "Do not introduce colors outside this palette.",
  ];

  const notes = kit.styleNotes.trim();
  if (notes.length > 0) {
    parts.push(`Art direction: ${notes}.`);
  }

  return parts.join(" ");
}
