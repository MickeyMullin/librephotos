/**
 * The Details panel's link to the photo's own page: a real link (so the
 * browser offers new tab, Copy Link and Share), by the photo's id, which
 * survives a Replace, unlike the image hash.
 */
import { MantineProvider } from "@mantine/core";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "../../i18n";
import { PhotoLinkButton } from "./PhotoLinkButton";

const stubs = vi.hoisted(() => ({ navigate: vi.fn() }));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => stubs.navigate,
  useRouter: () => ({
    buildLocation: ({ params }: { params: { id: string } }) => ({ href: `/photo/${params.id}` }),
  }),
}));

const ID = "123e4567-e89b-12d3-a456-426614174000";

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

beforeEach(() => stubs.navigate.mockReset());
afterEach(() => {
  document.body.innerHTML = "";
});

async function render() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  await act(async () => {
    createRoot(container).render(
      <MantineProvider env="test">
        <PhotoLinkButton photoId={ID} />
      </MantineProvider>
    );
  });
  return container.querySelector("a")!;
}

async function click(link: HTMLAnchorElement, init: MouseEventInit = {}) {
  const event = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0, ...init });
  await act(async () => {
    link.dispatchEvent(event);
  });
  return event;
}

describe("the photo link", () => {
  it("is a real link to the photo's page", async () => {
    const link = await render();
    expect(link.href).toBe(`${window.location.origin}/photo/${ID}`);
  });

  it("goes to the page within the app on a plain click", async () => {
    const event = await click(await render());
    expect(event.defaultPrevented).toBe(true);
    expect(stubs.navigate).toHaveBeenCalledWith({ to: "/photo/$id", params: { id: ID } });
  });

  it("leaves a middle click or Ctrl/Cmd-click to the browser (a new tab)", async () => {
    for (const init of [{ button: 1 }, { ctrlKey: true }, { metaKey: true }]) {
      // eslint-disable-next-line no-await-in-loop
      const event = await click(await render(), init);
      expect(event.defaultPrevented).toBe(false);
    }
    expect(stubs.navigate).not.toHaveBeenCalled();
  });
});
