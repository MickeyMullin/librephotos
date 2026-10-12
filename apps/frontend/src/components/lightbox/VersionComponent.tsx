import { ActionIcon, Anchor, Badge, Button, Collapse, Divider, Group, Stack, Text } from "@mantine/core";
import { useLocalStorage } from "@mantine/hooks";
import { IconCamera as Camera, IconEye as Eye, IconEyeOff as EyeOff, IconPhoto as Photo } from "@tabler/icons-react";
import React, { useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { serverAddress } from "../../api_client/apiClient";
import type { FileVariant } from "../../api_client/photos/types";
import { Photo as PhotoType } from "../../api_client/photos/types";
import { BreadcrumbPath } from "../common/BreadcrumbPath";
import { FileInfoComponent } from "./FileInfoComponent";
import { ReplacePhotoButton } from "./ReplacePhotoButton";

/**
 * Get file variant type badge color and label
 */
function getVariantBadgeProps(variant: FileVariant): { color: string; label: string } {
  const typeMap: Record<string, { color: string; label: string }> = {
    image: { color: "blue", label: "JPG" },
    raw: { color: "gray", label: "RAW" },
    video: { color: "grape", label: "VIDEO" },
    metadata: { color: "gray", label: "META" },
    unknown: { color: "gray", label: "FILE" },
  };
  return typeMap[variant.type] || typeMap.unknown;
}

/**
 * The photo's filename, on one line unless the viewer asked for all of it.
 * Hovering shows the whole name in a tooltip, which a touch screen never
 * does, so a cut-off name also gets an eye button that shows it in full,
 * wrapped. The choice is remembered for every photo in this browser.
 */
export function FileName({ fileName, href }: { fileName: string; href: string }) {
  const { t } = useTranslation();
  const [showFull, setShowFull] = useLocalStorage({ key: "lightbox-full-filename", defaultValue: false });
  const textRef = useRef<HTMLParagraphElement>(null);
  const [cutOff, setCutOff] = useState(false);

  useLayoutEffect(() => {
    const text = textRef.current;
    if (!text || showFull) return;
    setCutOff(text.scrollWidth > text.clientWidth + 1 || text.scrollHeight > text.clientHeight + 1);
  }, [fileName, showFull]);

  const label = showFull ? t("lightbox.sidebar.filenameOneLine") : t("lightbox.sidebar.filenameFull");
  return (
    <>
      <Anchor href={href} target="_blank" style={{ minWidth: 0 }}>
        <Text
          ref={textRef}
          fw={800}
          lineClamp={showFull ? undefined : 1}
          style={{ maxWidth: 225, overflowWrap: "anywhere" }}
          title={fileName}
        >
          {fileName}
        </Text>
      </Anchor>
      {(cutOff || showFull) && (
        <ActionIcon
          variant="subtle"
          color="gray"
          size="sm"
          onClick={() => setShowFull(!showFull)}
          aria-label={label}
          aria-pressed={showFull}
          title={label}
        >
          {showFull ? <EyeOff size={16} /> : <Eye size={16} />}
        </ActionIcon>
      )}
    </>
  );
}

/**
 * Basic photo information (filename, dimensions, file size)
 * Includes file variants with a dedicated toggle
 */
function PhotoInfoSection({
  photoDetail,
  isPublic,
  t,
}: {
  photoDetail: PhotoType;
  isPublic: boolean;
  t: (key: string, fallback?: string) => string;
}) {
  const [showVariants, setShowVariants] = useState(false);
  const fileVariants = photoDetail.file_variants || [];
  const nonMainVariants = fileVariants.filter(v => !v.is_main);
  const hasVariants = nonMainVariants.length > 0;
  const fileName =
    photoDetail.image_path && photoDetail.image_path.length > 0
      ? photoDetail.image_path[0].substring(photoDetail.image_path[0].lastIndexOf("/") + 1)
      : "Unknown filename";

  return (
    <Stack gap="xs">
      <Group justify="space-between">
        <Group justify="flex-start">
          <Photo />
          <div>
            <Group gap={4} wrap="nowrap" align="flex-start">
              <FileName fileName={fileName} href={`${serverAddress}/media/photos/${photoDetail.image_hash}`} />
              {!isPublic && <ReplacePhotoButton photoDetail={photoDetail} fileName={fileName} />}
            </Group>
            <Group gap="xs">
              <FileInfoComponent info={`${photoDetail.height} x ${photoDetail.width}`} />
              {Math.round((photoDetail.size / 1024 / 1024) * 100) / 100 < 1 ? (
                <FileInfoComponent info={`${Math.round((photoDetail.size / 1024) * 100) / 100} kB`} />
              ) : (
                <FileInfoComponent info={`${Math.round((photoDetail.size / 1024 / 1024) * 100) / 100} MB`} />
              )}
              {hasVariants && (
                <Anchor
                  component="button"
                  type="button"
                  size="xs"
                  c="blue"
                  onClick={() => setShowVariants(!showVariants)}
                  style={{ cursor: "pointer" }}
                >
                  {showVariants
                    ? t("exif.hideFormats", "Hide formats")
                    : t(
                        "exif.showFormats",
                        `+${nonMainVariants.length} format${nonMainVariants.length > 1 ? "s" : ""}`
                      )}
                </Anchor>
              )}
            </Group>
          </div>
        </Group>
      </Group>

      {/* File variants shown when toggled */}
      {hasVariants && (
        <Collapse in={showVariants}>
          <Stack gap={4} ml="xl" mt="xs">
            {nonMainVariants.map(variant => {
              const { color, label } = getVariantBadgeProps(variant);
              const variantName = variant.filename || variant.path.split("/").pop();
              return (
                <Group key={variant.hash} gap="xs">
                  <Badge size="xs" color={color} variant="filled">
                    {label}
                  </Badge>
                  <Anchor
                    href={`${serverAddress}/media/photos/${variant.hash}`}
                    target="_blank"
                    size="xs"
                    c="dimmed"
                    title={variantName}
                  >
                    {variantName}
                  </Anchor>
                </Group>
              );
            })}
          </Stack>
        </Collapse>
      )}
    </Stack>
  );
}

/**
 * Camera equipment and settings information
 * Exported for use in public album views
 */
export function CameraInfoSection({ photoDetail }: { photoDetail: Partial<PhotoType> }) {
  if (!photoDetail.camera) return null;

  return (
    <Group justify="space-between">
      <Group justify="flex-start">
        <Camera />
        <div>
          <Text fw={800}>{photoDetail.camera?.toString()}</Text>
          <Group gap="xs">
            {photoDetail.lens && <FileInfoComponent info={photoDetail.lens.toString()} />}
            {photoDetail.subjectDistance && <FileInfoComponent info={`${photoDetail.subjectDistance} m`} />}
            {photoDetail.fstop && <FileInfoComponent info={`ƒ / ${photoDetail.fstop}`} />}
            {photoDetail.shutter_speed && <FileInfoComponent info={`${photoDetail.shutter_speed}`} />}
            {photoDetail.focal_length && <FileInfoComponent info={`${Math.round(photoDetail.focal_length)} mm`} />}
            {photoDetail.iso && <FileInfoComponent info={`ISO${photoDetail.iso.toString()}`} />}
          </Group>
        </div>
      </Group>
    </Group>
  );
}

/**
 * Additional photo metadata shown in expanded view
 */
function AdditionalInfoSection({
  photoDetail,
  isPublic,
  t,
}: {
  photoDetail: PhotoType;
  isPublic: boolean;
  t: (key: string) => string;
}) {
  return (
    <Stack>
      {!isPublic && photoDetail.image_path && photoDetail.image_path.length > 0 && (
        <Group>
          <Text size="xs" c="dimmed">
            {t("exif.filepath")}
          </Text>
          <BreadcrumbPath fullPath={photoDetail.image_path[0].replace(/\\/g, "/").split("/").slice(0, -1).join("/")} />
        </Group>
      )}
      <FileInfoComponent description={t("exif.subjectdistance")} info={`${photoDetail.subjectDistance} m`} />
      <FileInfoComponent description={t("exif.digitalzoomratio")} info={photoDetail.digitalZoomRatio?.toString()} />
      <FileInfoComponent
        description={t("exif.focallengthin35mmfilm")}
        info={`${photoDetail.focalLength35Equivalent} mm`}
      />
    </Stack>
  );
}

/**
 * Displays duplicate files (multiple files attached to same photo)
 * Note: Duplicate management is now handled through the Duplicates page
 */
function DuplicatesSection({ duplicates, t }: { duplicates: string[]; t: (key: string) => string }) {
  if (duplicates.length === 0) return null;

  return (
    <>
      <Text fw={800}>{t("exif.duplicates")}</Text>
      <Text size="sm" c="dimmed" mb="xs">
        {t(
          "exif.duplicates.managed_via_duplicates_page",
          "This photo has multiple file copies. Manage duplicates via the Duplicates page."
        )}
      </Text>
      {duplicates.map(element => (
        <Stack key={element}>
          <Group>
            <Text size="xs" c="dimmed">
              {t("exif.filepath")}
            </Text>
            <BreadcrumbPath fullPath={element.replace(/\\/g, "/").split("/").slice(0, -1).join("/")} />
          </Group>
          <Divider my="sm" />
        </Stack>
      ))}
    </>
  );
}

export function VersionComponent(props: Readonly<{ photoDetail: PhotoType; isPublic: boolean }>) {
  const { photoDetail, isPublic } = props;

  const [showMore, setShowMore] = useState(false);
  const [otherVersions] = useState<PhotoType[]>([]);
  const { t } = useTranslation();

  const fileVariants = photoDetail.file_variants || [];

  // Get paths from file variants to exclude them from duplicates
  const fileVariantPaths = new Set(fileVariants.map(v => v.path));

  // Duplicates are extra image_path entries that are NOT file variants
  // (file variants are same capture in different formats, duplicates are actual file copies)
  const duplicates = photoDetail.image_path
    ? photoDetail.image_path.slice(1).filter(path => !fileVariantPaths.has(path))
    : [];

  return (
    <div>
      <Stack align="flex-start">
        {/* Basic photo information with file variants toggle */}
        <PhotoInfoSection photoDetail={photoDetail} isPublic={isPublic} t={t} />

        {/* Camera equipment and settings */}
        <CameraInfoSection photoDetail={photoDetail} />

        {/* Expanded information section */}
        <Collapse in={showMore}>
          <Stack>
            {/* Additional photo metadata */}
            <AdditionalInfoSection photoDetail={photoDetail} isPublic={isPublic} t={t} />

            {/* Other versions section (placeholder) */}
            {otherVersions.length > 0 && <Text fw={800}>{t("exif.otherversions")}</Text>}

            {/* Duplicates section - only shown if there are true duplicates */}
            {duplicates.length > 0 && <DuplicatesSection duplicates={duplicates} t={t} />}
          </Stack>
        </Collapse>

        {/* Show more/less button */}
        <Button onClick={() => setShowMore(!showMore)} variant="subtle" size="compact-xs">
          {showMore ? t("exif.showless") : t("exif.showmore")}
        </Button>
      </Stack>
    </div>
  );
}
