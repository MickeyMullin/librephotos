import { z } from "zod";
import { DatePhotosGroup, PhotoHash } from "../photos/types";

export const Tag = z.object({
  id: z.number(),
  name: z.string(),
  photo_count: z.number(),
});

export type Tag = z.infer<typeof Tag>;

const TagListEntry = Tag.extend({
  cover_photos: PhotoHash.array(),
});

const TagList = TagListEntry.array();

export const TagListResponse = z.object({
  results: TagList,
});

export type TagList = z.infer<typeof TagList>;

const TagAlbum = z.object({
  id: z.number(),
  name: z.string(),
  grouped_photos: DatePhotosGroup.array(),
});

export type TagAlbum = z.infer<typeof TagAlbum>;

export const TagAlbumResponse = z.object({
  results: TagAlbum,
});

export type TagMatch = "all" | "any";

const TagRef = z.object({ id: z.number(), name: z.string() });

// GET /tags/photos/: the photos carrying all (or any) of `tags` and none of
// `excluded`, grouped by date like a tag album. Only the tags that still
// exist come back.
const TagSearch = z.object({
  match: z.enum(["all", "any"]),
  // Only photos with at least one tag (the page's "*"). Optional: an older
  // server does not send it.
  tagged: z.boolean().optional(),
  tags: TagRef.array(),
  excluded: TagRef.array(),
  grouped_photos: DatePhotosGroup.array(),
});

export type TagSearch = z.infer<typeof TagSearch>;

export const TagSearchResponse = z.object({
  results: TagSearch,
});

export type TagSearchParams = {
  tags: number[];
  match: TagMatch;
  exclude: number[];
  /** Only photos carrying at least one tag. */
  tagged?: boolean;
};

export type CreateTagParams = {
  name: string;
  // No toast: the caller shows the result itself (the lightbox's tag badges).
  silent?: boolean;
};

export type RenameTagParams = {
  id: number;
  name: string;
  newName: string;
};

export type DeleteTagParams = {
  id: number;
  name: string;
};

export type TagPhotosParams = {
  id: number;
  name: string;
  photos: string[];
  // No toast: the caller shows the result itself (the lightbox's tag badges).
  silent?: boolean;
};

export type MergeTagsParams = {
  id: number;
  name: string;
  sourceId: number;
  sourceName: string;
};

/** A select-all payload: the query behind the photoset, minus what was unchecked. */
export type TagSelectAllFields = {
  select_all: true;
  query: Record<string, unknown>;
  excluded_hashes: string[];
};

export type TagPhotosByNameParams = {
  /** Tag names as typed, comma-separated entry already split. */
  names: string[];
  /** Explicit photo ids or image hashes. Ignored when selectAll is given. */
  photos?: string[];
  selectAll?: TagSelectAllFields;
  /** How many photos the caller believes it is tagging, for the toast. */
  photoCount: number;
};
