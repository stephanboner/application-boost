"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link } from "@/lib/navigation";
import { createClient } from "@/lib/supabase/client";
import { Logo } from "./Logo";

// ── Nav icons (inline SVG) ────────────────────────────────────
export function ApplyIcon({ active, size = 16 }: { active: boolean; size?: number }) {
  const c = active ? "#2D5A3D" : "#7A7468";
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <rect x="2" y="3"  width="8"  height="1.6" rx=".8" fill={c} />
      <rect x="2" y="7"  width="12" height="1.6" rx=".8" fill={c} />
      <rect x="2" y="11" width="6"  height="1.6" rx=".8" fill={c} />
    </svg>
  );
}

export function HistoryIcon({ active, size = 16 }: { active: boolean; size?: number }) {
  const c = active ? "#2D5A3D" : "#7A7468";
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="5.5" stroke={c} strokeWidth="1.6" />
      <path d="M8 5v3.5l2 1.5" stroke={c} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function ProfileIcon({ active, size = 16 }: { active: boolean; size?: number }) {
  const c = active ? "#2D5A3D" : "#7A7468";
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="5.5" r="2.5" stroke={c} strokeWidth="1.6" />
      <path d="M2.5 13.5c0-3 2.5-5 5.5-5s5.5 2 5.5 5" stroke={c} strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

// ── Nav-Items (für Sidebar + MobileNav geteilt) ───────────────
export const NAV_ITEMS = [
  { href: "/apply"   as const, labelKey: "apply", Icon: ApplyIcon },
  { href: "/history" as const, labelKey: "history",   Icon: HistoryIcon },
  { href: "/profile" as const, labelKey: "profile",    Icon: ProfileIcon },
] as const;

function useCurrentEmail() {
  const [email, setEmail] = useState<string | null>(null);
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      setEmail(data.user?.email ?? null);
    });
  }, []);
  return email;
}

function useActive() {
  const pathname = usePathname();
  return (href: string) => pathname.includes(href);
}

// ── Desktop-Sidebar (hidden < md) ────────────────────────────
export function Sidebar() {
  const isActive = useActive();
  const email = useCurrentEmail();
  const t = useTranslations("nav");

  return (
    <aside
      className="hidden md:flex flex-col h-full bg-side border-r border-border flex-shrink-0"
      style={{ width: 220 }}
    >
      <div className="px-5 py-5 border-b border-border-light">
        <Logo size={28} />
      </div>

      <nav className="flex-1 px-3 py-4 flex flex-col gap-0.5">
        {NAV_ITEMS.map(({ href, labelKey, Icon }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-[8px] text-[14px] font-medium transition-colors
                ${active
                  ? "bg-acc-light text-acc shadow-nav font-semibold"
                  : "text-sub hover:bg-border-light hover:text-text"
                }`}
            >
              <Icon active={active} />
              {t(labelKey)}
            </Link>
          );
        })}
      </nav>

      {email && (
        <div className="px-3 pb-4">
          <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-[8px] bg-border-light">
            <div className="w-8 h-8 rounded-full bg-acc-mid flex items-center justify-center text-acc text-[13px] font-semibold flex-shrink-0">
              {email[0].toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-[12px] font-medium text-text truncate leading-tight">
                {email.split("@")[0]}
              </p>
              <p className="text-[11px] text-sub2 truncate leading-tight">
                {email}
              </p>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}

// ── Mobile Top-Header (slim, < md) ───────────────────────────
export function MobileHeader() {
  const email = useCurrentEmail();
  return (
    <header className="md:hidden flex items-center justify-between px-4 py-3 bg-side border-b border-border flex-shrink-0">
      <Logo size={24} />
      {email && (
        <div className="w-8 h-8 rounded-full bg-acc-mid flex items-center justify-center text-acc text-[13px] font-semibold">
          {email[0].toUpperCase()}
        </div>
      )}
    </header>
  );
}

// ── Mobile Bottom-Nav (< md) ─────────────────────────────────
export function MobileNav() {
  const isActive = useActive();
  const t = useTranslations("nav");
  return (
    <nav
      className="md:hidden flex items-stretch border-t border-border bg-side flex-shrink-0"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {NAV_ITEMS.map(({ href, labelKey, Icon }) => {
        const active = isActive(href);
        return (
          <Link
            key={href}
            href={href}
            className={`flex-1 flex flex-col items-center justify-center gap-1 py-2.5 text-[11px] font-medium transition-colors
              ${active ? "text-acc font-semibold" : "text-sub"}`}
          >
            <Icon active={active} size={20} />
            {t(labelKey)}
          </Link>
        );
      })}
    </nav>
  );
}
