import type { CSSProperties } from "react";

// Toasts let clicks through to what lies beneath (see AppNotifications), so a
// toast that holds a button, like an Undo, has to take them back.
export const INTERACTIVE_TOAST_STYLE: CSSProperties = { pointerEvents: "auto" };
