import { useMantineTheme } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { Notifications } from "@mantine/notifications";
import React from "react";

// Where toasts go and how they behave, chosen around the lightbox, where
// tagging happens:
//
// * not bottom-right: the Details panel, with Tags near its bottom, is on the
//   right. On a phone that panel fills the bottom of the screen, so toasts go
//   to the top there.
// * 2 seconds: they confirm what the screen already shows.
// * clicks pass through: a toast never blocks what is under it, and since the
//   pointer never "enters" it, Mantine's pause-on-hover cannot hold it on
//   screen while the mouse is over the tag box. A toast with a button opts back
//   in with INTERACTIVE_TOAST_STYLE.
export function AppNotifications() {
  const theme = useMantineTheme();
  const phone = useMediaQuery(`(max-width: ${theme.breakpoints.sm})`);
  return (
    <Notifications
      autoClose={2000}
      zIndex={1001}
      position={phone ? "top-center" : "bottom-left"}
      styles={{ notification: { pointerEvents: "none" } }}
    />
  );
}
