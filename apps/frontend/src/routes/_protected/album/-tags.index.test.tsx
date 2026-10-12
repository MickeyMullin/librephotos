/**
 * Merging tags starts from the tag that goes away: its menu asks which tag to
 * merge it into, and that tag keeps the photos. It used to be the other way
 * round, which read as backwards.
 */
import "@mantine/core/styles.css";
import { MantineProvider } from "@mantine/core";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "../../../i18n";

const stubs = vi.hoisted(() => ({ merge: vi.fn() }));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: Record<string, unknown>) => options,
  Link: ({ children }: { children?: React.ReactNode }) => <a>{children}</a>,
}));
vi.mock("../../../api_client/tags/hooks", () => ({
  useFetchTagsQuery: () => ({
    data: [
      { id: 1, name: "beach", photo_count: 2, cover_photos: [] },
      { id: 2, name: "Beach", photo_count: 5, cover_photos: [] },
    ],
    isFetching: false,
  }),
  useRenameTagMutation: () => ({ mutate: vi.fn() }),
  useDeleteTagMutation: () => ({ mutate: vi.fn() }),
  useMergeTagsMutation: () => ({ mutate: stubs.merge }),
}));
vi.mock("../../../hooks/useAlbumListGridConfig", () => ({
  useAlbumListGridConfig: () => ({ entriesPerRow: 2, entrySquareSize: 100, numberOfRows: 1, gridHeight: 200 }),
}));
// Every cell, without measuring a viewport jsdom does not have.
vi.mock("../../../components/virtual/VirtualGrid", () => ({
  VirtualGrid: ({
    cellRenderer,
    columnCount,
  }: {
    cellRenderer: (props: object) => React.ReactNode;
    columnCount: number;
  }) => (
    <div>
      {Array.from({ length: columnCount }, (_, columnIndex) =>
        cellRenderer({ columnIndex, rowIndex: 0, key: columnIndex, style: {} })
      )}
    </div>
  ),
}));
vi.mock("../../../components/Tile", () => ({ Tile: () => null }));
vi.mock("../../../components/HeaderComponent", () => ({ HeaderComponent: () => null }));

const { Route } = await import("./tags.index");

beforeAll(async () => {
  // @ts-ignore - jsdom has no matchMedia, MantineProvider needs it
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
  // @ts-ignore - jsdom has no ResizeObserver, Select's dropdown needs it
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Element.prototype.scrollIntoView ??= () => {};
  // @ts-ignore
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  await i18n.changeLanguage("en");
});

beforeEach(() => {
  document.body.innerHTML = "";
  stubs.merge.mockReset();
});

const click = (element: Element) =>
  act(async () => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });

function byText(text: string, selector = "*") {
  return Array.from(document.body.querySelectorAll(selector)).find(element => element.textContent?.trim() === text);
}

describe("merging tags", () => {
  it("merges the tag whose menu was opened into the tag picked in the dialog", async () => {
    const Page = (Route as any).component as React.FC;
    const container = document.createElement("div");
    document.body.appendChild(container);
    await act(async () => {
      createRoot(container).render(
        <MantineProvider env="test">
          <Page />
        </MantineProvider>
      );
    });

    // The menu of "beach", the first tile.
    await click(container.querySelectorAll("button")[0]);
    await click(byText("Merge into…", "button")!);
    expect(document.body.textContent).toContain("Pick the tag to merge beach into.");

    await click(document.body.querySelector("input[placeholder='Tag name']")!);
    await click(byText("Beach", "[role=option]")!);
    await click(byText("Merge", "button")!);

    expect(stubs.merge).toHaveBeenCalledWith({ id: 2, name: "Beach", sourceId: 1, sourceName: "beach" });
  });
});
