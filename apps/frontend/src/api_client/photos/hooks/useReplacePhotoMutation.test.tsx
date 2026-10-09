/**
 * Replacing a photo: the file goes up in chunks like an upload, then one call
 * puts it in place of the photo, and every query refetches because the
 * photo's hash (and every thumbnail URL) moved.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeAll, describe, expect, it, vi } from "vitest";

const stubs = vi.hoisted(() => ({
  post: vi.fn(),
  uploadChunk: vi.fn(),
  queryClient: undefined as unknown as QueryClient,
}));

vi.mock("../../api", async () => {
  const { QueryClient: Client } = await import("@tanstack/react-query");
  stubs.queryClient = new Client();
  return { fetchClient: { post: stubs.post }, queryClient: stubs.queryClient };
});
vi.mock("../../upload/hooks/useUploadMutation", () => ({ uploadChunk: stubs.uploadChunk }));
vi.mock("../../../components/upload/chunkedUpload", () => ({
  calculateMD5: async () => "md5sum",
  // Two chunks, whatever the file.
  calculateChunks: (file: File) => [file.slice(0, 2), file.slice(2)],
}));

const { useReplacePhotoMutation } = await import("./useReplacePhotoMutation");

beforeAll(() => {
  // @ts-ignore
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
});

describe("useReplacePhotoMutation", () => {
  it("uploads the chunks, then replaces the photo and refetches everything", async () => {
    stubs.uploadChunk
      .mockResolvedValueOnce({ upload_id: "u1", offset: 2 })
      .mockResolvedValueOnce({ upload_id: "u1", offset: 4 });
    stubs.post.mockResolvedValue({ id: "p1", image_hash: "newhash", kept_faces: true });
    const invalidate = vi.spyOn(stubs.queryClient, "invalidateQueries");
    const progress = vi.fn();

    let mutateAsync: ReturnType<typeof useReplacePhotoMutation>["mutateAsync"] | undefined;
    function Probe() {
      mutateAsync = useReplacePhotoMutation().mutateAsync;
      return null;
    }
    await act(async () => {
      createRoot(document.createElement("div")).render(
        <QueryClientProvider client={stubs.queryClient}>
          <Probe />
        </QueryClientProvider>
      );
    });

    const file = new File(["abcd"], "edited.jpg", { type: "image/jpeg" });
    let result: unknown;
    await act(async () => {
      result = await mutateAsync!({ photoId: "p1", file, onProgress: progress });
    });

    expect(stubs.uploadChunk).toHaveBeenCalledTimes(2);
    // The second chunk continues the first upload.
    expect(stubs.uploadChunk.mock.calls[1][0].form_data.get("upload_id")).toBe("u1");
    expect(progress).toHaveBeenLastCalledWith(100);

    const [endpoint, form] = stubs.post.mock.calls[0];
    expect(endpoint).toBe("/upload/replace/");
    expect(Object.fromEntries((form as FormData).entries())).toEqual({
      upload_id: "u1",
      md5: "md5sum",
      photo: "p1",
      filename: "edited.jpg",
    });
    expect(result).toEqual({ id: "p1", image_hash: "newhash", kept_faces: true });
    expect(invalidate).toHaveBeenCalledWith();
  });
});
