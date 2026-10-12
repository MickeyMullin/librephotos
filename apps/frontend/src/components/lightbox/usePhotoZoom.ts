import { useGesture } from "@use-gesture/react";
import { useCallback, useEffect, useRef, useState } from "react";

export const MAX_ZOOM = 5;
// The toolbar button and Z zoom into the middle; a double tap or double click
// zooms into the spot under the finger, a little further.
export const BUTTON_ZOOM = 2;
export const DOUBLE_TAP_ZOOM = 2.5;
const DOUBLE_TAP_MS = 300;
const DOUBLE_TAP_DISTANCE = 40;

/** `x`/`y` move the photo's center away from the surface's, in CSS pixels. */
export type Zoom = { scale: number; x: number; y: number };
export const NO_ZOOM: Zoom = { scale: 1, x: 0, y: 0 };

type Size = { width: number; height: number };

/**
 * Scale to `scale` while keeping the photo point under `origin` (measured from
 * the surface's center) where it is. The photo is drawn as
 * `translate(x, y) scale(s)` around its own center, which sits at the
 * surface's center, so the point under `origin` is `(origin - offset) / s`.
 */
export function zoomAround(zoom: Zoom, scale: number, origin: { x: number; y: number }): Zoom {
  const ratio = scale / zoom.scale;
  return {
    scale,
    x: origin.x - (origin.x - zoom.x) * ratio,
    y: origin.y - (origin.y - zoom.y) * ratio,
  };
}

/**
 * Keep the zoomed photo covering the surface: it can be panned up to its own
 * edges but no further, and a side that is narrower than the surface stays
 * centered. Without this a pan could drag the photo out of view entirely.
 */
export function clampPan(zoom: Zoom, surface: Size, media: Size): Zoom {
  const scale = Math.min(Math.max(zoom.scale, 1), MAX_ZOOM);
  const maxX = Math.max(0, (media.width * scale - surface.width) / 2);
  const maxY = Math.max(0, (media.height * scale - surface.height) / 2);
  return { scale, x: within(zoom.x, maxX), y: within(zoom.y, maxY) };
}

function within(value: number, limit: number) {
  return limit === 0 ? 0 : Math.min(Math.max(value, -limit), limit);
}

type Options = {
  /** Gestures stop while the photo is a drawing surface (marking a face). */
  enabled: boolean;
  /** The zoom resets whenever this changes (another photo). */
  resetKey: unknown;
};

/**
 * The lightbox's own zoom: pinch, double tap (or double click) and pan with
 * one finger once zoomed, plus ctrl+wheel, which is how trackpads report a
 * pinch. Attach `surfaceRef` to the element that holds the photo.
 *
 * On a phone the surface must not let the browser zoom the page instead: a
 * zoomed page leaves the lightbox's toolbar off-screen, and the modal's
 * scroll lock means it cannot be panned back into view. The surface sets
 * `touch-action: none` for that (see MediaDisplay), and iOS's own gesture
 * events are cancelled here as well.
 */
export function usePhotoZoom({ enabled, resetKey }: Options) {
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const [zoom, setZoom] = useState<Zoom>(NO_ZOOM);
  const [gesturing, setGesturing] = useState(false);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const lastTap = useRef<{ time: number; x: number; y: number } | null>(null);

  useEffect(() => {
    setZoom(NO_ZOOM);
    lastTap.current = null;
  }, [resetKey]);

  // The photo's untransformed size and the point the transform turns around.
  const measure = useCallback(() => {
    const surface = surfaceRef.current;
    const media = surface?.querySelector("img");
    if (!surface || !media) return null;
    const rect = surface.getBoundingClientRect();
    return {
      center: { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },
      surface: { width: rect.width, height: rect.height },
      media: { width: media.offsetWidth, height: media.offsetHeight },
    };
  }, []);

  const settle = useCallback(
    (next: Zoom) => {
      if (next.scale <= 1.01) return NO_ZOOM;
      const box = measure();
      return box ? clampPan(next, box.surface, box.media) : next;
    },
    [measure]
  );

  const zoomTo = useCallback(
    (scale: number, clientPoint?: { x: number; y: number }) => {
      const box = measure();
      const origin =
        box && clientPoint ? { x: clientPoint.x - box.center.x, y: clientPoint.y - box.center.y } : { x: 0, y: 0 };
      setZoom(settle(zoomAround(NO_ZOOM, scale, origin)));
    },
    [measure, settle]
  );

  const toggleZoom = useCallback(() => {
    if (zoomRef.current.scale > 1) setZoom(NO_ZOOM);
    else zoomTo(BUTTON_ZOOM);
  }, [zoomTo]);

  const handleTap = useCallback(
    (x: number, y: number, timeStamp: number) => {
      const previous = lastTap.current;
      if (
        previous &&
        timeStamp - previous.time < DOUBLE_TAP_MS &&
        Math.hypot(x - previous.x, y - previous.y) < DOUBLE_TAP_DISTANCE
      ) {
        lastTap.current = null;
        if (zoomRef.current.scale > 1) setZoom(NO_ZOOM);
        else zoomTo(DOUBLE_TAP_ZOOM, { x, y });
        return;
      }
      lastTap.current = { time: timeStamp, x, y };
    },
    [zoomTo]
  );

  useGesture(
    {
      onPinch: ({ first, last, active, origin: [ox, oy], offset: [scale], memo }) => {
        setGesturing(active);
        const box = measure();
        if (!box) return memo;
        const origin = { x: ox - box.center.x, y: oy - box.center.y };
        // The photo point under the fingers when the pinch began stays under
        // them, which also makes moving both fingers pan.
        const anchor =
          first || !memo
            ? {
                x: (origin.x - zoomRef.current.x) / zoomRef.current.scale,
                y: (origin.y - zoomRef.current.y) / zoomRef.current.scale,
              }
            : memo;
        const next = { scale, x: origin.x - anchor.x * scale, y: origin.y - anchor.y * scale };
        setZoom(last ? settle(next) : next);
        return anchor;
      },
      onDrag: ({ first, last, active, tap, pinching, cancel, movement: [mx, my], xy: [x, y], event, memo }) => {
        if (pinching) {
          cancel();
          return memo;
        }
        if (tap) {
          // Only the photo itself: a double click in live text selects a word.
          if (event.target instanceof HTMLImageElement) handleTap(x, y, event.timeStamp);
          return memo;
        }
        // Unzoomed, a one-finger drag belongs to the carousel (next/previous).
        if (zoomRef.current.scale <= 1) return memo;
        setGesturing(active);
        const start = first || !memo ? { x: zoomRef.current.x, y: zoomRef.current.y } : memo;
        const box = measure();
        const moved = { scale: zoomRef.current.scale, x: start.x + mx, y: start.y + my };
        setZoom(box ? clampPan(moved, box.surface, box.media) : moved);
        if (last) setGesturing(false);
        return start;
      },
    },
    {
      target: surfaceRef,
      enabled,
      eventOptions: { passive: false },
      drag: { filterTaps: true },
      pinch: {
        from: () => [zoomRef.current.scale, 0],
        scaleBounds: { min: 1, max: MAX_ZOOM },
        rubberband: true,
      },
    }
  );

  // iOS reports a pinch as its own gesture events too; cancelling them keeps
  // the page from zooming even where touch-action is not honored.
  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface || !enabled) return undefined;
    const prevent = (event: Event) => event.preventDefault();
    const preventMultiTouch = (event: TouchEvent) => {
      if (event.touches.length > 1) event.preventDefault();
    };
    surface.addEventListener("gesturestart", prevent);
    surface.addEventListener("gesturechange", prevent);
    surface.addEventListener("touchmove", preventMultiTouch, { passive: false });
    return () => {
      surface.removeEventListener("gesturestart", prevent);
      surface.removeEventListener("gesturechange", prevent);
      surface.removeEventListener("touchmove", preventMultiTouch);
    };
  });

  return {
    surfaceRef,
    zoom,
    isZoomed: zoom.scale > 1,
    gesturing,
    toggleZoom,
  };
}
