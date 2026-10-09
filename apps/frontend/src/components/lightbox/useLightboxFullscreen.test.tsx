/**
 * The lightbox's fullscreen toggle falls back to an in-page immersive mode
 * where the browser has no Fullscreen API for pages (every browser on iPhone),
 * instead of a button that silently does nothing.
 */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { canUseNativeFullscreen, useLightboxFullscreen } from "./useLightboxFullscreen";

beforeAll(() => {
  // @ts-ignore
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
});

// jsdom has no Fullscreen API: each test says whether the browser has one.
function setFullscreenEnabled(value: boolean) {
  Object.defineProperty(document, "fullscreenEnabled", { value, configurable: true });
}

afterEach(() => {
  // @ts-ignore - the property was defined by the test
  delete document.fullscreenEnabled;
});

function fakeDocument(fields: Record<string, unknown>) {
  return fields as unknown as Document;
}

async function renderProbe() {
  const state: { current?: ReturnType<typeof useLightboxFullscreen> } = {};
  function Probe() {
    state.current = useLightboxFullscreen();
    return null;
  }
  const root = createRoot(document.createElement("div"));
  await act(async () => {
    root.render(<Probe />);
  });
  return state;
}

describe("canUseNativeFullscreen", () => {
  it("reads the standard and the WebKit-prefixed flag", () => {
    expect(canUseNativeFullscreen(fakeDocument({ fullscreenEnabled: true }))).toBe(true);
    expect(canUseNativeFullscreen(fakeDocument({ webkitFullscreenEnabled: true }))).toBe(true);
    // iPhone: neither flag is set.
    expect(canUseNativeFullscreen(fakeDocument({}))).toBe(false);
  });
});

describe("useLightboxFullscreen", () => {
  it("toggles an in-page immersive mode when the browser has no Fullscreen API", async () => {
    setFullscreenEnabled(false);
    const state = await renderProbe();
    expect(state.current!.isFullscreen).toBe(false);

    await act(async () => {
      state.current!.toggle();
    });
    expect(state.current!.isFullscreen).toBe(true);
    expect(state.current!.immersive).toBe(true);

    await act(async () => {
      state.current!.exit();
    });
    expect(state.current!.isFullscreen).toBe(false);
    expect(state.current!.immersive).toBe(false);
  });

  it("uses the real Fullscreen API where there is one", async () => {
    setFullscreenEnabled(true);
    const requestFullscreen = vi.fn().mockResolvedValue(undefined);
    document.documentElement.requestFullscreen = requestFullscreen;
    const state = await renderProbe();

    await act(async () => {
      state.current!.toggle();
    });
    expect(requestFullscreen).toHaveBeenCalled();
    expect(state.current!.immersive).toBe(false);
  });
});
