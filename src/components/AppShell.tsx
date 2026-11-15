import { Sidebar, MobileHeader, MobileNav } from "./Sidebar";
import { PocBanner } from "./PocBanner";

interface AppShellProps {
  children: React.ReactNode;
}

/**
 * App-Shell mit responsivem Layout:
 * - Oben: PoC-Hinweis-Banner (immer sichtbar)
 * - Desktop (≥md, 768px+): linke Sidebar (220px) + scrollbarer Content
 * - Mobile (<md): Top-Header + Bottom-Nav + scrollbarer Content
 *
 * Höhe: h-dvh (dynamic viewport height) statt h-screen, damit auf iOS Safari
 * die Bottom-Nav nicht unter der ein- und ausfahrenden URL-Leiste verschwindet.
 * Auf Desktop verhält sich h-dvh wie h-screen.
 *
 * Wird von allen authentifizierten Screens verwendet
 * (apply, history, profile, result, generating, cv).
 */
export function AppShell({ children }: AppShellProps) {
  return (
    <div className="flex flex-col h-screen h-dvh overflow-hidden">
      {/* PoC-Banner — über allem */}
      <PocBanner />

      {/* Sidebar + Content */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Desktop: linke Sidebar */}
        <Sidebar />

        {/* Mobile + Desktop Content */}
        <div className="flex-1 min-w-0 flex flex-col">
          <MobileHeader />
          <main className="flex-1 min-w-0 overflow-y-auto bg-bg overscroll-contain">
            {children}
          </main>
          <MobileNav />
        </div>
      </div>
    </div>
  );
}
