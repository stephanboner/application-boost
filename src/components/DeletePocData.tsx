"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/lib/navigation";
import { useApplicationStore } from "@/store/application";

export function DeletePocData() {
  const t = useTranslations("profile");
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const [done, setDone] = useState(false);

  const handleDelete = async () => {
    if (!window.confirm(t("deleteDataConfirm"))) return;
    setPending(true);
    setError(false);
    setDone(false);
    try {
      const response = await fetch("/api/profile/data", { method: "DELETE" });
      if (!response.ok) throw new Error("Delete failed");
      useApplicationStore.getState().reset();
      useApplicationStore.persist.clearStorage();
      setDone(true);
      router.refresh();
    } catch { setError(true); }
    finally { setPending(false); }
  };
  return <div className="card space-y-3">
    <p className="section-label">{t("deleteData")}</p>
    <p className="text-[13px] text-sub">{t("deleteDescription")}</p>
    <button className="btn-secondary" onClick={handleDelete} disabled={pending}>{t("deleteData")}</button>
    {error && <p role="alert" className="text-[13px] text-s-err-text">{t("deleteError")}</p>}
    {done && <p role="status" className="text-[13px] text-acc">{t("deleteSuccess")}</p>}
  </div>;
}
