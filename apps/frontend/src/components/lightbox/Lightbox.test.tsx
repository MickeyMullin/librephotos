/**
 * Moving through the lightbox must not depend on the parent echoing every
 * move back. The Duplicates page never did, and the lightbox snapped back to
 * the photo it was opened on after each arrow or thumbnail click.
 */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeAll, describe, expect, it, vi } from "vitest";

const viewer = vi.hoisted(() => ({ props: {} as Record<string, any> }));

vi.mock("./ContentViewer", () => ({
  ContentViewer: (props: Record<string, any>) => {
    viewer.props = props;
    return null;
  },
}));
vi.mock("../../api_client/photos/hooks", () => ({
  useFetchPhotoDetailsQuery: () => ({ data: undefined }),
}));

const { Lightbox } = await import("./Lightbox");

beforeAll(() => {
  // @ts-ignore
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
});

const photos = [
  { id: "id-a", image_hash: "hash-a" },
  { id: "id-b", image_hash: "hash-b" },
  { id: "id-c", image_hash: "hash-c" },
];

async function renderLightbox(selectedImage: string, extra: Record<string, unknown> = {}) {
  const root = createRoot(document.createElement("div"));
  const render = async (selected: string) => {
    await act(async () => {
      root.render(
        <Lightbox
          isPublic={false}
          idx2hash={photos}
          selectedImage={selected}
          onCloseRequest={() => {}}
          onChangedIndex={() => {}}
          {...extra}
        />
      );
    });
  };
  await render(selectedImage);
  return render;
}

describe("Lightbox navigation", () => {
  it("moves without the parent echoing the move back", async () => {
    await renderLightbox("id-a");
    expect(viewer.props.mainSrc).toBe("id-a");
    expect(viewer.props.nextSrcHash).toBe("hash-b");

    await act(async () => {
      viewer.props.onMoveNextRequest();
    });
    expect(viewer.props.mainSrc).toBe("id-b");
    expect(viewer.props.mainSrcHash).toBe("hash-b");

    await act(async () => {
      viewer.props.onMoveNextRequest();
    });
    expect(viewer.props.mainSrc).toBe("id-c");

    await act(async () => {
      viewer.props.onMovePrevRequest();
    });
    expect(viewer.props.mainSrc).toBe("id-b");
  });

  it("still follows the parent when it selects another photo", async () => {
    const onImageChange = vi.fn();
    const rerender = await renderLightbox("id-a", { onImageChange });
    await act(async () => {
      viewer.props.onMoveNextRequest();
    });
    expect(onImageChange).toHaveBeenCalledWith("id-b");

    await rerender("id-c");
    expect(viewer.props.mainSrc).toBe("id-c");
  });
});
