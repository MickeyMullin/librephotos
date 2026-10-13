/**
 * Search by tags: the URL holds the search (tag ids, match, exclusions), the
 * query carries it, and picking a tag rewrites the URL.
 */
import "@mantine/core/styles.css";
import { MantineProvider } from "@mantine/core";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "../../../i18n";

const stubs = vi.hoisted(() => ({
  search: {} as Record<string, unknown>,
  navigate: vi.fn(),
  searchQuery: vi.fn(),
  listProps: {} as Record<string, any>,
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: Record<string, unknown>) => ({
    ...options,
    useSearch: () => stubs.search,
  }),
  useNavigate: () => stubs.navigate,
}));
vi.mock("../../../api_client/tags/hooks", () => ({
  useFetchTagsQuery: () => ({
    data: [
      { id: 1, name: "beach", photo_count: 2 },
      { id: 2, name: "dog", photo_count: 2 },
      { id: 3, name: "night", photo_count: 1 },
    ],
  }),
  useFetchTagSearchQuery: (...args: unknown[]) => {
    stubs.searchQuery(...args);
    return { data: { match: "all", tags: [], excluded: [], grouped_photos: [] }, isFetching: false };
  },
}));
vi.mock("../../../components/photolist/useMediaTypeFilter", () => ({ useMediaTypeFilter: () => "all" }));
vi.mock("../../../components/photolist/PhotoListView", () => ({
  PhotoListView: (props: Record<string, any>) => {
    stubs.listProps = props;
    return <div>{props.additionalSubHeader}</div>;
  },
}));

const { Route, parseTagIds, validateTagSearch } = await import("./tags.search");

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
  // @ts-ignore - jsdom has no ResizeObserver, SegmentedControl needs it
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
  stubs.search = {};
  stubs.navigate.mockReset();
  stubs.searchQuery.mockReset();
});

async function render() {
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
  return container;
}

describe("tag search URL", () => {
  it("reads one id (parsed as a number) or several (a string), and drops junk", () => {
    expect(parseTagIds(3)).toEqual([3]);
    expect(parseTagIds("3,7, 3,x,")).toEqual([3, 7]);
    expect(parseTagIds(undefined)).toEqual([]);
    expect(validateTagSearch({ tags: "2,1", match: "any", exclude: 5, media: "videos", page: 2 })).toEqual({
      tags: "2,1",
      match: "any",
      exclude: "5",
      media: "videos",
    });
    // "all" is the default and stays out of the URL.
    expect(validateTagSearch({ tags: "1", match: "all" })).toEqual({ tags: "1" });
    // "*" (any tag) survives, first, once.
    expect(validateTagSearch({ tags: "3,*,x,*" })).toEqual({ tags: "*,3" });
    expect(validateTagSearch({ tags: "*" })).toEqual({ tags: "*" });
  });
});

describe("tag search page", () => {
  it("searches for what the URL holds", async () => {
    stubs.search = { tags: "1,2", match: "any", exclude: "3" };
    await render();
    expect(stubs.searchQuery).toHaveBeenLastCalledWith(
      { tags: [1, 2], match: "any", exclude: [3], tagged: false },
      "all"
    );
  });

  it("offers All/Any only once two tags are picked", async () => {
    stubs.search = { tags: "1" };
    let container = await render();
    expect(container.textContent).not.toContain("Any tag");

    document.body.innerHTML = "";
    stubs.search = { tags: "1,2" };
    container = await render();
    expect(container.textContent).toContain("Any tag");
  });

  it("writes a changed match back to the URL, replacing the history entry", async () => {
    stubs.search = { tags: "1,2" };
    const container = await render();
    const any = Array.from(container.querySelectorAll<HTMLInputElement>("input[type=radio]")).find(
      input => input.value === "any"
    )!;
    await act(async () => {
      any.click();
    });
    const { search, replace } = stubs.navigate.mock.calls[0][0];
    expect(replace).toBe(true);
    expect(search({ media: "videos" })).toEqual({ media: "videos", tags: "1,2", exclude: undefined, match: "any" });
  });

  it("shows nothing and asks for tags before any is picked", async () => {
    await render();
    expect(stubs.listProps.photoset).toEqual([]);
    expect(stubs.listProps.emptyStateConfig.title).toBe("Pick tags to search for");
  });
});

// Types into a tag box the way a keyboard or a paste does.
async function type(input: HTMLInputElement, text: string) {
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  await act(async () => {
    setValue.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function box(container: HTMLElement, label: string) {
  return container.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
}

describe("finishing a tag with a comma", () => {
  it("keeps the phone keyboard from capitalizing tag names", async () => {
    const container = await render();
    expect(box(container, "Photos with these tags").getAttribute("autocapitalize")).toBe("none");
    expect(box(container, "Without these tags").getAttribute("autocapitalize")).toBe("none");
  });

  it("adds the typed tag to the search, in any case", async () => {
    stubs.search = { tags: "1" };
    const container = await render();
    const input = box(container, "Photos with these tags");
    await type(input, "DOG,");
    const { search } = stubs.navigate.mock.calls[0][0];
    expect(search({})).toMatchObject({ tags: "1,2" });
    expect(input.value).toBe("");
  });

  it("adds to the exclusions from the other box", async () => {
    const container = await render();
    await type(box(container, "Without these tags"), "night,");
    const { search } = stubs.navigate.mock.calls[0][0];
    expect(search({})).toMatchObject({ exclude: "3" });
  });

  it("takes the first suggestion for a partly typed name, and several at once from a paste", async () => {
    const container = await render();
    await type(box(container, "Photos with these tags"), "bea, ni, do");
    const { search } = stubs.navigate.mock.calls[0][0];
    expect(search({})).toMatchObject({ tags: "1,3" });
    // The last name has no comma yet: it stays in the box.
    expect(box(container, "Photos with these tags").value).toBe("do");
  });

  it("keeps a name that matches no tag in the box, without the comma", async () => {
    const container = await render();
    const input = box(container, "Photos with these tags");
    await type(input, "cat,");
    expect(stubs.navigate).not.toHaveBeenCalled();
    expect(input.value).toBe("cat");
  });
});

describe("any tag (*)", () => {
  it("searches for tagged photos without the excluded ones", async () => {
    stubs.search = { tags: "*", exclude: "1" };
    const container = await render();
    expect(stubs.searchQuery).toHaveBeenLastCalledWith({ tags: [], match: "all", exclude: [1], tagged: true }, "all");
    expect(container.textContent).toContain("*");
  });

  it("is added with a comma like a tag, and kept in front of the others in the URL", async () => {
    stubs.search = { tags: "2" };
    const container = await render();
    await type(box(container, "Photos with these tags"), "*,");
    const { search } = stubs.navigate.mock.calls[0][0];
    expect(search({})).toMatchObject({ tags: "*,2" });
  });

  it("is not offered under Without", async () => {
    const container = await render();
    await type(box(container, "Without these tags"), "*,");
    expect(stubs.navigate).not.toHaveBeenCalled();
  });
});
