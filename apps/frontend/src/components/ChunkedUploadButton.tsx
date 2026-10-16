import { ActionIcon, Indicator, Tooltip } from "@mantine/core";
import { IconUpload as Upload } from "@tabler/icons-react";
import React from "react";
import { useDropzone } from "react-dropzone";
import { useTranslation } from "react-i18next";
import { useGetSettingsQuery } from "../api_client/settings";
import { useCurrentUserSelfDetailsQuery } from "../api_client/user/hooks/useCurrentUserSelfDetailsQuery";
import { useUpload } from "./upload";

const HIDDEN_FILE_INPUT: React.CSSProperties = {
  position: "absolute",
  width: 0,
  height: 0,
  opacity: 0,
  overflow: "hidden",
  border: 0,
  margin: 0,
  padding: 0,
  pointerEvents: "none",
};

export function ChunkedUploadButton() {
  const { t } = useTranslation();
  const { data: userSelfDetails } = useCurrentUserSelfDetailsQuery();
  const { data: settings } = useGetSettingsQuery();
  const { start, isUploading } = useUpload();

  // A library member uploads into the owner's library, not a folder of their own.
  const hasScanDirectory =
    !!userSelfDetails?.library_owner ||
    (!!userSelfDetails?.scan_directory && userSelfDetails.scan_directory.trim() !== "");

  const { getRootProps, getInputProps, open } = useDropzone({
    accept: {
      "image/*": [],
      "video/*": [],
    },
    // prevent react-dropzone from automatically opening the file dialog
    // when the dropzone is clicked. We manually trigger it via the button
    // click handler, which otherwise would result in the dialog opening
    // twice due to event bubbling.
    noClick: true,
    noKeyboard: true,
    onDrop: hasScanDirectory ? start : () => {},
    disabled: !hasScanDirectory,
  });

  if (!settings?.allow_upload) {
    return null;
  }

  const uploadContent = (
    <div
      {...getRootProps({ className: "dropzone" })}
      style={{ alignContent: "center", display: "flex", position: "relative" }}
    >
      {/* Out of the layout: WebKit (every iPhone browser) gave this zero-width
          input the width of a file picker, which stretched the top bar's
          button group across the screen and pushed search off its left edge.
          Not display: none, so the button can still open the picker. */}
      <input {...getInputProps({ style: HIDDEN_FILE_INPUT })} />
      <Indicator processing disabled={!isUploading} color="blue" size={8} offset={3}>
        <ActionIcon
          color="gray"
          variant="light"
          onClick={hasScanDirectory ? open : undefined}
          disabled={!hasScanDirectory}
          style={!hasScanDirectory ? { opacity: 0.5, cursor: "not-allowed" } : undefined}
          aria-label={t("upload.button")}
        >
          <Upload />
        </ActionIcon>
      </Indicator>
    </div>
  );

  if (!hasScanDirectory) {
    return <Tooltip label={t("toasts.scan_directory_required")}>{uploadContent}</Tooltip>;
  }

  return uploadContent;
}
