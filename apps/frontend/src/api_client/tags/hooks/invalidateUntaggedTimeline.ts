import { DateAlbumQueryKeys } from "../../albums/hooks/useFetchDateAlbumQuery";
import { DateAlbumsQueryKeys } from "../../albums/hooks/useFetchDateAlbumsQuery";
import { queryClient } from "../../api";

// Whether a date-album query key was filtered to untagged photos: its
// timeline-filter slot (see timelineFilterKey) holds "untagged=true".
function isUntaggedTimelineKey(queryKey: readonly unknown[]) {
  return queryKey.some(part => typeof part === "string" && part.split("&").includes("untagged=true"));
}

// A tag edit moves photos in or out of an untagged-only timeline. Only those
// timelines refetch: every other view shows the same photos whatever their
// tags, and refetching the whole library after each tag edit would be waste.
export function invalidateUntaggedTimeline() {
  [DateAlbumsQueryKeys, DateAlbumQueryKeys].forEach(prefix => {
    queryClient.invalidateQueries({
      queryKey: [...prefix],
      predicate: query => isUntaggedTimelineKey(query.queryKey),
    });
  });
}
