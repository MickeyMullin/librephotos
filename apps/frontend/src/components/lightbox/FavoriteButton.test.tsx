/**
 * The favorite star on the photo page: filled when the photo's rating
 * reaches the user's favorite threshold, and toggles it.
 */
import { MantineProvider } from "@mantine/core";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "../../i18n";
import { FavoriteButton } from "./FavoriteButton";

const stubs = vi.hoisted(() => ({ mutate: vi.fn(), user: { favorite_min_rating: 4 } as object | undefined }));

vi.mock("../../api_client/photos/hooks", () => ({
  useSetFavoritePhotosMutation: () => ({ mutate: stubs.mutate, isPending: false }),
}));
vi.mock("../../api_client/user/hooks/useCurrentUserSelfDetailsQuery", () => ({
  useCurrentUserSelfDetailsQuery: () => ({ data: stubs.user }),
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
  // @ts-ignore
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  await i18n.changeLanguage("en");
});

beforeEach(() => {
  stubs.mutate.mockReset();
  stubs.user = { favorite_min_rating: 4 };
});
afterEach(() => {
  document.body.innerHTML = "";
});

async function render(rating: number) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  await act(async () => {
    createRoot(container).render(
      <MantineProvider env="test">
        <FavoriteButton imageHash="abc" rating={rating} />
      </MantineProvider>
    );
  });
  return container.querySelector("button")!;
}

describe("the favorite star", () => {
  it("marks a photo below the threshold as a favorite", async () => {
    const star = await render(2);
    expect(star.getAttribute("aria-pressed")).toBe("false");
    expect(star.getAttribute("aria-label")).toBe(i18n.t("lightbox.toolbar.addToFavorites"));
    await act(async () => star.click());
    expect(stubs.mutate).toHaveBeenCalledWith({ image_hashes: ["abc"], favorite: true });
  });

  it("unmarks a favorite", async () => {
    const star = await render(5);
    expect(star.getAttribute("aria-pressed")).toBe("true");
    await act(async () => star.click());
    expect(stubs.mutate).toHaveBeenCalledWith({ image_hashes: ["abc"], favorite: false });
  });

  it("shows no favorite until the threshold is known", async () => {
    stubs.user = undefined;
    expect((await render(5)).getAttribute("aria-pressed")).toBe("false");
  });
});
