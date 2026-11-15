"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { LetterLanguage, LetterTone } from "@/types";

type SavePayload = { letter: string; tone: LetterTone; language: LetterLanguage };
export type SaveState = "idle" | "saving" | "saved" | "error";

/** Keep writes in order and flush the last edit when leaving this document. */
export function useLetterAutosave(applicationId: string | null) {
  const [saveStatus, setSaveStatus] = useState<SaveState>("idle");
  const [saveMissing, setSaveMissing] = useState(false);
  const active = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const statusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<(() => void) | null>(null);
  const latestPayload = useRef<SavePayload | null>(null);
  const sequence = useRef(0);
  const queue = useRef(Promise.resolve());

  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      if (timer.current) clearTimeout(timer.current);
      if (statusTimer.current) clearTimeout(statusTimer.current);
      // The callback captures this document's ID, never the next one's.
      pending.current?.();
      pending.current = null;
    };
  }, []);

  const save = useCallback((payload: SavePayload) => {
    if (timer.current) clearTimeout(timer.current);
    if (statusTimer.current) clearTimeout(statusTimer.current);
    pending.current = null;
    latestPayload.current = payload;
    const requestSequence = ++sequence.current;
    if (active.current) {
      setSaveStatus("saving");
      setSaveMissing(false);
    }

    queue.current = queue.current.then(async () => {
      try {
        if (!applicationId) throw new Error("NOT_FOUND");
        const response = await fetch(`/api/history?id=${encodeURIComponent(applicationId)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (response.status === 404) throw new Error("NOT_FOUND");
        if (!response.ok || (await response.json()).success !== true) {
          throw new Error("SAVE_FAILED");
        }
        if (active.current && sequence.current === requestSequence) {
          setSaveStatus("saved");
          statusTimer.current = setTimeout(() => setSaveStatus("idle"), 1500);
        }
      } catch (error) {
        if (active.current && sequence.current === requestSequence) {
          setSaveMissing(error instanceof Error && error.message === "NOT_FOUND");
          setSaveStatus("error");
        }
      }
    });
  }, [applicationId]);

  const scheduleSave = useCallback((payload: SavePayload) => {
    if (timer.current) clearTimeout(timer.current);
    if (statusTimer.current) clearTimeout(statusTimer.current);
    // A previous response must not claim this newer edit has been saved.
    sequence.current++;
    latestPayload.current = payload;
    setSaveStatus("saving");
    setSaveMissing(false);
    pending.current = () => save(payload);
    timer.current = setTimeout(() => {
      pending.current?.();
    }, 1500);
  }, [save]);

  const retrySave = useCallback(() => {
    if (latestPayload.current) save(latestPayload.current);
  }, [save]);

  return { saveStatus, saveMissing, save, scheduleSave, retrySave };
}
