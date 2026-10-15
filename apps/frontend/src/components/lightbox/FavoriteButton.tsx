import { ActionIcon, Tooltip } from "@mantine/core";
import { IconStar, IconStarFilled } from "@tabler/icons-react";
import React from "react";
import { useTranslation } from "react-i18next";
import { useSetFavoritePhotosMutation } from "../../api_client/photos/hooks";
import { useCurrentUserSelfDetailsQuery } from "../../api_client/user/hooks/useCurrentUserSelfDetailsQuery";

type Props = {
  imageHash: string;
  rating: number;
  size?: number;
};

/**
 * The star that shows and toggles a photo's favorite status. A favorite is a
 * rating at or above the user's "favorite" threshold (Settings), which is
 * what marking one sets.
 */
export function FavoriteButton({ imageHash, rating, size = 28 }: Props) {
  const { t } = useTranslation();
  const { data: userDetails } = useCurrentUserSelfDetailsQuery();
  const setFavorite = useSetFavoritePhotosMutation();
  // Not a favorite until the threshold is known, rather than every photo
  // flashing as one while it loads.
  const isFavorite = !!userDetails && rating >= userDetails.favorite_min_rating;
  const label = isFavorite ? t("lightbox.toolbar.removeFromFavorites") : t("lightbox.toolbar.addToFavorites");

  return (
    <Tooltip label={label}>
      <ActionIcon
        variant="subtle"
        color={isFavorite ? "yellow" : "gray"}
        size={size}
        aria-label={label}
        aria-pressed={isFavorite}
        loading={setFavorite.isPending}
        onClick={() => setFavorite.mutate({ image_hashes: [imageHash], favorite: !isFavorite })}
      >
        {isFavorite ? <IconStarFilled size={size * 0.7} /> : <IconStar size={size * 0.7} />}
      </ActionIcon>
    </Tooltip>
  );
}
