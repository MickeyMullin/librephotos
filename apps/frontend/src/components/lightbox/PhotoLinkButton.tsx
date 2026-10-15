import { ActionIcon, Tooltip } from "@mantine/core";
import { IconLink } from "@tabler/icons-react";
import { useRouter } from "@tanstack/react-router";
import React from "react";
import { useTranslation } from "react-i18next";
import { notification } from "../../service/notifications";

/**
 * The address of a photo's own page, which opens it with its details. By the
 * photo's id rather than its image hash: the hash changes when the picture
 * is replaced, the id never does.
 */
export function usePhotoLink(photoId: string) {
  const router = useRouter();
  const { href } = router.buildLocation({ to: "/photo/$id", params: { id: photoId } });
  return new URL(href, window.location.origin).toString();
}

/**
 * Shares the link to the photo being viewed: the share sheet on a touch
 * screen (Messages, Mail, Copy and the rest), the clipboard elsewhere. If the
 * browser refuses the clipboard, the toast shows the link to copy by hand.
 */
export function PhotoLinkButton({ photoId }: { photoId: string }) {
  const { t } = useTranslation();
  const link = usePhotoLink(photoId);
  const label = t("lightbox.sidebar.photolink");

  const share = async () => {
    const touch = typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;
    if (touch && typeof navigator.share === "function") {
      try {
        await navigator.share({ url: link });
        return;
      } catch (error) {
        // Closing the share sheet is not a failure.
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(link);
      notification.copyPhotoLink();
    } catch {
      notification.copyPhotoLinkFailed(link);
    }
  };

  return (
    <Tooltip label={label}>
      <ActionIcon variant="subtle" color="gray" onClick={share} aria-label={label}>
        <IconLink size={18} />
      </ActionIcon>
    </Tooltip>
  );
}
