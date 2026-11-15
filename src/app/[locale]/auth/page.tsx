"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslations } from "next-intl";
import { useRouter } from "@/lib/navigation";
import { createClient } from "@/lib/supabase/client";
import { Logo } from "@/components/Logo";
import { PocBanner } from "@/components/PocBanner";
import { PasswordResetRequestForm } from "@/components/PasswordResetRequestForm";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

const registerSchema = loginSchema.extend({
  passwordConfirm: z.string(),
}).refine((d) => d.password === d.passwordConfirm, {
  message: "passwordMismatch",
  path: ["passwordConfirm"],
});

type LoginForm = z.infer<typeof loginSchema>;
type RegisterForm = z.infer<typeof registerSchema>;

function mapAuthError(message: string) {
  if (message.includes("Invalid login credentials") || message.includes("invalid_credentials"))
    return "errors.invalidCredentials" as const;
  if (message.includes("email_not_confirmed") || message.includes("Email not confirmed"))
    return "errors.emailNotConfirmed" as const;
  if (message.includes("User already registered") || message.includes("already been registered"))
    return "errors.emailTaken" as const;
  if (message.includes("Password should be"))
    return "errors.passwordTooShort" as const;
  if (message.includes("rate limit") || message.includes("over_email_send_rate_limit"))
    return "errors.rateLimited" as const;
  return "errors.generic" as const;
}

const CHECK_KEYS = ["benefit1", "benefit2", "benefit3"] as const;

type AuthMode = "login" | "register" | "forgot";

export default function AuthPage() {
  const t = useTranslations("auth");
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>("login");
  const [serverError, setServerError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  const loginForm = useForm<LoginForm>({ resolver: zodResolver(loginSchema) });
  const registerForm = useForm<RegisterForm>({ resolver: zodResolver(registerSchema) });

  const handleLogin = (data: LoginForm) => {
    setServerError("");
    setSuccessMessage("");
    startTransition(async () => {
      try {
        const supabase = createClient();
        const { data: authData, error } = await supabase.auth.signInWithPassword({
          email: data.email,
          password: data.password,
        });
        if (error) { setServerError(t(mapAuthError(error.message))); return; }
        if (!authData.session) { setServerError(t("errors.generic")); return; }
        router.push("/apply");
        router.refresh();
      } catch {
        setServerError(t("errors.networkError"));
      }
    });
  };

  const handleRegister = (data: RegisterForm) => {
    setServerError("");
    setSuccessMessage("");
    startTransition(async () => {
      try {
        const supabase = createClient();
        const { data: authData, error } = await supabase.auth.signUp({
          email: data.email,
          password: data.password,
        });
        if (error) { setServerError(t(mapAuthError(error.message))); return; }
        if (!authData.session) {
          setSuccessMessage(t("registerSuccess"));
          return;
        }
        router.push("/onboarding");
        router.refresh();
      } catch {
        setServerError(t("errors.networkError"));
      }
    });
  };

  const switchMode = (newMode: AuthMode) => {
    setMode(newMode);
    setServerError("");
    setSuccessMessage("");
    loginForm.reset();
    registerForm.reset();
  };

  return (
    <div className="min-h-screen min-h-dvh flex flex-col">
      <PocBanner />
      <div className="flex flex-1">
      {/* ── Left decorative column ── */}
      <div
        className="hidden lg:flex flex-col justify-between p-16 bg-side border-r border-border"
        style={{ width: 420, flexShrink: 0 }}
      >
        <Logo size={32} />

        <div>
          <h2 className="font-serif font-semibold text-[28px] leading-tight text-text mb-8">
            {t("sideHeadline")}
          </h2>
          <ul className="space-y-4">
            {CHECK_KEYS.map((key) => (
              <li key={key} className="flex items-start gap-3">
                {/* Check circle */}
                <span className="flex-shrink-0 mt-0.5 w-5 h-5 rounded-full bg-acc-light border border-acc-mid flex items-center justify-center">
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path d="M2 5l2.5 2.5L8 3" stroke="#2D5A3D" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </span>
                <span className="text-[14px] text-sub leading-relaxed">{t(key)}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="text-[12px] text-sub2">© {new Date().getFullYear()} BewerbungsBoost</p>
      </div>

      {/* ── Right form column ── */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 bg-bg">
        {/* Mobile logo */}
        <div className="lg:hidden mb-8">
          <Logo size={30} />
        </div>

        <div className="w-full max-w-[420px]">
          {/* Tab switch (nur in login/register sichtbar — in forgot zeigen wir
              stattdessen einen Back-Link). */}
          {mode !== "forgot" && (
            <div className="flex bg-side rounded-[10px] p-1 mb-7 border border-border-light">
              {(["login", "register"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => switchMode(m)}
                  className={`flex-1 py-2 text-[14px] font-semibold rounded-[8px] transition-colors
                    ${mode === m
                      ? "bg-white text-text shadow-nav"
                      : "text-sub hover:text-text"
                    }`}
                >
                  {m === "login" ? t("loginTitle") : t("registerTitle")}
                </button>
              ))}
            </div>
          )}

          {/* Forgot-Mode Header */}
          {mode === "forgot" && (
            <div className="mb-6">
              <button
                type="button"
                onClick={() => switchMode("login")}
                className="text-[13px] text-acc hover:underline inline-flex items-center gap-1 mb-3"
              >
                ← {t("loginTitle")}
              </button>
              <h2 className="font-serif font-semibold text-[22px] text-text">
                {t("forgotTitle")}
              </h2>
              <p className="text-[13px] text-sub mt-1">{t("forgotIntro")}</p>
            </div>
          )}

          {/* Success */}
          {successMessage && (
            <div className="badge-green w-full rounded-[10px] p-4 mb-5 text-[13px] leading-relaxed">
              ✉️ {successMessage}
            </div>
          )}

          {/* Login Form */}
          {mode === "login" && (
            <form onSubmit={loginForm.handleSubmit(handleLogin)} noValidate className="space-y-4">
              <div>
                <label className="field-label">{t("email")}</label>
                <input
                  {...loginForm.register("email")}
                  type="email"
                  className="field"
                  placeholder={t("emailPlaceholder")}
                  autoComplete="email"
                  disabled={isPending}
                />
                {loginForm.formState.errors.email && (
                  <p className="field-error">{t("errors.emailInvalid")}</p>
                )}
              </div>
              <div>
                <label className="field-label">{t("password")}</label>
                <input
                  {...loginForm.register("password")}
                  type="password"
                  className="field"
                  placeholder={t("passwordPlaceholder")}
                  autoComplete="current-password"
                  disabled={isPending}
                />
                {loginForm.formState.errors.password && (
                  <p className="field-error">{t("errors.passwordRequired")}</p>
                )}
              </div>
              {serverError && (
                <div className="text-[13px] text-s-err-text bg-red-50 border border-s-err-border rounded-btn p-3">
                  {serverError}
                </div>
              )}
              <button type="submit" className="btn-primary w-full" disabled={isPending}>
                {isPending ? t("loginPending") : t("loginButton")}
              </button>

              {/* Passwort vergessen? */}
              <div className="text-center pt-2">
                <button
                  type="button"
                  onClick={() => switchMode("forgot")}
                  className="text-[13px] text-acc hover:underline"
                  disabled={isPending}
                >
                  {t("forgotLink")}
                </button>
              </div>
            </form>
          )}

          {/* Forgot Form */}
          {mode === "forgot" && <PasswordResetRequestForm />}

          {/* Register Form */}
          {mode === "register" && (
            <form onSubmit={registerForm.handleSubmit(handleRegister)} noValidate className="space-y-4">
              <div>
                <label className="field-label">{t("email")}</label>
                <input
                  {...registerForm.register("email")}
                  type="email"
                  className="field"
                  placeholder={t("emailPlaceholder")}
                  autoComplete="email"
                  disabled={isPending}
                />
                {registerForm.formState.errors.email && (
                  <p className="field-error">{t("errors.emailInvalid")}</p>
                )}
              </div>
              <div>
                <label className="field-label">{t("password")}</label>
                <input
                  {...registerForm.register("password")}
                  type="password"
                  className="field"
                  placeholder={t("passwordPlaceholder")}
                  autoComplete="new-password"
                  disabled={isPending}
                />
                {registerForm.formState.errors.password && (
                  <p className="field-error">{t("errors.passwordTooShort")}</p>
                )}
              </div>
              <div>
                <label className="field-label">{t("passwordConfirm")}</label>
                <input
                  {...registerForm.register("passwordConfirm")}
                  type="password"
                  className="field"
                  placeholder={t("passwordPlaceholder")}
                  autoComplete="new-password"
                  disabled={isPending}
                />
                {registerForm.formState.errors.passwordConfirm && (
                  <p className="field-error">{t("errors.passwordMismatch")}</p>
                )}
              </div>
              {serverError && (
                <div className="text-[13px] text-s-err-text bg-red-50 border border-s-err-border rounded-btn p-3">
                  {serverError}
                </div>
              )}
              <button type="submit" className="btn-primary w-full" disabled={isPending}>
                {isPending ? t("registerPending") : t("registerButton")}
              </button>
            </form>
          )}

        </div>
      </div>
      </div>
    </div>
  );
}
