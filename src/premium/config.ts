import type { BillableAction } from "@canva/user";

/**
 * The billable action this app meters premium usage against.
 *
 * Canva bills and pays out against this exact string, so it must describe the
 * work the app actually performs. This app generates images, so every premium
 * generation is tracked as `generate_image`.
 *
 * If you add a second kind of premium work (for example generating copy for a
 * caption), give it its own action and its own backend endpoint. Canva's docs
 * are explicit that each billable action needs a separate endpoint so that one
 * entitlement can't be spent on a different feature.
 */
export const PREMIUM_ACTION: BillableAction = "generate_image";

/**
 * Set to `true` only once Canva has accepted this app into the Premium Apps
 * Program.
 *
 * This is a deliberate manual switch rather than something inferred at
 * runtime. Two of Canva's rules make guessing dangerous:
 *
 *  - The premium crown icons are reserved for enrolled apps, and Canva's own
 *    type declarations warn that unauthorized use "will result in a failed
 *    review process".
 *  - The docs say the monetization API "will only work for approved
 *    developers" but never say whether it rejects or simply returns `false`
 *    for everyone else. If it returns `false`, an app that inferred
 *    eligibility from the API would happily render a restricted icon to every
 *    free user and fail review.
 *
 * So: while this is `false`, the app never calls the monetization API and
 * never renders a premium affordance. It is a complete, submittable free app.
 */
export const PREMIUM_APPS_ENROLLED = false;

/**
 * Flip to `true` to exercise the premium path on your machine before Canva
 * accepts you into the Premium Apps Program.
 *
 * This only ever applies locally — see `isLocalDev` below. It cannot leak into
 * a production build, because a production build must not point at localhost.
 * The backend has an equivalent switch (`PREMIUM_DEV_OVERRIDE` in `.env`) and
 * both have to be on for an end-to-end premium run to succeed locally.
 */
const FORCE_PREMIUM_LOCALLY = false;

/**
 * `BACKEND_HOST` is injected by webpack at build time. It is undefined under
 * Jest, hence the `typeof` guard rather than a bare reference.
 */
function backendHost(): string {
  return typeof BACKEND_HOST === "string" ? BACKEND_HOST : "";
}

export function isLocalDev(): boolean {
  return backendHost().includes("localhost");
}

/**
 * True only when you are running against a local backend *and* have opted in.
 */
export function devForcePremium(): boolean {
  return isLocalDev() && FORCE_PREMIUM_LOCALLY;
}
