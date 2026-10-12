/**
 * A long filename is cut to one line in the Details panel. Hovering shows it
 * in a tooltip, which never happens on a touch screen, so a cut-off name gets
 * an eye button that shows it in full; the choice is remembered.
 */
import "@mantine/core/styles.css";
import { MantineProvider } from "@mantine/core";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import i18n from "../../i18n";
import { FileName } from "./VersionComponent";

vi.mock("../../api_client/apiClient", () => ({ serverAddress: "" }));
vi.mock("./ReplacePhotoButton", () => ({ ReplacePhotoButton: () => null }));

const LONG = "2024-07-14 Grandma's 90th birthday party at the lake house, cake.jpg";

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
  // @ts-ignore
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  await i18n.changeLanguage("en");
});

const roots: ReturnType<typeof createRoot>[] = [];
afterEach(async () => {
  await act(async () => roots.splice(0).forEach(root => root.unmount()));
  vi.restoreAllMocks();
  window.localStorage.clear();
});

// jsdom lays nothing out: say whether the text overflows its box.
function overflowing(value: boolean) {
  vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockReturnValue(value ? 500 : 100);
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(100);
}

async function render(fileName = LONG) {
  const container = document.createElement("div");
  const root = createRoot(container);
  roots.push(root);
  await act(async () =>
    root.render(
      <MantineProvider env="test">
        <FileName fileName={fileName} href="/media/photos/abc" />
      </MantineProvider>
    )
  );
  return container;
}

const clamped = (container: HTMLElement) => container.querySelector("p")!.hasAttribute("data-line-clamp");

describe("the filename in the Details panel", () => {
  it("offers no button when the whole name fits", async () => {
    overflowing(false);
    const container = await render("cake.jpg");
    expect(container.querySelector("button")).toBeNull();
  });

  it("shows a cut-off name in full on a tap, and remembers that for the next photo", async () => {
    overflowing(true);
    const container = await render();
    expect(clamped(container)).toBe(true);
    const button = container.querySelector<HTMLButtonElement>("button[aria-label='Show the whole filename']")!;
    await act(async () => button.click());
    expect(clamped(container)).toBe(false);
    expect(container.querySelector("p")!.textContent).toBe(LONG);

    const next = await render("another long name that would not fit either.jpg");
    expect(clamped(next)).toBe(false);
    const back = next.querySelector<HTMLButtonElement>("button[aria-label='Show the filename on one line']")!;
    await act(async () => back.click());
    expect(clamped(next)).toBe(true);
  });
});
