"use client";

import { useEffect, useRef, useState } from "react";

interface EditableRecipientProps {
  /** Aktuelle Empfänger-Zeilen (z.B. ["Acme AG", "Hauptstrasse 1", "7000 Chur"]) */
  lines: string[];
  /** Wird aufgerufen wenn der User die Bearbeitung beendet (Blur oder Enter).
   *  Liefert den rohen Multi-Line-String zurück. */
  onSave: (raw: string) => void;
  /** Wenn keine Zeilen vorhanden — Platzhalter-Text */
  emptyPlaceholder: string;
  ariaLabel: string;
  editHint: string;
  disabled?: boolean;
}

/**
 * Click-to-edit Empfänger-Block.
 * - Anzeige: render lines as <p>
 * - Click → textarea mit raw multi-line content
 * - Blur/Enter (ohne Shift) → save + back to display
 */
export function EditableRecipient({
  lines,
  onSave,
  emptyPlaceholder,
  ariaLabel,
  editHint,
  disabled,
}: EditableRecipientProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(lines.join("\n"));
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!editing) setDraft(lines.join("\n"));
  }, [lines, editing]);

  // Auto-focus + caret ans Ende setzen beim Edit-Start
  useEffect(() => {
    if (editing && ref.current) {
      ref.current.focus();
      ref.current.setSelectionRange(draft.length, draft.length);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  const commit = () => {
    setEditing(false);
    onSave(draft.trim());
  };

  if (editing) {
    return (
      <textarea
        ref={ref}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            commit();
          }
          if (e.key === "Escape") {
            setEditing(false);
            setDraft(lines.join("\n"));
          }
        }}
        rows={Math.max(draft.split("\n").length, 2)}
        className="w-full bg-acc-light/30 border border-acc-mid rounded-btn px-2 py-1
                   text-[12px] text-text font-sans leading-[1.5] outline-none resize-none"
        placeholder={emptyPlaceholder}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => !disabled && setEditing(true)}
      disabled={disabled}
      className="w-full text-left rounded-btn px-2 py-1 -mx-2 -my-1
                 hover:bg-acc-light/40 transition-colors group
                 disabled:hover:bg-transparent"
      aria-label={ariaLabel}
    >
      {lines.length > 0 ? (
        <div className="leading-[1.5]">
          {lines.map((line, i) => (
            <p key={i} className="text-[12px] text-text">
              {line}
            </p>
          ))}
        </div>
      ) : (
        <p className="text-[11px] text-sub2 italic">{emptyPlaceholder}</p>
      )}
      <span className="opacity-0 group-hover:opacity-100 text-[10px] text-acc transition-opacity">
        ✎ {editHint}
      </span>
    </button>
  );
}
