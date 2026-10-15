/**
 * Reviewing a duplicate group: each copy shows its caption and tags, and when
 * the copies' captions differ, the user picks whose caption the kept photo
 * gets (or keeps them all, joined).
 */
import "@mantine/core/styles.css";
import { MantineProvider } from "@mantine/core";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "../../i18n";

const stubs = vi.hoisted(() => ({ resolve: vi.fn(), photos: [] as object[] }));

function photo(hash: string, extra: object) {
  return {
    id: `id-${hash}`,
    image_hash: hash,
    thumbnail_url: null,
    thumbnail_big_url: null,
    width: 4000,
    height: 3000,
    size: 2_000_000,
    exif_timestamp: null,
    camera: null,
    file_path: `/data/${hash}.jpg`,
    file_type: "Image",
    is_kept: false,
    ...extra,
  };
}

vi.mock("../../api_client/apiClient", () => ({ serverAddress: "" }));
vi.mock("../lightbox", () => ({ Lightbox: () => null }));
vi.mock("../../api_client/duplicates", () => ({
  useDuplicateQuery: () => ({
    data: {
      id: "d1",
      duplicate_type: "exact_copy",
      duplicate_type_display: "Exact copy",
      review_status: "pending",
      review_status_display: "Pending",
      photo_count: stubs.photos.length,
      potential_savings: 0,
      similarity_score: null,
      photos: stubs.photos,
    },
    isLoading: false,
  }),
  useResolveDuplicateMutation: () => ({ mutate: stubs.resolve, isPending: false }),
  useDismissDuplicateMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useRevertDuplicateMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteDuplicateMutation: () => ({ mutate: vi.fn() }),
  useDetectDuplicatesMutation: () => ({ mutate: vi.fn() }),
  useDuplicatesQuery: () => ({ data: undefined }),
  useDuplicateStatsQuery: () => ({ data: undefined }),
}));

const { DuplicateModal } = await import("./DuplicatesPageContent");

beforeAll(async () => {
  // @ts-ignore - jsdom has no matchMedia, MantineProvider needs it
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
  // @ts-ignore - jsdom has no ResizeObserver, Spoiler and ScrollArea need it
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  // @ts-ignore
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  await i18n.changeLanguage("en");
});

beforeEach(() => {
  document.body.innerHTML = "";
  stubs.resolve.mockReset();
});

async function render() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  await act(async () => {
    createRoot(container).render(
      <MantineProvider env="test">
        <DuplicateModal duplicateId="d1" opened onClose={() => {}} />
      </MantineProvider>
    );
  });
}

const click = (element: Element) =>
  act(async () => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });

const keepButton = () =>
  Array.from(document.querySelectorAll("button")).find(b => b.textContent?.includes("Keep Selected"))!;

describe("reviewing a duplicate group", () => {
  it("shows each copy's caption and tags", async () => {
    stubs.photos = [
      photo("a", { caption: "At the lake", tags: [{ id: 1, name: "beach" }] }),
      photo("b", { caption: "", tags: [] }),
    ];
    await render();
    const text = document.body.textContent ?? "";
    expect(text).toContain("At the lake");
    expect(text).toContain("beach");
    expect(text).toContain("No caption");
    expect(text).toContain("No tags");
    // One caption only: nothing to choose.
    expect(document.querySelector("input[type=radio]")).toBeNull();
  });

  it("joins the captions unless one is picked", async () => {
    stubs.photos = [
      photo("a", { caption: "At the lake", tags: [] }),
      photo("b", { caption: "Summer #trip", tags: [] }),
    ];
    await render();
    await click(keepButton());
    expect(stubs.resolve.mock.calls[0][0]).toMatchObject({ id: "d1", caption_from: undefined });

    document.body.innerHTML = "";
    await render();
    const summer = Array.from(document.querySelectorAll<HTMLInputElement>("input[type=radio]")).find(
      input => input.value === "b"
    )!;
    await click(summer);
    await click(keepButton());
    expect(stubs.resolve.mock.calls[1][0]).toMatchObject({ id: "d1", caption_from: "b" });
  });
});
