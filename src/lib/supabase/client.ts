import { createBrowserClient } from "@supabase/ssr";

// Client-seitiger Supabase-Client (für React-Komponenten)
// Verwende diesen in Client-Komponenten ("use client")
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
