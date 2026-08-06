import {
  Box,
  Button,
  ColorSelector,
  FormField,
  Rows,
  Select,
  Text,
  TextInput,
} from "@canva/app-ui-kit";
import { useState } from "react";
import { useIntl } from "react-intl";
import type { BrandKitsState } from "../../../brand/use_brand_kits";
import {
  MAX_KIT_NAME_LENGTH,
  MAX_PALETTE_COLOURS,
  MAX_STYLE_NOTES_LENGTH,
} from "../../../shared/brand_kit";

const DEFAULT_COLOUR = "#4A56E2";

type Props = {
  brandKits: BrandKitsState;
};

/**
 * Lets the user save a palette and tone once, then have it applied to every
 * generation. This is the app's reason to exist alongside Canva's built-in
 * generator, so it stays visible and free for everyone.
 */
export const BrandKitPanel = ({ brandKits }: Props) => {
  const intl = useIntl();

  const [isCreating, setIsCreating] = useState(false);
  const [name, setName] = useState("");
  const [palette, setPalette] = useState<string[]>([DEFAULT_COLOUR]);
  const [styleNotes, setStyleNotes] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const resetForm = () => {
    setName("");
    setPalette([DEFAULT_COLOUR]);
    setStyleNotes("");
    setIsCreating(false);
  };

  const onSave = async () => {
    setIsSaving(true);
    const saved = await brandKits.create({ name, palette, styleNotes });
    setIsSaving(false);

    if (saved) {
      resetForm();
    }
  };

  const { selectedId } = brandKits;

  const options = [
    {
      value: "",
      label: intl.formatMessage({
        defaultMessage: "No brand kit",
        description:
          "Option in the brand kit selector for generating without any brand styling applied.",
      }),
    },
    ...brandKits.kits.map((kit) => ({ value: kit.id, label: kit.name })),
  ];

  if (isCreating) {
    return (
      <Rows spacing="1u">
        <FormField
          label={intl.formatMessage({
            defaultMessage: "Brand kit name",
            description: "Label for the brand kit name input.",
          })}
          value={name}
          control={(props) => (
            <TextInput
              {...props}
              maxLength={MAX_KIT_NAME_LENGTH}
              onChange={setName}
              placeholder={intl.formatMessage({
                defaultMessage: "Main brand",
                description: "Example brand kit name shown as placeholder.",
              })}
            />
          )}
        />

        <FormField
          label={intl.formatMessage({
            defaultMessage: "Palette",
            description: "Label for the brand kit colour palette editor.",
          })}
          description={intl.formatMessage({
            defaultMessage:
              "Generations are constrained to these colours. The first is treated as primary.",
            description:
              "Explains how the saved palette is applied to generated images.",
          })}
          control={() => (
            <Box display="flex" flexDirection="row" alignItems="center">
              {palette.map((colour, index) => (
                <ColorSelector
                  key={`${colour}-${index}`}
                  color={colour}
                  onChange={(next) =>
                    setPalette((current) =>
                      current.map((entry, position) =>
                        position === index ? next : entry,
                      ),
                    )
                  }
                  onDeleteColor={
                    palette.length > 1
                      ? () =>
                          setPalette((current) =>
                            current.filter((_entry, position) => position !== index),
                          )
                      : undefined
                  }
                />
              ))}
              {palette.length < MAX_PALETTE_COLOURS && (
                <ColorSelector
                  color={DEFAULT_COLOUR}
                  triggerMode="addColorButton"
                  onChange={(next) =>
                    setPalette((current) => [...current, next])
                  }
                />
              )}
            </Box>
          )}
        />

        <FormField
          label={intl.formatMessage({
            defaultMessage: "Art direction",
            description: "Label for the optional brand style notes input.",
          })}
          value={styleNotes}
          control={(props) => (
            <TextInput
              {...props}
              maxLength={MAX_STYLE_NOTES_LENGTH}
              onChange={setStyleNotes}
              placeholder={intl.formatMessage({
                defaultMessage: "Warm, editorial, lots of negative space",
                description: "Example art direction shown as placeholder.",
              })}
            />
          )}
        />

        <Button
          variant="primary"
          onClick={() => {
            void onSave();
          }}
          disabled={name.trim().length === 0 || isSaving}
          loading={isSaving}
          stretch
        >
          {intl.formatMessage({
            defaultMessage: "Save brand kit",
            description: "Button that saves a new brand kit.",
          })}
        </Button>
        <Button variant="tertiary" onClick={resetForm} stretch>
          {intl.formatMessage({
            defaultMessage: "Cancel",
            description: "Button that discards the new brand kit form.",
          })}
        </Button>
      </Rows>
    );
  }

  return (
    <Rows spacing="1u">
      <FormField
        label={intl.formatMessage({
          defaultMessage: "Brand kit",
          description: "Label for the brand kit selector.",
        })}
        value={brandKits.selectedId ?? ""}
        control={(props) => (
          <Select
            {...props}
            options={options}
            value={brandKits.selectedId ?? ""}
            onChange={(value) => brandKits.select(value === "" ? undefined : value)}
            disabled={brandKits.isLoading}
            stretch
          />
        )}
      />

      {brandKits.canCreateMore ? (
        <Button variant="secondary" onClick={() => setIsCreating(true)} stretch>
          {intl.formatMessage({
            defaultMessage: "New brand kit",
            description: "Button that opens the form for creating a brand kit.",
          })}
        </Button>
      ) : (
        <Text size="small" tone="tertiary">
          {intl.formatMessage(
            {
              defaultMessage:
                "You've saved the maximum of {limit} brand kits. Delete one to add another.",
              description:
                "Explains that the user cannot create more brand kits.",
            },
            { limit: brandKits.kits.length },
          )}
        </Text>
      )}

      {selectedId !== undefined && (
        <Button
          variant="tertiary"
          onClick={() => {
            void brandKits.remove(selectedId);
          }}
          stretch
        >
          {intl.formatMessage({
            defaultMessage: "Delete this brand kit",
            description: "Button that deletes the selected brand kit.",
          })}
        </Button>
      )}
    </Rows>
  );
};
