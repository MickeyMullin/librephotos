import { useFullscreen } from "@mantine/hooks";
import { useCallback, useState } from "react";

// Whether the browser lets a page put an element in fullscreen. iPhone WebKit,
// which every iOS browser runs on (Firefox and Chrome included), does not:
// only a <video> can go fullscreen there, so requestFullscreen is missing and
// the button used to do nothing at all.
export function canUseNativeFullscreen(doc: Document = document) {
  const prefixed = doc as Document & { webkitFullscreenEnabled?: boolean };
  return !!(doc.fullscreenEnabled || prefixed.webkitFullscreenEnabled);
}

// The lightbox's fullscreen toggle. Where the browser allows it this is the
// real Fullscreen API; elsewhere it falls back to an "immersive" mode inside
// the page: black background, no toolbar, thumbnails or sidebar, just the
// photo and a button to leave. The browser's own address bar cannot be hidden
// from a page.
export function useLightboxFullscreen() {
  const native = useFullscreen();
  const [supported] = useState(() => canUseNativeFullscreen());
  const [immersive, setImmersive] = useState(false);
  const { toggle: toggleNative, fullscreen: nativeFullscreen } = native;

  const toggle = useCallback(() => {
    if (supported) {
      toggleNative();
    } else {
      setImmersive(value => !value);
    }
  }, [supported, toggleNative]);

  const exit = useCallback(() => {
    if (!supported) {
      setImmersive(false);
    } else if (nativeFullscreen) {
      document.exitFullscreen?.();
    }
  }, [supported, nativeFullscreen]);

  return {
    isFullscreen: supported ? nativeFullscreen : immersive,
    // True only for the in-page fallback, which hides the lightbox's chrome.
    immersive: !supported && immersive,
    toggle,
    exit,
  };
}
