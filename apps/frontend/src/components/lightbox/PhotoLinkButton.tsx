import { ActionIcon, Tooltip } from "@mantine/core";
import { IconLink } from "@tabler/icons-react";
import { useNavigate, useRouter } from "@tanstack/react-router";
import React from "react";
import { useTranslation } from "react-i18next";

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
 * A real link to the photo's page, so the browser's own handling applies:
 * middle-click or Ctrl/Cmd-click opens a new tab, right-click (a long press
 * on a phone) offers Copy Link and Share. A plain click goes to the page
 * within the app.
 */
export function PhotoLinkButton({ photoId }: { photoId: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const link = usePhotoLink(photoId);
  const label = t("lightbox.sidebar.photolink");

  return (
    <Tooltip label={label}>
      <ActionIcon
        component="a"
        href={link}
        variant="subtle"
        color="gray"
        aria-label={label}
        onClick={(event: React.MouseEvent<HTMLAnchorElement>) => {
          // Anything but a plain left click is the browser's (new tab, new
          // window, download).
          if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
          event.preventDefault();
          navigate({ to: "/photo/$id", params: { id: photoId } });
        }}
      >
        <IconLink size={18} />
      </ActionIcon>
    </Tooltip>
  );
}
