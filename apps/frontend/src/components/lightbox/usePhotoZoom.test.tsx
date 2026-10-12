/**
 * The lightbox's own zoom. On a phone the photo used to let the browser zoom
 * the whole page instead, which left the toolbar off-screen behind the
 * modal's scroll lock; a pinch that did reach the photo compounded its scale
 * on every move, and a pan swiped to the next photo.
 */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { MediaDisplay } from "./MediaDisplay";
import { BUTTON_ZOOM, clampPan, DOUBLE_TAP_ZOOM, MAX_ZOOM, NO_ZOOM, usePhotoZoom, zoomAround } from "./usePhotoZoom";

vi.mock("../../api_client/apiClient", () => ({ serverAddress: "" }));

beforeAll(() => {
  // @ts-ignore
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  // jsdom has pointer events but no pointer capture, which the gestures use.
  Element.prototype.setPointerCapture ??= () => {};
  Element.prototype.releasePointerCapture ??= () => {};
  Element.prototype.hasPointerCapture ??= () => false;
});

const roots: ReturnType<typeof createRoot>[] = [];
afterEach(async () => {
  await act(async () => roots.splice(0).forEach(root => root.unmount()));
  document.body.innerHTML = "";
});

describe("zoomAround", () => {
  it("keeps the photo point under the fingers where it is", () => {
    const origin = { x: 100, y: -40 };
    const start = { scale: 1.5, x: 20, y: 10 };
    const next = zoomAround(start, 3, origin);
    // The photo point under `origin`, before and after.
    const before = { x: (origin.x - start.x) / start.scale, y: (origin.y - start.y) / start.scale };
    const after = { x: (origin.x - next.x) / next.scale, y: (origin.y - next.y) / next.scale };
    expect(next.scale).toBe(3);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  it("zooms into the middle when the origin is the middle", () => {
    expect(zoomAround(NO_ZOOM, 2, { x: 0, y: 0 })).toEqual({ scale: 2, x: 0, y: 0 });
  });
});

describe("clampPan", () => {
  const surface = { width: 400, height: 800 };
  const media = { width: 400, height: 300 };

  it("lets the photo pan up to its own edges and no further", () => {
    // 800 wide at 2x: 200px either way. 600 tall still fits in 800: centered.
    expect(clampPan({ scale: 2, x: 500, y: 90 }, surface, media)).toEqual({ scale: 2, x: 200, y: 0 });
    expect(clampPan({ scale: 2, x: -500, y: -90 }, surface, media)).toEqual({ scale: 2, x: -200, y: 0 });
  });

  it("keeps the scale between no zoom and the maximum", () => {
    expect(clampPan({ scale: 0.5, x: 30, y: 30 }, surface, media)).toEqual({ scale: 1, x: 0, y: 0 });
    expect(clampPan({ scale: 50, x: 0, y: 0 }, surface, media).scale).toBe(MAX_ZOOM);
  });
});

type ZoomApi = ReturnType<typeof usePhotoZoom>;

async function renderZoom(resetKey = "a") {
  const state: { current?: ZoomApi } = {};
  function Probe({ photo }: { photo: string }) {
    const zoom = usePhotoZoom({ enabled: true, resetKey: photo });
    state.current = zoom;
    return (
      <div ref={zoom.surfaceRef} data-testid="surface">
        <img alt="" />
      </div>
    );
  }
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  await act(async () => root.render(<Probe photo={resetKey} />));
  const rerender = (photo: string) => act(async () => root.render(<Probe photo={photo} />));
  return { state, container, rerender };
}

describe("usePhotoZoom", () => {
  it("toggles between no zoom and the button zoom", async () => {
    const { state } = await renderZoom();
    expect(state.current!.isZoomed).toBe(false);
    await act(async () => state.current!.toggleZoom());
    expect(state.current!.zoom.scale).toBe(BUTTON_ZOOM);
    expect(state.current!.isZoomed).toBe(true);
    await act(async () => state.current!.toggleZoom());
    expect(state.current!.zoom).toEqual(NO_ZOOM);
  });

  it("starts over on another photo", async () => {
    const { state, rerender } = await renderZoom("a");
    await act(async () => state.current!.toggleZoom());
    await rerender("b");
    expect(state.current!.zoom).toEqual(NO_ZOOM);
  });

  it("zooms in on a double tap and back out on the next", async () => {
    const { state, container } = await renderZoom();
    const img = container.querySelector("img")!;
    const tap = async () => {
      await act(async () => {
        const init = {
          bubbles: true,
          pointerId: 1,
          pointerType: "touch",
          button: 0,
          buttons: 1,
          clientX: 10,
          clientY: 10,
        };
        img.dispatchEvent(new PointerEvent("pointerdown", init));
        img.dispatchEvent(new PointerEvent("pointerup", { ...init, buttons: 0 }));
      });
    };
    await tap();
    expect(state.current!.isZoomed).toBe(false);
    await tap();
    expect(state.current!.zoom.scale).toBe(DOUBLE_TAP_ZOOM);
    await tap();
    await tap();
    expect(state.current!.zoom).toEqual(NO_ZOOM);
  });
});

describe("MediaDisplay as the zoom surface", () => {
  async function renderPhoto(props: Partial<React.ComponentProps<typeof MediaDisplay>>) {
    const container = document.createElement("div");
    const root = createRoot(container);
    roots.push(root);
    await act(async () =>
      root.render(
        <MediaDisplay
          id="abc"
          image_hash="abc"
          isMainContent
          type="photo"
          faceLocation={null}
          handleDragStart={() => {}}
          {...props}
        />
      )
    );
    return container;
  }

  it("keeps the browser from zooming the page over the photo, and draws the zoom", async () => {
    const ref = React.createRef<HTMLDivElement>();
    const container = await renderPhoto({ surfaceRef: ref, zoom: { scale: 2, x: 15, y: -5 }, gesturing: true });
    expect(ref.current).toBe(container.firstElementChild);
    expect(ref.current!.style.touchAction).toBe("none");
    const img = container.querySelector("img")!;
    expect(img.style.transform).toBe("translate(15px, -5px) scale(2) rotate(0deg)");
    // Mid-gesture the photo follows the fingers instead of easing after them.
    expect(img.style.transition).toBe("none");
  });

  it("leaves touch alone where there is no zoom (the photo page)", async () => {
    const container = await renderPhoto({});
    expect((container.firstElementChild as HTMLElement).style.touchAction).toBe("");
  });
});
