"use client";

import { useRef } from "react";

/**
 * Focus restoration for controlled Radix dialogs that have no Trigger (WCAG 2.4.3 Focus Order).
 * Radix returns focus to its Trigger on close; without one, focus would fall back to <body>.
 * Spread the result onto DialogContent / AlertDialogContent / SheetContent: the element that had
 * focus when the dialog opened (captured before focus moves in) gets it back on close — unless it
 * no longer exists (e.g. the row was deleted), in which case Radix's default applies.
 */
export function useReturnFocus() {
  const opener = useRef<HTMLElement | null>(null);
  return {
    onOpenAutoFocus: () => {
      opener.current = document.activeElement as HTMLElement | null;
    },
    onCloseAutoFocus: (event: Event) => {
      if (!opener.current?.isConnected) return;
      event.preventDefault();
      opener.current.focus();
    },
  };
}
