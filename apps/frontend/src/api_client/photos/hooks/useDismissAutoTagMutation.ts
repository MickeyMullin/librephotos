import { useMutation } from "@tanstack/react-query";
import i18n from "../../../i18n";
import { notification } from "../../../service/notifications";
import { ThingsAlbumsQueryKeys } from "../../albums/hooks/useFetchThingsAlbumsQuery";
import { fetchClient, queryClient } from "../../api";
import { PhotoDetailsQueryKeys } from "./useFetchPhotoDetailsQuery";

export type DismissAutoTagRequest = {
  // The photo's id or image hash.
  photo: string;
  tag: string;
  // false restores a tag dismissed before (the toast's Undo).
  dismissed?: boolean;
};

// Dismiss an auto tag the tagging model got wrong. The server drops it from
// the photo's tags, its thing album and search, and keeps it from coming back
// when the photo is tagged again.
export const useDismissAutoTagMutation = () =>
  useMutation({
    mutationFn: async ({ photo, tag, dismissed = true }: DismissAutoTagRequest) => {
      await fetchClient.post("/photosedit/autotag/", { photo, tag, dismissed });
    },
    onSuccess: () => {
      // Photo details are keyed by hash or id depending on the caller.
      queryClient.invalidateQueries({ queryKey: [...PhotoDetailsQueryKeys] });
      queryClient.invalidateQueries({ queryKey: [...ThingsAlbumsQueryKeys] });
    },
    onError: () => {
      notification.requestFailed(i18n.t("lightbox.sidebar.autotags"), i18n.t("lightbox.autotag.failed"));
    },
  });
