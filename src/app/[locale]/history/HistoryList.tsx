"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/lib/navigation";

export interface AppEntry {
  id: string;
  jobTitle: string;
  company: string;
  tone: string;
  language: string;
  wordCount: number | null;
  createdAt: string;
  preview: string;
}

// ── Icons ─────────────────────────────────────────────────────
function ListIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <rect x="3" y="5"  width="9"  height="2" rx="1" fill="#2D5A3D" />
      <rect x="3" y="9"  width="14" height="2" rx="1" fill="#2D5A3D" />
      <rect x="3" y="13" width="7"  height="2" rx="1" fill="#2D5A3D" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M3 4h8M5.5 4V2.5h3V4M4 4l.7 8h4.6L10 4M6 6.5v3M8 6.5v3"
        stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const LANG_COLORS: Record<string, string> = {
  de: "badge-green", fr: "badge-blue", it: "badge-blue",
  en: "badge-blue",  rm: "badge-green", uk: "badge-blue",
};

export function HistoryList({ initialApps, locale }: { initialApps: AppEntry[]; locale: string }) {
  const t = useTranslations("history");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [apps, setApps] = useState(initialApps);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleDelete = async (id: string) => {
    if (deleting) return;
    setDeleting(id);
    setDeleteError(null);
    try {
      const response = await fetch(`/api/history?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Deletion failed");
      const data = await response.json();
      if (data.success !== true) throw new Error("Deletion not confirmed");
      setApps((prev) => prev.filter((a) => a.id !== id));
      setConfirmDeleteId(null);
    } catch {
      setDeleteError(t("deleteError"));
    } finally {
      setDeleting(null);
    }
  };

  if (apps.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div
          className="font-serif font-light text-[60px] leading-none mb-4"
          style={{ color: "#C4DAC8" }}
        >
          ✦
        </div>
        <p className="text-[15px] text-sub mb-6">{t("empty")}</p>
        <button className="btn-primary" onClick={() => router.push("/apply")}>
          {t("emptyAction")}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {deleteError && <p role="alert" className="text-[13px] text-s-err-text">{deleteError}</p>}
      {apps.map((app) => {
        const isDeleting = confirmDeleteId === app.id;
        return (
          <div
            key={app.id}
            className={`card flex items-center gap-3 md:gap-4 py-3 md:py-4 px-4 md:px-5 transition-all
              ${isDeleting ? "border-s-err-border bg-red-50" : "hover:shadow-card-hover"}`}
          >
            {/* Icon */}
            <div className="w-9 h-9 md:w-10 md:h-10 rounded-[9px] bg-acc-light flex items-center justify-center flex-shrink-0">
              <ListIcon />
            </div>

            {/* Content */}
            <button
              type="button"
              onClick={() => !isDeleting && router.push(`/apply/result?id=${app.id}`)}
              className="flex-1 min-w-0 text-left disabled:cursor-default"
              disabled={isDeleting}
            >
              <p className="text-[14px] font-semibold text-text truncate leading-tight">
                {app.jobTitle}
              </p>
              <p className="text-[12px] md:text-[13px] text-sub mt-0.5 truncate">
                {app.company} · {new Date(app.createdAt).toLocaleDateString(locale)}
              </p>
            </button>

            {/* Right side */}
            {isDeleting ? (
              <div className="flex items-center gap-1.5 md:gap-2 flex-shrink-0">
                <span className="hidden md:inline text-[13px] text-s-err-text mr-1">{t("deleteConfirm")}</span>
                <button
                  className="btn-secondary-sm border-s-err-border text-s-err-text"
                  onClick={() => handleDelete(app.id)}
                  disabled={deleting === app.id}
                >
                  {deleting === app.id ? "…" : t("delete")}
                </button>
                <button
                  className="btn-secondary-sm"
                  onClick={() => setConfirmDeleteId(null)}
                >
                  {tCommon("cancel")}
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 md:gap-2 flex-shrink-0">
                {/* Sprach-Badge auf Mobile ausblenden (Platz sparen) */}
                <span className={`hidden sm:inline-flex ${LANG_COLORS[app.language] ?? "badge"}`}>
                  {app.language.toUpperCase()}
                </span>
                <button
                  className="w-8 h-8 flex items-center justify-center rounded-btn text-sub2 hover:text-s-err-text hover:bg-red-50 transition-colors"
                  onClick={() => setConfirmDeleteId(app.id)}
                  aria-label={t("delete")}
                  title={t("delete")}
                >
                  <TrashIcon />
                </button>
                <span className="text-sub2 text-[16px]">›</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
