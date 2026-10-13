/**
 * Enter in the Details panel's tag editor: with a name typed it turns the
 * name into a tag (and with a suggestion highlighted, picks it), and with
 * nothing left to turn into a tag it saves.
 */
import "@mantine/core/styles.css";
import { MantineProvider } from "@mantine/core";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "../../i18n";
import { TagsSection } from "./TagsSection";

const stubs = vi.hoisted(() => ({
  add: vi.fn(),
  remove: vi.fn(),
  create: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }));
vi.mock("../../service/notifications", () => ({ notification: { requestFailed: vi.fn() } }));
vi.mock("../../api_client/tags/hooks", () => ({
  useFetchPhotoTagsQuery: () => ({ data: [{ id: 1, name: "beach" }] }),
  useFetchTagsQuery: () => ({
    data: [
      { id: 1, name: "beach" },
      { id: 2, name: "dog" },
    ],
  }),
  useCreateTagMutation: () => ({ mutateAsync: stubs.create }),
  useAddPhotosToTagMutation: () => ({ mutateAsync: stubs.add, isPending: false }),
  useRemovePhotosFromTagMutation: () => ({ mutateAsync: stubs.remove, isPending: false }),
}));

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
  // @ts-ignore - jsdom has no ResizeObserver, the suggestions need it
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
  stubs.add.mockReset().mockResolvedValue(undefined);
  stubs.remove.mockReset().mockResolvedValue(undefined);
  stubs.create.mockReset().mockImplementation(async ({ name }: { name: string }) => ({ id: 9, name }));
});

const roots: ReturnType<typeof createRoot>[] = [];
afterEach(async () => {
  await act(async () => roots.splice(0).forEach(root => root.unmount()));
  document.body.innerHTML = "";
});

async function openEditor() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  await act(async () =>
    root.render(
      <MantineProvider env="test">
        <TagsSection photoDetail={{ id: "photo-1" } as never} />
      </MantineProvider>
    )
  );
  await act(async () => container.querySelector("button")!.click());
  return container;
}

const input = (container: HTMLElement) => container.querySelector<HTMLInputElement>("input:not([type=hidden])")!;

async function type(container: HTMLElement, text: string) {
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  await act(async () => {
    setValue.call(input(container), text);
    input(container).dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function press(container: HTMLElement, key: string, code = key) {
  await act(async () => {
    input(container).dispatchEvent(new KeyboardEvent("keydown", { key, code, bubbles: true }));
  });
}

describe("opening the tag editor", () => {
  it("puts the cursor in the tag box", async () => {
    const container = await openEditor();
    expect(document.activeElement).toBe(input(container));
  });
});

describe("Enter in the tag editor", () => {
  it("turns a typed name into a tag first, then saves on the next Enter", async () => {
    const container = await openEditor();
    await type(container, "sunset");
    await press(container, "Enter");
    expect(stubs.add).not.toHaveBeenCalled();
    expect(input(container)).not.toBeNull();

    await press(container, "Enter");
    expect(stubs.create).toHaveBeenCalledWith({ name: "sunset", silent: true });
    expect(stubs.add).toHaveBeenCalledWith({ id: 9, name: "sunset", photos: ["photo-1"], silent: true });
    // Saved and closed: the badges are back.
    expect(container.querySelector("input:not([type=hidden])")).toBeNull();
  });

  it("picks a highlighted suggestion instead of saving", async () => {
    const container = await openEditor();
    await press(container, "ArrowDown");
    expect(document.querySelector("[data-combobox-selected]")).not.toBeNull();
    await press(container, "Enter");
    expect(stubs.add).not.toHaveBeenCalled();
    expect(input(container)).not.toBeNull();
  });
});
