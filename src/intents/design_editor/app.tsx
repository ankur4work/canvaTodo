import { useFeatureSupport } from "@canva/app-hooks";
import {
  Alert,
  Box,
  Button,
  FormField,
  MultilineInput,
  Rows,
  SegmentedControl,
  Select,
  Text,
  Title,
} from "@canva/app-ui-kit";
import { upload } from "@canva/asset";
import { addElementAtCursor, addElementAtPoint } from "@canva/design";
import { useCallback, useMemo, useState } from "react";
import { useIntl } from "react-intl";
import * as styles from "styles/components.css";
import type { GeneratedImage } from "../../api/client";
import { ApiError, generatePremium, generateStandard } from "../../api/client";
import { useBrandKits } from "../../brand/use_brand_kits";
import { PREMIUM_ACTION } from "../../premium/config";
import { runBillableAction } from "../../premium/run_billable_action";
import { usePremiumAccess } from "../../premium/use_premium_access";
import { BrandKitPanel } from "./components/brand_kit_panel";
import { PremiumCrown } from "./components/premium_crown";
import { ResultGrid } from "./components/result_grid";

type Tier = "standard" | "premium";

const STYLE_VALUES = [
  "default",
  "photographic",
  "illustration",
  "3d",
  "minimal",
] as const;

export const App = () => {
  const intl = useIntl();
  const premium = usePremiumAccess();
  const brandKits = useBrandKits();

  const [prompt, setPrompt] = useState("");
  const [tier, setTier] = useState<Tier>("standard");
  const [style, setStyle] = useState<string>("default");
  const [images, setImages] = useState<GeneratedImage[]>([]);
  const [resultsFromPremium, setResultsFromPremium] = useState(false);
  const [freeRemaining, setFreeRemaining] = useState<number | undefined>();
  const [isGenerating, setIsGenerating] = useState(false);
  const [insertingId, setInsertingId] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();

  const isSupported = useFeatureSupport();
  const addElement = [addElementAtPoint, addElementAtCursor].find((fn) =>
    isSupported(fn),
  );

  const messageForError = useCallback(
    (caught: unknown): string => {
      if (caught instanceof ApiError) {
        switch (caught.code) {
          case "premium_required":
            return intl.formatMessage({
              defaultMessage:
                "Your Canva plan no longer covers HD generations. Try again to upgrade.",
              description:
                "Error shown when the backend rejects a premium generation because the user is not entitled.",
            });
          case "free_limit_reached":
            return intl.formatMessage({
              defaultMessage:
                "You've used all of today's free generations. They reset in 24 hours.",
              description:
                "Error shown when the user has exhausted their daily free generations.",
            });
          case "invalid_prompt":
            return intl.formatMessage({
              defaultMessage: "That prompt can't be used. Try rewording it.",
              description: "Error shown when the prompt is rejected.",
            });
          default:
            break;
        }
      }

      return intl.formatMessage({
        defaultMessage: "Something went wrong. Please try again.",
        description: "Generic error shown when a generation fails.",
      });
    },
    [intl],
  );

  /**
   * Selecting the premium tier is itself the upgrade trigger. Canva's
   * guidelines require premium options to stay visible and interactive for
   * everyone — clicking one opens Canva's upgrade dialog rather than showing a
   * paywall of our own.
   */
  const onSelectTier = useCallback(
    async (next: Tier) => {
      setError(undefined);

      if (next === "premium" && !premium.isPremium) {
        const granted = await premium.requestUpgrade();
        if (!granted) {
          // User dismissed the dialog. Leave them on the free tier.
          return;
        }
      }

      setTier(next);
    },
    [premium],
  );

  const onGenerate = useCallback(async () => {
    setError(undefined);
    setIsGenerating(true);

    try {
      if (tier === "premium") {
        // Re-check entitlement at the moment of use — a plan can lapse
        // between opening the app and pressing Generate.
        if (!premium.isPremium) {
          const granted = await premium.requestUpgrade();
          if (!granted) {
            return;
          }
        }

        // Everything billable happens inside the tracking session, and
        // nothing else does.
        const response = await runBillableAction(PREMIUM_ACTION, (usageId) =>
          generatePremium(prompt, style, usageId, brandKits.selectedId),
        );

        setImages(response.images);
        setResultsFromPremium(true);
      } else {
        const response = await generateStandard(prompt, brandKits.selectedId);
        setImages(response.images);
        setResultsFromPremium(false);
        setFreeRemaining(response.freeGenerationsRemaining);
      }
    } catch (caught) {
      setError(messageForError(caught));

      if (caught instanceof ApiError && caught.code === "premium_required") {
        // Our view of entitlement is stale — resync with Canva.
        premium.refresh();
      }
    } finally {
      setIsGenerating(false);
    }
  }, [tier, prompt, style, premium, brandKits.selectedId, messageForError]);

  /**
   * Uploading and inserting is deliberately outside the tracking session: it
   * isn't billable work, and including it would overstate usage.
   */
  const onInsert = useCallback(
    async (image: GeneratedImage) => {
      if (!addElement) {
        return;
      }

      setError(undefined);
      setInsertingId(image.id);

      try {
        const queued = await upload({
          type: "image",
          url: image.url,
          mimeType: image.mimeType,
          thumbnailUrl: image.url,
          // Required, and it must be honest: this image was made by the app.
          aiDisclosure: "app_generated",
        });

        await addElement({
          type: "image",
          ref: queued.ref,
          altText: { text: prompt, decorative: false },
        });
      } catch {
        setError(
          intl.formatMessage({
            defaultMessage: "Couldn't add that image to your design.",
            description:
              "Error shown when uploading or inserting a generated image fails.",
          }),
        );
      } finally {
        setInsertingId(undefined);
      }
    },
    [addElement, prompt, intl],
  );

  const styleOptions = useMemo(
    () =>
      STYLE_VALUES.map((value) => ({
        value,
        label: value,
      })),
    [],
  );

  const canGenerate = prompt.trim().length > 0 && !isGenerating;

  return (
    <div className={styles.scrollContainer}>
      <Rows spacing="2u">
        <Title size="small">
          {intl.formatMessage({
            defaultMessage: "Describe the image you want",
            description: "Heading above the prompt input.",
          })}
        </Title>

        <FormField
          label={intl.formatMessage({
            defaultMessage: "Prompt",
            description: "Label for the prompt input field.",
          })}
          value={prompt}
          control={(props) => (
            <MultilineInput
              {...props}
              placeholder={intl.formatMessage({
                defaultMessage: "A calm mountain lake at sunrise",
                description: "Example prompt shown as placeholder text.",
              })}
              minRows={3}
              maxLength={500}
              onChange={setPrompt}
            />
          )}
        />

        <BrandKitPanel brandKits={brandKits} />

        {brandKits.error && (
          <Alert tone="critical">
            {brandKits.error.code === "brand_kit_limit_reached"
              ? intl.formatMessage({
                  defaultMessage:
                    "You've reached the maximum number of brand kits.",
                  description:
                    "Error shown when the user tries to save more brand kits than allowed.",
                })
              : intl.formatMessage({
                  defaultMessage: "Couldn't save that brand kit.",
                  description: "Generic error shown when a brand kit operation fails.",
                })}
          </Alert>
        )}

        {/*
          The premium tier is only advertised once Canva confirms the app has a
          premium tier at all. Before acceptance into the Premium Apps Program
          `showPremiumUi` is false and the app is a straightforward free tool —
          showing a crown that can't lead anywhere would fail app review.
        */}
        {premium.showPremiumUi && (
          <FormField
            label={intl.formatMessage({
              defaultMessage: "Quality",
              description: "Label for the generation quality selector.",
            })}
            value={tier}
            control={(props) => (
              <SegmentedControl<Tier>
                {...props}
                options={[
                  {
                    value: "standard",
                    label: intl.formatMessage({
                      defaultMessage: "Standard",
                      description: "Label for the free generation tier.",
                    }),
                  },
                  {
                    value: "premium",
                    label: (
                      <Box
                        display="flex"
                        alignItems="center"
                        justifyContent="center"
                      >
                        {intl.formatMessage({
                          defaultMessage: "High quality ×4",
                          description:
                            "Label for the premium generation tier, which returns four higher-quality images.",
                        })}
                        <PremiumCrown entitled={premium.isPremium} />
                      </Box>
                    ),
                  },
                ]}
                value={tier}
                onChange={(value) => {
                  void onSelectTier(value);
                }}
              />
            )}
          />
        )}

        {premium.showPremiumUi && tier === "premium" && (
          <FormField
            label={intl.formatMessage({
              defaultMessage: "Style",
              description: "Label for the premium style selector.",
            })}
            value={style}
            control={(props) => (
              <Select
                {...props}
                options={styleOptions}
                value={style}
                onChange={setStyle}
                stretch
              />
            )}
          />
        )}

        <Button
          variant="primary"
          onClick={() => {
            void onGenerate();
          }}
          disabled={!canGenerate}
          loading={isGenerating}
          stretch
        >
          {intl.formatMessage({
            defaultMessage: "Generate",
            description: "Label for the button that starts image generation.",
          })}
        </Button>

        {error && <Alert tone="critical">{error}</Alert>}

        {tier === "standard" && freeRemaining !== undefined && (
          <Text size="small" tone="tertiary">
            {intl.formatMessage(
              {
                defaultMessage:
                  "{count, plural, one {# free generation left today} other {# free generations left today}}",
                description:
                  "Shows how many free generations the user has left today.",
              },
              { count: freeRemaining },
            )}
          </Text>
        )}

        <ResultGrid
          images={images}
          onSelect={(image) => {
            void onInsert(image);
          }}
          insertingId={insertingId}
          fromPremium={resultsFromPremium}
        />
      </Rows>
    </div>
  );
};
