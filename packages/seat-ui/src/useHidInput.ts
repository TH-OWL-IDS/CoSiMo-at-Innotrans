import { useEffect, useRef } from "react";

/**
 * Input from the ESP32 next to the panel, which pairs with the iPad as a
 * Bluetooth HID keyboard (WKWebView sees plain key events):
 *
 *  - "s" — the physical talk button. Key-down on press, key-up on release,
 *    so it carries real hold-to-talk semantics (auto-repeats are ignored).
 *  - "i" — the physical info button (single press).
 *  - NFC — the reader types a framed sequence, scanner-style:
 *    "[" (or "#") + chip id + Enter (or "]"). While a frame is open every key
 *    is swallowed, so ids containing s/i can't trigger the buttons. A stalled
 *    frame resets after 2 s — generous enough to hand-type a scan in dev
 *    ("#ANNA1⏎"), still instant against a real reader.
 *
 * Shared by the iPad app and the browser seat, so a keyboard in the browser
 * drives exactly what the stand's hardware sends: hold "s", press "i",
 * type "#ANNA1⏎".
 */
export function useHidInput({
  enabled,
  onTalkStart,
  onTalkEnd,
  onInfo,
  onTag,
}: {
  enabled: boolean;
  onTalkStart: () => void;
  onTalkEnd: () => void;
  onInfo: () => void;
  onTag: (tagId: string) => void;
}): void {
  const frame = useRef<string | null>(null);
  const frameTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const talking = useRef(false);

  // Keep the handlers in a ref so the listeners bind once.
  const handlers = useRef({ enabled, onTalkStart, onTalkEnd, onInfo, onTag });
  handlers.current = { enabled, onTalkStart, onTalkEnd, onInfo, onTag };

  useEffect(() => {
    const resetFrame = () => {
      frame.current = null;
      if (frameTimer.current) clearTimeout(frameTimer.current);
      frameTimer.current = null;
    };
    const bumpFrameTimeout = () => {
      if (frameTimer.current) clearTimeout(frameTimer.current);
      frameTimer.current = setTimeout(resetFrame, 2000);
    };

    const down = (e: KeyboardEvent) => {
      const h = handlers.current;
      if (!h.enabled) return;
      // Never interfere with real form fields (operator screen).
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;

      // NFC frame in progress → swallow everything into the buffer.
      if (frame.current !== null) {
        e.preventDefault();
        if (e.key === "Enter" || e.key === "]") {
          const tag = frame.current;
          resetFrame();
          if (tag) h.onTag(tag);
        } else if (e.key.length === 1) {
          frame.current += e.key;
          bumpFrameTimeout();
        }
        return;
      }

      if (e.key === "[" || e.key === "#") {
        e.preventDefault();
        frame.current = "";
        bumpFrameTimeout();
        return;
      }
      if (e.key === "s" || e.key === "S") {
        e.preventDefault();
        if (e.repeat || talking.current) return;
        talking.current = true;
        h.onTalkStart();
        return;
      }
      if ((e.key === "i" || e.key === "I") && !e.repeat) {
        e.preventDefault();
        h.onInfo();
      }
    };

    const up = (e: KeyboardEvent) => {
      if ((e.key === "s" || e.key === "S") && talking.current) {
        talking.current = false;
        handlers.current.onTalkEnd();
      }
    };

    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      resetFrame();
    };
  }, []);
}
