import { useMutation } from "@tanstack/react-query";
import { notification } from "../../../service/notifications";
import { parseWithNotification } from "../../../util/zodUtils";
import { fetchClient, queryClient } from "../../api";
import { CreateTagParams, Tag } from "../types";
import { TagsQueryKeys } from "./useFetchTagsQuery";

export const useCreateTagMutation = () =>
  useMutation({
    mutationFn: async ({ name, silent }: CreateTagParams) => {
      const response = await fetchClient.post(`/tags/`, { name });
      const tag = parseWithNotification(Tag, response, "Failed to parse tag");
      if (!silent) notification.createTag(name);
      return tag;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...TagsQueryKeys] });
    },
  });
