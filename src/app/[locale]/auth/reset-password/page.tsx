"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslations } from "next-intl";
import { useRouter } from "@/lib/navigation";
import { createClient } from "@/lib/supabase/client";
import { Logo } from "@/components/Logo";
import { PocBanner } from "@/components/PocBanner";
import { PasswordResetRequestForm } from "@/components/PasswordResetRequestForm";

// ============================================================
// Passwort-Reset-Page
//
// Flow:
// Await SDK initialization and verify the resulting user before showing the form.
// Explicit callback errors outrank an existing session. Legacy implicit recovery
// links are imported explicitly because the SSR client uses PKCE by default.
// ============================================================

const resetSchema = z
  .object({
    password: z.string().min(8),
    passwordConfirm: z.string(),
  })
  .refine((d) => d.password === d.passwordConfirm, {
    message: "passwordMismatch",
    path: ["passwordConfirm"],
  });

type ResetForm = z.infer<typeof resetSchema>;

export default function ResetPasswordPage() {
  const t = useTranslations("auth");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState("");
  const callbackUrl = useRef<URL | null>(null);
  // 'pending' = wir warten auf das Recovery-Token aus der URL.
  // 'ready'   = Recovery-Session aktiv, Formular wird angezeigt.
  // 'invalid' = Kein gültiger Recovery-Link (z.B. abgelaufen oder direkt aufgerufen).
  // 'success' = Passwort wurde erfolgreich geändert.
  const [state, setState] = useState<"pending" | "ready" | "invalid" | "success">("pending");

  const form = useForm<ResetForm>({ resolver: zodResolver(resetSchema) });

  useEffect(() => {
    const url = callbackUrl.current ?? new URL(window.location.href);
    callbackUrl.current = url;
    const fragment = new URLSearchParams(url.hash.slice(1));
    const clearCallback = () => window.history.replaceState(window.history.state, "", url.pathname);
    if (["error", "error_code", "error_description"].some((key) => url.searchParams.has(key) || fragment.has(key))) {
      clearCallback();
      setState("invalid");
      return;
    }

    const supabase = createClient();
    let active = true;
    let recovered = false;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" && session) recovered = true;
    });

    void (async () => {
      try {
        const { error } = await supabase.auth.initialize();
        const accessToken = fragment.get("access_token");
        const refreshToken = fragment.get("refresh_token");
        if (fragment.get("type") === "recovery" && accessToken && refreshToken) {
          const result = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
          if (result.error) throw result.error;
        } else if (error || (url.searchParams.has("code") && !recovered)) {
          // A code without its browser's verifier must not reuse another session.
          if (active) setState("invalid");
          return;
        }
        const { data, error: userError } = await supabase.auth.getUser();
        if (active) setState(!userError && data.user ? "ready" : "invalid");
      } catch {
        if (active) setState("invalid");
      } finally {
        if (active) clearCallback();
      }
    })();

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (state !== "success") return;
    const timer = setTimeout(() => {
      router.push("/apply");
      router.refresh();
    }, 1500);
    return () => clearTimeout(timer);
  }, [state, router]);

  const onSubmit = (data: ResetForm) => {
    setServerError("");
    startTransition(async () => {
      try {
        const supabase = createClient();
        const { error } = await supabase.auth.updateUser({
          password: data.password,
        });
        if (error) {
          if (error.status === 401 || error.code === "session_not_found") {
            form.reset();
            setState("invalid");
            return;
          }
          setServerError(
            error.message.includes("Password should")
              ? t("errors.passwordTooShort")
              : t("errors.generic")
          );
          return;
        }
        setState("success");
      } catch {
        setServerError(t("errors.networkError"));
      }
    });
  };

  return (
    <div className="min-h-screen min-h-dvh flex flex-col bg-bg">
      <PocBanner />
      <div className="flex-1 flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-[420px]">
        <div className="flex justify-center mb-8">
          <Logo size={30} />
        </div>

        <div className="card p-6">
          <h1 className="font-serif font-semibold text-[22px] text-text mb-2">
            {t("resetTitle")}
          </h1>

          {state === "pending" && (
            <div className="flex items-center gap-3 py-4 text-sub text-[14px]">
              <svg className="animate-spin text-acc" width="18" height="18" viewBox="0 0 18 18" fill="none">
                <circle cx="9" cy="9" r="7" stroke="currentColor" strokeWidth="2" strokeOpacity=".25" />
                <path d="M9 2a7 7 0 0 1 7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              {t("resetVerifying")}
            </div>
          )}

          {state === "invalid" && (
            <>
              <p className="text-[14px] text-sub leading-relaxed mb-5">
                {t("resetInvalid")}
              </p>
              <PasswordResetRequestForm />
              <button
                type="button"
                onClick={() => router.push("/auth")}
                className="btn-ghost w-full mt-3"
              >
                {t("loginTitle")}
              </button>
            </>
          )}

          {state === "success" && (
            <div className="badge-green rounded-[10px] p-4 text-[14px] leading-relaxed">
              ✓ {t("resetSuccess")}
            </div>
          )}

          {state === "ready" && (
            <>
              <p className="text-[13px] text-sub mb-5">{t("resetIntro")}</p>
              <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-4">
                <div>
                  <label htmlFor="reset-password" className="field-label">{t("password")}</label>
                  <input
                    {...form.register("password")}
                    id="reset-password"
                    type="password"
                    className="field"
                    placeholder={t("passwordPlaceholder")}
                    autoComplete="new-password"
                    disabled={isPending}
                  />
                  {form.formState.errors.password && (
                    <p className="field-error">{t("errors.passwordTooShort")}</p>
                  )}
                </div>
                <div>
                  <label htmlFor="reset-password-confirm" className="field-label">{t("passwordConfirm")}</label>
                  <input
                    {...form.register("passwordConfirm")}
                    id="reset-password-confirm"
                    type="password"
                    className="field"
                    placeholder={t("passwordPlaceholder")}
                    autoComplete="new-password"
                    disabled={isPending}
                  />
                  {form.formState.errors.passwordConfirm && (
                    <p className="field-error">{t("errors.passwordMismatch")}</p>
                  )}
                </div>
                {serverError && (
                  <div role="alert" className="text-[13px] text-s-err-text bg-red-50 border border-s-err-border rounded-btn p-3">
                    {serverError}
                  </div>
                )}
                <button type="submit" className="btn-primary w-full" disabled={isPending}>
                  {isPending ? "…" : t("resetSubmit")}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
      </div>
    </div>
  );
}
