import { Button, Group, Modal, Stack, Text } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { IconPhotoX as PhotoX } from "@tabler/icons-react";
import { createFileRoute } from "@tanstack/react-router";
import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useFetchDateAlbumQuery, useFetchDateAlbumsQuery } from "../../api_client/albums/hooks";
import { useDeleteMissingPhotosMutation } from "../../api_client/photos/hooks";
import { Photoset, PigPhoto } from "../../api_client/photos/types";
import { useFetchCountStatsQuery } from "../../api_client/stats/hooks";
import { COUNT_STATS_DEFAULTS } from "../../api_client/stats/types";
import { EmptyStateConfig, PhotoGroup, PhotoListView } from "../../components/photolist/PhotoListView";
import { getPhotosFlatFromGroupedByDate } from "../../util/util";

export const Route = createFileRoute("/_protected/missing")({
  component: MissingPhotos,
});

// The photos whose file LibrePhotos could no longer find, hidden or not and
// in the trash or not: the Library page's "Missing photos" badge leads here.
// They can be opened, tagged, trashed, restored and deleted like any other
// photo, or all removed at once.
function MissingPhotos() {
  const { t } = useTranslation();
  const [photosFlat, setPhotosFlat] = useState<PigPhoto[]>([]);
  const [confirmOpen, { open: openConfirm, close: closeConfirm }] = useDisclosure(false);
  const { data: countStats = COUNT_STATS_DEFAULTS } = useFetchCountStatsQuery();
  const deleteMissingPhotos = useDeleteMissingPhotosMutation();

  const { data: photosGroupedByDate, isLoading } = useFetchDateAlbumsQuery({ photosetType: Photoset.MISSING });

  useEffect(() => {
    if (photosGroupedByDate) setPhotosFlat(getPhotosFlatFromGroupedByDate(photosGroupedByDate));
  }, [photosGroupedByDate]);

  const [group, setGroup] = useState({} as PhotoGroup);
  useFetchDateAlbumQuery(
    { album_date_id: group.id, page: group.page, photosetType: Photoset.MISSING },
    { skip: !group.id }
  );

  const getAlbums = (visibleGroups: any) => {
    visibleGroups.reverse().forEach((photoGroup: any) => {
      const visibleImages = photoGroup.items;
      if (visibleImages.filter((i: any) => i.isTemp).length > 0) {
        const firstTempObject = visibleImages.filter((i: any) => i.isTemp)[0];
        const page = Math.ceil((parseInt(firstTempObject.id, 10) + 1) / 100);

        setGroup({ id: photoGroup.id, page });
      }
    });
  };

  const emptyStateConfig: EmptyStateConfig = useMemo(
    () => ({
      icon: <PhotoX size={40} />,
      title: t("missingphotos.empty.title"),
      description: t("missingphotos.empty.description"),
    }),
    [t]
  );

  const missingCount = countStats.num_missing_photos;

  return (
    <>
      <PhotoListView
        title={t("settings.missingphotos")}
        loading={isLoading}
        icon={<PhotoX size={50} />}
        photoset={photosGroupedByDate ?? []}
        updateGroups={getAlbums}
        idx2hash={photosFlat}
        selectable
        emptyStateConfig={emptyStateConfig}
        photosetQuery={{ missing: true }}
        additionalSubHeader={
          <Text size="sm" c="dimmed" maw={640}>
            {t("missingphotos.explanation")}
          </Text>
        }
        headerActions={
          missingCount > 0 ? (
            <Button color="red" variant="light" size="xs" leftSection={<PhotoX size={16} />} onClick={openConfirm}>
              {t("missingphotos.removeall")}
            </Button>
          ) : null
        }
      />
      <Modal opened={confirmOpen} title={t("settings.missingphotosbutton")} onClose={closeConfirm}>
        <Stack gap="xl">
          {t("settings.missingphotosconfirm", { count: missingCount })}
          <Group>
            <Button onClick={closeConfirm}>{t("cancel")}</Button>
            <Button
              color="red"
              onClick={() => {
                deleteMissingPhotos.mutate();
                closeConfirm();
              }}
            >
              {t("confirm")}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
