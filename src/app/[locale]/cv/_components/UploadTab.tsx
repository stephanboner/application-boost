"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { CVProfile } from "@/types";
import { MAX_CV_UPLOAD_BYTES, CV_UPLOAD_TYPES } from "@/lib/upload-limits";

interface Props {
  onImported: (cv: CVProfile) => void;
  onSwitchToManual: () => void;
}

export function UploadTab({ onImported, onSwitchToManual }: Props) {
  const t = useTranslations("cv");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadErrorReference, setUploadErrorReference] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleFileSelect = (file: File) => {
    setUploadErrorReference(null);
    if (file.size > MAX_CV_UPLOAD_BYTES) {
      setSelectedFile(null);
      setUploadError(t("uploadTooLarge"));
      return;
    }
    if (!CV_UPLOAD_TYPES.some((type) => type === file.type)) {
      setSelectedFile(null);
      setUploadError(t("uploadAccept"));
      return;
    }
    setSelectedFile(file);
    setUploadError(null);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  };

  const handleUpload = async () => {
    if (!selectedFile) return;
    setIsUploading(true);
    setUploadError(null);
    setUploadErrorReference(null);
    const formData = new FormData();
    formData.append("file", selectedFile);
    try {
      const res = await fetch("/api/cv/parse-upload", { method: "POST", body: formData });
      const headerId = res.headers.get("X-Request-ID");
      const requestId = headerId && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(headerId) ? headerId : null;
      // Preserve the reference even when a proxy returns HTML instead of JSON.
      setUploadErrorReference(requestId);
      const json = await res.json();
      if (!res.ok) {
        const code = typeof json.code === "string" && /^[A-Z0-9_]{1,80}$/.test(json.code) ? json.code : null;
        setUploadErrorReference([code, requestId].filter(Boolean).join(" · ") || null);
        setUploadError(typeof json.error === "string" ? json.error : t("uploadError"));
        return;
      }
      onImported(json.cv);
      setSelectedFile(null);
      setUploadErrorReference(null);
    } catch {
      setUploadError(t("uploadError"));
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="card">
      {/* Header */}
      <div className="text-center mb-5">
        <div
          className="font-serif font-light text-[48px] leading-none mb-3"
          style={{ color: "#C4DAC8" }}
        >
          ✦
        </div>
        <h2 className="font-serif font-semibold text-[18px] text-text mb-1">
          {t("uploadTitle")}
        </h2>
        <p className="text-[13px] text-sub">{t("uploadDesc")}</p>
        <p className="text-[12px] text-sub2 mt-1">{t("uploadAccept")}</p>
      </div>

      {/* Drop zone */}
      <div
        className={`border border-dashed rounded-card p-8 mb-4 text-center cursor-pointer transition-colors
          ${isDragging
            ? "border-acc bg-acc-light"
            : "border-border hover:border-acc-mid hover:bg-bg"}
          ${uploadError ? "border-s-err-border bg-red-50" : ""}`}
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
      >
        {selectedFile ? (
          <p className="text-[14px] font-medium text-text">📎 {selectedFile.name}</p>
        ) : (
          <p className="text-[13px] text-sub">{t("uploadDropHint")}</p>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.docx"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); }}
        />
      </div>

      {uploadError && (
        <div role="alert" className="text-[13px] text-s-err-text text-center mb-3">
          <p>{uploadError}</p>
          {uploadErrorReference && (
            <p className="text-[11px] mt-1 break-words">
              {t("uploadErrorReference")}: <span className="font-mono">{uploadErrorReference}</span>
            </p>
          )}
        </div>
      )}

      <div className="space-y-2">
        {isUploading ? (
          <div className="btn-primary w-full justify-center opacity-70 pointer-events-none">
            ⏳ {t("uploadProcessing")}
          </div>
        ) : selectedFile ? (
          <button className="btn-primary w-full" onClick={handleUpload}>
            🔍 {t("uploadAnalyze")}
          </button>
        ) : null}
        <button className="btn-ghost w-full" onClick={onSwitchToManual}>
          ✏️ {t("manualTab")}
        </button>
      </div>
    </div>
  );
}

