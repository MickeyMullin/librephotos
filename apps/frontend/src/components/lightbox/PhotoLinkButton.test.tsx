/**
 * The Details panel's link button: the link opens the photo's own page, by
 * the photo's id (stable across a Replace, unlike the image hash), shared
 * through the share sheet on a touch screen and copied elsewhere.
 */
import { MantineProvider } from "@mantine/core";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "../../i18n";
import { PhotoLinkButton } from "./PhotoLinkButton";

const stubs = vi.hoisted(() => ({ copied: vi.fn(), failed: vi.fn() }));

vi.mock("@tanstack/react-router", () => ({
  useRouter: () => ({
    buildLocation: ({ params }: { params: { id: string } }) => ({ href: `/photo/${params.id}` }),
  }),
}));
vi.mock("../../service/notifications", () => ({
  notification: { copyPhotoLink: stubs.copied, copyPhotoLinkFailed: stubs.failed },
}));

const ID = "123e4567-e89b-12d3-a456-426614174000";
const LINK = `${window.location.origin}/photo/${ID}`;
let touch = false;

beforeAll(async () => {
  // @ts-ignore - jsdom has no matchMedia
  window.matchMedia = (query: string) => ({
    matches: touch && query.includes("coarse"),
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

const writeText = vi.fn();
const share = vi.fn();

beforeEach(() => {
  touch = false;
  stubs.copied.mockReset();
  stubs.failed.mockReset();
  writeText.mockReset().mockResolvedValue(undefined);
  share.mockReset().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  Object.defineProperty(navigator, "share", { value: share, configurable: true });
});

afterEach(() => {
  document.body.innerHTML = "";
});

async function press() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  await act(async () => {
    createRoot(container).render(
      <MantineProvider env="test">
        <PhotoLinkButton photoId={ID} />
      </MantineProvider>
    );
  });
  await act(async () => container.querySelector("button")!.click());
}

describe("the photo link button", () => {
  it("copies the link to the photo's page on a computer", async () => {
    await press();
    expect(writeText).toHaveBeenCalledWith(LINK);
    expect(share).not.toHaveBeenCalled();
    expect(stubs.copied).toHaveBeenCalled();
  });

  it("opens the share sheet on a touch screen, and closing it is not an error", async () => {
    touch = true;
    share.mockRejectedValueOnce(new DOMException("closed", "AbortError"));
    await press();
    expect(share).toHaveBeenCalledWith({ url: LINK });
    expect(writeText).not.toHaveBeenCalled();
    expect(stubs.failed).not.toHaveBeenCalled();
  });

  it("shows the link when the clipboard is refused", async () => {
    writeText.mockRejectedValueOnce(new Error("denied"));
    await press();
    expect(stubs.failed).toHaveBeenCalledWith(LINK);
  });
});
