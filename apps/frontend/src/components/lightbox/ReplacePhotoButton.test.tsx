/**
 * The Details panel's "Replace with an edited version" button: owner-only,
 * photos only, off when uploads are, and a confirmation that says what the
 * file will be called.
 */
import "@mantine/core/styles.css";
import { MantineProvider } from "@mantine/core";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "../../i18n";
import { ReplacePhotoButton } from "./ReplacePhotoButton";

const stubs = vi.hoisted(() => ({
  mutate: vi.fn(),
  userId: 1 as number | null,
  allowUpload: true,
}));

vi.mock("../../api_client/photos/hooks/useReplacePhotoMutation", () => ({
  useReplacePhotoMutation: () => ({ mutate: stubs.mutate, isPending: false }),
}));
vi.mock("../../api_client/settings", () => ({
  useGetSettingsQuery: () => ({ data: { allow_upload: stubs.allowUpload } }),
}));
vi.mock("../../hooks/useLibraryUserId", () => ({ useLibraryUserId: () => stubs.userId }));

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
  // @ts-ignore
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  await i18n.changeLanguage("en");
});

beforeEach(() => {
  document.body.innerHTML = "";
  stubs.mutate.mockReset();
  stubs.userId = 1;
  stubs.allowUpload = true;
});

const photo = {
  id: "p1",
  image_hash: "abc",
  owner: { id: 1, username: "alice", first_name: "", last_name: "" },
  video: false,
};

async function render(detail: Record<string, unknown> = photo, fileName = "IMG_1 [cat].HEIC") {
  const container = document.createElement("div");
  document.body.appendChild(container);
  await act(async () => {
    createRoot(container).render(
      <MantineProvider env="test">
        <ReplacePhotoButton photoDetail={detail as any} fileName={fileName} />
      </MantineProvider>
    );
  });
  return container;
}

async function choose(container: HTMLElement, file: File) {
  const input = container.querySelector<HTMLInputElement>("[data-testid=replace-photo-input]")!;
  Object.defineProperty(input, "files", { value: [file], configurable: true });
  await act(async () => {
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

describe("ReplacePhotoButton", () => {
  it("is not offered on someone else's photo or on a video", async () => {
    stubs.userId = 2;
    expect((await render()).querySelector("button")).toBeNull();
    stubs.userId = 1;
    expect((await render({ ...photo, video: true })).querySelector("button")).toBeNull();
  });

  it("is disabled while uploads are turned off", async () => {
    stubs.allowUpload = false;
    const button = (await render()).querySelector("button")!;
    expect(button.disabled).toBe(true);
  });

  it("says the new name when the format changes, and replaces on confirm", async () => {
    const container = await render();
    await choose(container, new File(["x"], "export.jpg", { type: "image/jpeg" }));

    expect(document.body.textContent).toContain("Replace IMG_1 [cat].HEIC with export.jpg?");
    expect(document.body.textContent).toContain("as IMG_1 [cat].jpg");

    const replaceButton = Array.from(document.body.querySelectorAll("button")).find(
      button => button.textContent === "Replace"
    )!;
    await act(async () => {
      replaceButton.click();
    });
    expect(stubs.mutate).toHaveBeenCalledTimes(1);
    expect(stubs.mutate.mock.calls[0][0]).toMatchObject({ photoId: "p1" });
  });

  it("keeps the name for the same format", async () => {
    const container = await render(photo, "IMG_2.JPG");
    await choose(container, new File(["x"], "IMG_2-edit.jpeg", { type: "image/jpeg" }));
    expect(document.body.textContent).toContain("keeps its name");
  });
});
