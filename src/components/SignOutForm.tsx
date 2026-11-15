"use client";

import { useTranslations } from "next-intl";
import { useApplicationStore } from "@/store/application";

export function SignOutForm() {
  const t = useTranslations("nav");
  return (
    <form
      action="/api/auth/signout"
      method="POST"
      onSubmit={() => {
        useApplicationStore.getState().reset();
        void useApplicationStore.persist.clearStorage();
      }}
    >
      <button type="submit" className="btn-danger w-full">{t("logout")}</button>
    </form>
  );
}
