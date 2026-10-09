import { useMutation } from "@tanstack/react-query";
import { z } from "zod";
import { calculateChunks, calculateMD5 } from "../../../components/upload/chunkedUpload";
import { parseWithNotification } from "../../../util/zodUtils";
import { fetchClient, queryClient } from "../../api";
import { uploadChunk } from "../../upload/hooks/useUploadMutation";

export const ReplacePhotoResponse = z.object({
  id: z.string(),
  image_hash: z.string(),
  // Same framing as before: the faces and their names were kept.
  kept_faces: z.boolean(),
});
export type ReplacePhotoResponse = z.infer<typeof ReplacePhotoResponse>;

export type ReplacePhotoRequest = {
  photoId: string;
  file: File;
  // 0..100, bytes sent so far.
  onProgress?: (percent: number) => void;
};

// The file goes up in chunks like any upload (the proxy refuses large request
// bodies), and the last call puts it in place of the photo's file instead of
// importing it as a new photo.
async function replacePhoto({ photoId, file, onProgress }: ReplacePhotoRequest) {
  const md5 = await calculateMD5(file);
  let offset = 0;
  let uploadId = "";
  let sent = 0;
  for (const chunk of calculateChunks(file)) {
    const formData = new FormData();
    if (uploadId) formData.append("upload_id", uploadId);
    formData.append("file", chunk);
    formData.append("md5", "");
    formData.append("offset", offset.toString());
    // Sequential on purpose: the chunks are appended in order on the server.
    // eslint-disable-next-line no-await-in-loop
    const response = await uploadChunk({ form_data: formData, offset, chunk_size: chunk.size });
    offset = response.offset;
    uploadId = response.upload_id;
    sent += chunk.size;
    onProgress?.(file.size ? Math.round((sent / file.size) * 100) : 100);
  }

  const formData = new FormData();
  formData.append("upload_id", uploadId);
  formData.append("md5", md5);
  formData.append("photo", photoId);
  formData.append("filename", file.name);
  const response = await fetchClient.post("/upload/replace/", formData);
  return parseWithNotification(ReplacePhotoResponse, response, "Failed to parse replace photo response");
}

export const useReplacePhotoMutation = () =>
  useMutation({
    mutationFn: replacePhoto,
    onSuccess: () => {
      // The photo's image hash moved and its old thumbnails are gone, and any
      // list may hold the old hash: the timeline, albums, people, search, the
      // lightbox. A replacement is rare and deliberate, so everything
      // refetches rather than leaving one view with broken thumbnails.
      queryClient.invalidateQueries();
    },
  });
