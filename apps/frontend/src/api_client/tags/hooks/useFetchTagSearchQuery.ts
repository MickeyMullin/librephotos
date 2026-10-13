import { useQuery } from "@tanstack/react-query";
import { mediaTypeToParams, type MediaType } from "../../../components/photolist/mediaTypeFilter";
import { parseWithNotification } from "../../../util/zodUtils";
import { fetchClient } from "../../api";
import { TagSearchParams, TagSearchResponse } from "../types";

export const TagSearchQueryKeys = ["tagSearch"] as const;

// Search by tags. Nothing is fetched until a tag (or "*", any tag) is picked
// to include or to leave out: an empty search shows nothing, not the whole
// library.
export const useFetchTagSearchQuery = (
  { tags, match, exclude, tagged = false }: TagSearchParams,
  mediaType?: MediaType
) =>
  useQuery({
    queryKey: [...TagSearchQueryKeys, tags.join(","), match, exclude.join(","), tagged, mediaType ?? "all"],
    queryFn: async () => {
      const query = new URLSearchParams(mediaTypeToParams(mediaType));
      if (tags.length) query.set("tags", tags.join(","));
      if (exclude.length) query.set("exclude", exclude.join(","));
      if (tagged) query.set("tagged", "true");
      query.set("match", match);
      const response = await fetchClient.get(`/tags/photos/?${query.toString()}`);
      return parseWithNotification(TagSearchResponse, response, "Failed to parse tag search").results;
    },
    enabled: tags.length > 0 || exclude.length > 0 || tagged,
  });
