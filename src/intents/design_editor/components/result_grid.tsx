import { Grid, ImageCard, Rows, Text } from "@canva/app-ui-kit";
import { useIntl } from "react-intl";
import type { GeneratedImage } from "../../../api/client";
import { PremiumCrown } from "./premium_crown";

type Props = {
  images: GeneratedImage[];
  onSelect: (image: GeneratedImage) => void;
  /** Id of the image currently being uploaded and inserted, if any. */
  insertingId?: string;
  /** Whether these results came from the premium tier. */
  fromPremium: boolean;
};

export const ResultGrid = ({
  images,
  onSelect,
  insertingId,
  fromPremium,
}: Props) => {
  const intl = useIntl();

  if (images.length === 0) {
    return null;
  }

  const addToDesignLabel = intl.formatMessage({
    defaultMessage: "Add this image to your design",
    description:
      "Accessible description of what happens when a generated image is clicked.",
  });

  return (
    <Rows spacing="1u">
      <Text size="small" tone="tertiary">
        {intl.formatMessage({
          defaultMessage: "Select an image to add it to your design.",
          description:
            "Hint shown above the grid of generated images, explaining that selecting one inserts it.",
        })}
      </Text>
      <Grid columns={2} spacing="1u">
        {images.map((image) => (
          <ImageCard
            key={image.id}
            thumbnailUrl={image.url}
            thumbnailAspectRatio={image.width / image.height}
            alt={intl.formatMessage({
              defaultMessage: "Generated image",
              description: "Alt text for a generated image thumbnail.",
            })}
            ariaLabel={addToDesignLabel}
            onClick={() => onSelect(image)}
            loading={insertingId === image.id}
            borderRadius="standard"
            // Canva's guidelines put the premium badge in the bottom-right
            // corner of cards showing premium content.
            bottomEnd={fromPremium ? <PremiumCrown entitled={true} /> : undefined}
          />
        ))}
      </Grid>
    </Rows>
  );
};
