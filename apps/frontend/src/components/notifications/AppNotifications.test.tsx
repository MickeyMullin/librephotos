/**
 * Toasts stay out of the way of tagging: away from the right-hand Details
 * panel, short, and transparent to clicks unless they hold a button.
 */
import "@mantine/core/styles.css";
import { MantineProvider } from "@mantine/core";
import { cleanNotifications, showNotification } from "@mantine/notifications";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { INTERACTIVE_TOAST_STYLE } from "../../service/notifications/interactive";
import { AppNotifications } from "./AppNotifications";

let phone = false;

beforeAll(() => {
  // @ts-ignore - jsdom has no matchMedia
  window.matchMedia = (query: string) => ({
    matches: phone && query.includes("max-width"),
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
});

afterEach(async () => {
  await act(async () => {
    cleanNotifications();
  });
  document.body.innerHTML = "";
  phone = false;
});

async function renderWith(...toasts: Parameters<typeof showNotification>[0][]) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  await act(async () => {
    createRoot(container).render(
      <MantineProvider env="test">
        <AppNotifications />
      </MantineProvider>
    );
  });
  await act(async () => {
    toasts.forEach(toast => showNotification(toast));
  });
}

function toast(text: string) {
  const element = Array.from(document.body.querySelectorAll<HTMLElement>(".mantine-Notifications-notification")).find(
    candidate => candidate.textContent?.includes(text)
  );
  if (!element) throw new Error(`no toast "${text}"`);
  return element;
}

describe("AppNotifications", () => {
  it("lets clicks through a plain toast but not through one with a button", async () => {
    await renderWith({ message: "Tagged" }, { message: "Dismissed", style: INTERACTIVE_TOAST_STYLE });
    expect(toast("Tagged").style.pointerEvents).toBe("none");
    expect(toast("Dismissed").style.pointerEvents).toBe("auto");
  });

  it("keeps toasts off the right-hand side, and at the top on a phone", async () => {
    await renderWith({ message: "Desktop" });
    expect(toast("Desktop").closest("[data-position]")?.getAttribute("data-position")).toBe("bottom-left");

    await act(async () => {
      cleanNotifications();
    });
    document.body.innerHTML = "";
    phone = true;
    await renderWith({ message: "Phone" });
    expect(toast("Phone").closest("[data-position]")?.getAttribute("data-position")).toBe("top-center");
  });
});
