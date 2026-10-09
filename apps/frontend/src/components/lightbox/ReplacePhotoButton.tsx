import { ActionIcon, Button, Group, Modal, Progress, Stack, Text, Tooltip } from "@mantine/core";
import { IconReplace as Replace } from "@tabler/icons-react";
import React, { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ApiError } from "../../api_client/api";
import { useReplacePhotoMutation } from "../../api_client/photos/hooks/useReplacePhotoMutation";
import type { Photo as PhotoType } from "../../api_client/photos/types";
import { useGetSettingsQuery } from "../../api_client/settings";
import { useAuth } from "../../hooks/useAuth";
import { notification } from "../../service/notifications";

type Props = Readonly<{
  photoDetail: PhotoType;
  fileName: string;
}>;

function extensionOf(name: string) {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

const SAME_FORMAT = [
  ["jpg", "jpeg", "jpe"],
  ["tif", "tiff"],
  ["heic", "heif"],
];

function sameFormat(a: string, b: string) {
  return a === b || SAME_FORMAT.some(group => group.includes(a) && group.includes(b));
}

// "Replace with an edited version", next to the filename in the Details panel:
// edit the photo in another program, then hand the result back. The server
// writes it over the original under the original's name and keeps the photo
// (albums, tags, people, rating, dates); the original goes to LibrePhotos'
// data folder. Owner-only and photos only, and only where uploads are allowed,
// because the file travels through the same chunked upload.
export function ReplacePhotoButton({ photoDetail, fileName }: Props) {
  const { t } = useTranslation();
  const { userId } = useAuth();
  const { data: settings } = useGetSettingsQuery();
  const replace = useReplacePhotoMutation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);

  if (userId === null || photoDetail.owner?.id !== userId || photoDetail.video) {
    return null;
  }

  const allowed = !!settings?.allow_upload;
  const close = () => {
    if (replace.isPending) return;
    setFile(null);
    setProgress(0);
  };

  const confirm = () => {
    if (!file) return;
    replace.mutate(
      { photoId: photoDetail.id, file, onProgress: setProgress },
      {
        onSuccess: result => {
          notification.replacedPhoto(fileName, result.kept_faces);
          setFile(null);
          setProgress(0);
        },
        onError: error => {
          const detail = error instanceof ApiError ? error.serverMessage : null;
          notification.requestFailed(t("lightbox.replace.title"), detail ?? t("lightbox.replace.failed"));
          setProgress(0);
        },
      }
    );
  };

  const formatChanges = file ? !sameFormat(extensionOf(file.name), extensionOf(fileName)) : false;
  const newName = formatChanges
    ? `${fileName.slice(0, fileName.lastIndexOf(".") > 0 ? fileName.lastIndexOf(".") : undefined)}.${extensionOf(file!.name)}`
    : fileName;

  return (
    <>
      <Tooltip label={allowed ? t("lightbox.replace.button") : t("lightbox.replace.uploadsoff")}>
        <ActionIcon
          variant="subtle"
          color="gray"
          size="sm"
          disabled={!allowed}
          onClick={() => inputRef.current?.click()}
          aria-label={t("lightbox.replace.button")}
        >
          <Replace size={16} />
        </ActionIcon>
      </Tooltip>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        hidden
        data-testid="replace-photo-input"
        onChange={event => {
          const chosen = event.currentTarget.files?.[0] ?? null;
          // Picking the same file again must fire onChange again.
          event.currentTarget.value = "";
          setFile(chosen);
        }}
      />
      <Modal opened={!!file} onClose={close} title={t("lightbox.replace.title")} centered>
        <Stack>
          <Text size="sm">{t("lightbox.replace.confirm", { current: fileName, replacement: file?.name ?? "" })}</Text>
          <Text size="sm">
            {formatChanges ? t("lightbox.replace.renamed", { name: newName }) : t("lightbox.replace.samename")}
          </Text>
          <Text size="sm" c="dimmed">
            {t("lightbox.replace.backup")}
          </Text>
          {replace.isPending && <Progress value={progress} animated aria-label={t("lightbox.replace.uploading")} />}
          <Group justify="flex-end">
            <Button variant="default" onClick={close} disabled={replace.isPending}>
              {t("cancel")}
            </Button>
            <Button onClick={confirm} loading={replace.isPending}>
              {t("lightbox.replace.action")}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
