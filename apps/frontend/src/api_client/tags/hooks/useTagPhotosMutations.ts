import { useMutation } from "@tanstack/react-query";
import { notification } from "../../../service/notifications";
import { fetchClient, queryClient } from "../../api";
import { TagPhotosParams } from "../types";
import { invalidateUntaggedTimeline } from "./invalidateUntaggedTimeline";
import { TagAlbumQueryKeys } from "./useFetchTagAlbumQuery";
import { TagsQueryKeys } from "./useFetchTagsQuery";

export const useAddPhotosToTagMutation = () =>
  useMutation({
    mutationFn: async ({ id, name, photos, silent }: TagPhotosParams) => {
      await fetchClient.post(`/tags/${id}/add/`, { photos });
      if (!silent) notification.addPhotosToTag(name, photos.length);
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: [...TagsQueryKeys] });
      invalidateUntaggedTimeline();
      queryClient.invalidateQueries({ queryKey: [...TagAlbumQueryKeys, `${id}`] });
    },
  });

export const useRemovePhotosFromTagMutation = () =>
  useMutation({
    mutationFn: async ({ id, name, photos, silent }: TagPhotosParams) => {
      await fetchClient.post(`/tags/${id}/remove/`, { photos });
      if (!silent) notification.removePhotosFromTag(name, photos.length);
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: [...TagsQueryKeys] });
      invalidateUntaggedTimeline();
      queryClient.invalidateQueries({ queryKey: [...TagAlbumQueryKeys, `${id}`] });
    },
  });
