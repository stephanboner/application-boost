"use client";

import { useEffect, useRef, forwardRef } from "react";

interface AutoGrowTextareaProps
  extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "ref"> {
  /** Minimale Höhe in Pixel — bevor der Inhalt darüber wächst */
  minHeight?: number;
}

/**
 * Textarea, die ihre Höhe automatisch an den Inhalt anpasst.
 * Kein interner Scrollbar, kein Scroll-in-Scroll.
 *
 * Implementierung:
 * - Setzt height auf 'auto' (collapse) → liest scrollHeight → setzt auf scrollHeight px
 * - Triggert bei value-Änderung + bei Window-Resize (Tablet-Rotation etc.)
 */
export const AutoGrowTextarea = forwardRef<HTMLTextAreaElement, AutoGrowTextareaProps>(
  function AutoGrowTextarea({ value, minHeight = 0, style, onChange, ...rest }, externalRef) {
    const internalRef = useRef<HTMLTextAreaElement>(null);
    const ref = (externalRef as React.RefObject<HTMLTextAreaElement>) ?? internalRef;

    const resize = () => {
      const el = ref.current;
      if (!el) return;
      // Auf 'auto' setzen → Browser collabsen die Höhe auf den Inhalt
      el.style.height = "auto";
      const next = Math.max(el.scrollHeight, minHeight);
      el.style.height = `${next}px`;
    };

    // Resize bei Mount + bei value-Änderung
    useEffect(() => {
      resize();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value]);

    // Resize bei Window-Resize (Wrap-Verhalten ändert sich mit Breite)
    useEffect(() => {
      const onResize = () => resize();
      window.addEventListener("resize", onResize);
      return () => window.removeEventListener("resize", onResize);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
      <textarea
        {...rest}
        ref={ref}
        value={value}
        onChange={(e) => {
          onChange?.(e);
          resize();
        }}
        style={{
          ...style,
          // overflow:hidden verhindert vertikale Scrollbar (eigentlich nie nötig
          // weil wir auto-resizen, aber als Sicherheit gegen Race-Conditions)
          overflow: "hidden",
          resize: "none",
        }}
      />
    );
  }
);
