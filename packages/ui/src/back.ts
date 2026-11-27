// Android Back for in-page layers (product page, sheets, dialogs, the admin drawer, non-home tabs).
// Open layers form a stack. The Android shell (1.2.3+) asks `window.fayzBack()` first: it closes the top layer and
// returns true; only when nothing is open does the shell use WebView history (store map) or leave the app.
// Older shells never call it, so the stack is harmless there; browsers and the desktop app keep Escape / ✕.
import { useEffect, useRef } from 'react';

type Layer = { close: () => void };
const stack: Layer[] = [];
declare global { interface Window { fayzBack?: () => boolean } }
if (typeof window !== 'undefined') window.fayzBack = () => { const top = stack.at(-1); if (!top) return false; top.close(); return true; };

/** While `active`, the Back key runs `onClose` (for the most recently opened layer only). */
export function useBackClose(active: boolean, onClose: () => void) {
  const closeRef = useRef(onClose); closeRef.current = onClose;
  useEffect(() => {
    if (!active) return;
    const layer: Layer = { close: () => closeRef.current() };
    stack.push(layer);
    return () => { const i = stack.indexOf(layer); if (i >= 0) stack.splice(i, 1); };
  }, [active]);
}
