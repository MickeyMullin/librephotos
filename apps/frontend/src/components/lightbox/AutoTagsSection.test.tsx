/**
 * Auto tags: a click searches, and on the owner's photo an x dismisses a wrong
 * tag, with an Undo in the toast.
 */
import "@mantine/core/styles.css";
import { MantineProvider } from "@mantine/core";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "../../i18n";
import { AutoTagsSection } from "./AutoTagsSection";

const stubs = vi.hoisted(() => ({
  mutate: vi.fn(),
  navigate: vi.fn(),
  showNotification: vi.fn(),
  hideNotification: vi.fn(),
  userId: 1 as number | null,
}));

vi.mock("../../api_client/photos/hooks/useDismissAutoTagMutation", () => ({
  useDismissAutoTagMutation: () => ({ mutate: stubs.mutate }),
}));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => stubs.navigate }));
vi.mock("../../hooks/useLibraryUserId", () => ({ useLibraryUserId: () => stubs.userId }));
vi.mock("@mantine/notifications", () => ({
  showNotification: stubs.showNotification,
  hideNotification: stubs.hideNotification,
}));

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
  Object.values(stubs).forEach(stub => typeof stub === "function" && stub.mockReset());
  stubs.userId = 1;
});

const photo = {
  id: "p1",
  image_hash: "abc",
  owner: { id: 1, username: "alice", first_name: "", last_name: "" },
};

async function render(isPublic = false) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  await act(async () => {
    createRoot(container).render(
      <MantineProvider env="test">
        <AutoTagsSection photoDetail={photo as any} autoTags={["beach", "cat"]} isPublic={isPublic} />
      </MantineProvider>
    );
  });
  return container;
}

const dismissButton = (container: HTMLElement, tag: string) =>
  container.querySelector<HTMLButtonElement>(`button[aria-label^="Dismiss ${tag}"]`);

describe("AutoTagsSection", () => {
  it("dismisses a tag without searching for it, and offers an Undo", async () => {
    const container = await render();
    await act(async () => {
      dismissButton(container, "cat")!.click();
    });

    expect(stubs.navigate).not.toHaveBeenCalled();
    expect(stubs.mutate).toHaveBeenCalledTimes(1);
    const [request, callbacks] = stubs.mutate.mock.calls[0];
    expect(request).toEqual({ photo: "p1", tag: "cat" });

    callbacks.onSuccess();
    const { message } = stubs.showNotification.mock.calls[0][0];
    const toast = document.createElement("div");
    document.body.appendChild(toast);
    await act(async () => {
      createRoot(toast).render(<MantineProvider env="test">{message}</MantineProvider>);
    });
    await act(async () => {
      Array.from(toast.querySelectorAll("button"))
        .find(button => button.textContent === "Undo")!
        .click();
    });
    expect(stubs.mutate).toHaveBeenLastCalledWith({ photo: "p1", tag: "cat", dismissed: false });
  });

  it("searches for a tag when the badge is clicked", async () => {
    const container = await render();
    await act(async () => {
      Array.from(container.querySelectorAll(".mantine-Badge-root"))
        .find(badge => badge.textContent === "beach")!
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(stubs.navigate).toHaveBeenCalledWith({ to: "/search/beach" });
  });

  it("offers no dismissal on someone else's photo or a public page", async () => {
    stubs.userId = 2;
    expect(dismissButton(await render(), "cat")).toBeNull();
    stubs.userId = 1;
    expect(dismissButton(await render(true), "cat")).toBeNull();
  });
});
