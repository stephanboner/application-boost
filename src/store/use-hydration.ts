"use client";
import { useSyncExternalStore } from "react";
import { useApplicationStore } from "./application";

function subscribe(listener: () => void) {
  const start = useApplicationStore.persist.onHydrate(listener);
  const finish = useApplicationStore.persist.onFinishHydration(listener);
  return () => { start(); finish(); };
}

// Match the server's empty initial state, then expose the restored tab draft.
// Redirects and paid actions must wait for this transition.
export function useApplicationHydration(): boolean {
  return useSyncExternalStore(subscribe, useApplicationStore.persist.hasHydrated, () => false);
}
