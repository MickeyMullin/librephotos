import { Badge, Button, CloseButton, Group, Stack, Text, Title } from "@mantine/core";
import { hideNotification, showNotification } from "@mantine/notifications";
import { IconTags as Tags } from "@tabler/icons-react";
import { useNavigate } from "@tanstack/react-router";
import React from "react";
import { useTranslation } from "react-i18next";
import { useDismissAutoTagMutation } from "../../api_client/photos/hooks/useDismissAutoTagMutation";
import type { Photo as PhotoType } from "../../api_client/photos/types";
import { useAuth } from "../../hooks/useAuth";
import { INTERACTIVE_TOAST_STYLE } from "../../service/notifications/interactive";

type Props = Readonly<{
  photoDetail: PhotoType;
  autoTags: string[];
  isPublic: boolean;
}>;

// One undo toast at a time: a newer dismissal replaces the older one's Undo.
const UNDO_NOTIFICATION_ID = "autotag-dismiss-undo";

// The tagging model's own output, not the user's tags. A click searches for
// the tag; on the owner's photo each tag has an x to dismiss it as wrong,
// which the server remembers so the tagger does not bring it back.
export function AutoTagsSection({ photoDetail, autoTags, isPublic }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { userId } = useAuth();
  const { mutate: dismissAutoTag } = useDismissAutoTagMutation();
  const canDismiss = !isPublic && userId !== null && photoDetail.owner?.id === userId;
  // Bound now, so an Undo clicked after the lightbox moved on still targets
  // this photo.
  const photo = photoDetail.id || photoDetail.image_hash;

  const dismiss = (tag: string) => {
    dismissAutoTag(
      { photo, tag },
      {
        onSuccess: () => {
          showNotification({
            id: UNDO_NOTIFICATION_ID,
            color: "teal",
            // Long enough to reach the Undo button; the app default is 2 s.
            autoClose: 10000,
            style: INTERACTIVE_TOAST_STYLE,
            title: t("lightbox.sidebar.autotags"),
            message: (
              <Group justify="space-between" wrap="nowrap">
                <Text size="sm">{t("lightbox.autotag.dismissed", { tag })}</Text>
                <Button
                  size="compact-sm"
                  variant="subtle"
                  onClick={() => {
                    hideNotification(UNDO_NOTIFICATION_ID);
                    dismissAutoTag({ photo, tag, dismissed: false });
                  }}
                >
                  {t("lightbox.category.undo")}
                </Button>
              </Group>
            ),
          });
        },
      }
    );
  };

  return (
    <Stack>
      <Group>
        <Tags />
        <Title order={4}>{t("lightbox.sidebar.autotags")}</Title>
      </Group>
      <Group>
        {autoTags.map(tag => (
          <Badge
            key={`lightbox_autotag_${photoDetail.image_hash}_${tag}`}
            color="green"
            style={{ cursor: "pointer" }}
            onClick={() => navigate({ to: `/search/${tag}` })}
            rightSection={
              canDismiss ? (
                <CloseButton
                  size="xs"
                  variant="transparent"
                  c="inherit"
                  aria-label={t("lightbox.autotag.dismiss", { tag })}
                  title={t("lightbox.autotag.dismiss", { tag })}
                  onClick={event => {
                    // The badge itself searches for the tag.
                    event.stopPropagation();
                    dismiss(tag);
                  }}
                />
              ) : undefined
            }
          >
            {tag}
          </Badge>
        ))}
      </Group>
    </Stack>
  );
}
