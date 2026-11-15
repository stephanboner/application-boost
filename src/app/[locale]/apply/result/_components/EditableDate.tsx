"use client";

import { useEffect, useRef, useState } from "react";

interface EditableDateProps {
  value: string;
  ariaLabel: string;
  onSave: (value: string) => void;
  disabled?: boolean;
}

/**
 * Click-to-edit Datum-Zeile (z.B. "Chur, 21. Mai 2026").
 * Plain-text Input — der User kann beliebige Strings (lokalisiertes Datum,
 * Ortsangabe) eingeben. Kein Date-Picker, weil der Brief jede Sprache mit
 * eigenem Datumsformat schreiben muss.
 */
export function EditableDate({ value, ariaLabel, onSave, disabled }: EditableDateProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  useEffect(() => {
    if (editing && ref.current) {
      ref.current.focus();
      ref.current.select();
    }
  }, [editing]);

  const commit = () => {
    setEditing(false);
    onSave(draft.trim() || value);
  };

  if (editing) {
    return (
      <input
        ref={ref}
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          }
          if (e.key === "Escape") {
            setEditing(false);
            setDraft(value);
          }
        }}
        className="bg-acc-light/30 border border-acc-mid rounded-btn px-2 py-0.5
                   text-[12px] text-text text-right font-sans outline-none w-full"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => !disabled && setEditing(true)}
      disabled={disabled}
      className="text-right text-[12px] text-sub rounded-btn px-2 py-0.5 -mx-2 -my-0.5
                 hover:bg-acc-light/40 transition-colors w-full group
                 disabled:hover:bg-transparent"
      aria-label={ariaLabel}
    >
      {value}
      <span className="ml-1 opacity-0 group-hover:opacity-100 text-acc transition-opacity">
        ✎
      </span>
    </button>
  );
}
