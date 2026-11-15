"use client";

import { useId, useState, useTransition, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";

/** Request a fresh link without disclosing whether an account exists. */
export function PasswordResetRequestForm() {
  const t = useTranslations("auth");
  const emailId = useId();
  const [isPending, startTransition] = useTransition();
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const email = String(new FormData(form).get("email") ?? "").trim();
    setError("");
    setSent(false);
    startTransition(async () => {
      try {
        const locale = window.location.pathname.split("/")[1] || "de";
        const { error } = await createClient().auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/${locale}/auth/reset-password`,
        });
        if (error) {
          setError(t(error.status === 429 ? "resetRateLimit" : "resetRequestError"));
          return;
        }
        setSent(true);
        form.reset();
      } catch { setError(t("resetRequestError")); }
    });
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      {sent && <p role="status" className="badge-green rounded-btn p-3 text-[13px]">{t("forgotSuccess")}</p>}
      <div>
        <label htmlFor={emailId} className="field-label">{t("email")}</label>
        <input id={emailId} name="email" type="email" required maxLength={254}
          autoComplete="email" className="field" placeholder={t("emailPlaceholder")} disabled={isPending} />
      </div>
      {error && <p role="alert" className="text-[13px] text-s-err-text">{error}</p>}
      <button type="submit" className="btn-primary w-full" disabled={isPending}>
        {isPending ? "…" : t("forgotSubmit")}
      </button>
      <p className="text-[12px] text-sub leading-relaxed">{t("resetBrowserHint")}</p>
    </form>
  );
}
