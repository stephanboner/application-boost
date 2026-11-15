"use client";

import { useTranslations } from "next-intl";
import type { UseFormRegister, FieldErrors } from "react-hook-form";
import type { CVProfile } from "@/types";

interface Props {
  register: UseFormRegister<CVProfile>;
  errors: FieldErrors<CVProfile>;
}

export function PersonalInfoCard({ register, errors }: Props) {
  const t = useTranslations("cv");
  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-4">
        <span>👤</span>
        <h2 className="font-serif font-semibold text-[16px] text-text">{t("personalInfo")}</h2>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="field-label">{t("firstName")} *</label>
          <input
            {...register("firstName", { required: true })}
            className="field"
            placeholder="Maria"
          />
          {errors.firstName && <p className="field-error">Pflichtfeld</p>}
        </div>
        <div>
          <label className="field-label">{t("lastName")} *</label>
          <input
            {...register("lastName", { required: true })}
            className="field"
            placeholder="Muster"
          />
          {errors.lastName && <p className="field-error">Pflichtfeld</p>}
        </div>
        <div>
          <label className="field-label">{t("phone")}</label>
          <input {...register("phone")} className="field" placeholder="+41 79 123 45 67" />
        </div>
        <div>
          <label className="field-label">{t("location")} *</label>
          <input
            {...register("location", { required: true })}
            className="field"
            placeholder="Chur, GR"
          />
        </div>
      </div>
    </div>
  );
}
