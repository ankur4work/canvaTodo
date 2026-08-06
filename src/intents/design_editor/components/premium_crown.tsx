import {
  PremiumAppsProgramProFilledGoldIcon,
  PremiumAppsProgramProFilledIcon,
} from "@canva/app-ui-kit/icons";

type Props = {
  /** Whether the current user's plan already covers the premium features. */
  entitled: boolean;
};

/**
 * Canva's premium indicator.
 *
 * Gold for users who would need to upgrade, grey for users already on a plan
 * that covers it — that pairing is specified in Canva's premium app design
 * guidelines, and reviewers look for it.
 *
 * ⚠️ These two icons are reserved for apps enrolled in the Premium Apps
 * Program. Canva's own type declarations state that unauthorized use "will
 * result in a failed review process". Never render this component until you
 * have been accepted: `usePremiumAccess` returns `showPremiumUi: false` while
 * the monetization API is unavailable, which is what keeps that from
 * happening by accident.
 *
 * The icon is decorative — it always sits next to a text label that carries
 * the meaning, so it takes no accessible name of its own. (Canva's icon
 * components accept only a `size` prop, so it could not take one anyway.)
 *
 * Always render this *after* the label it belongs to. The guidelines call out
 * placing the crown before button text as a mistake.
 */
export const PremiumCrown = ({ entitled }: Props) =>
  entitled ? (
    <PremiumAppsProgramProFilledIcon />
  ) : (
    <PremiumAppsProgramProFilledGoldIcon />
  );
