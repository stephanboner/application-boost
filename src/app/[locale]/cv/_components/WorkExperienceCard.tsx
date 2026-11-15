"use client";

import { useTranslations } from "next-intl";
import { useFieldArray, type Control, type UseFormRegister } from "react-hook-form";
import type { CVProfile } from "@/types";

interface Props {
  control: Control<CVProfile>;
  register: UseFormRegister<CVProfile>;
}

export function WorkExperienceCard({ control, register }: Props) {
  const t = useTranslations("cv");
  const { fields, append, remove } = useFieldArray({ control, name: "workExperience" });

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span>💼</span>
          <h2 className="font-serif font-semibold text-[16px] text-text">
            {t("workExperience")}
          </h2>
        </div>
        <button
          type="button"
          className="text-[13px] text-acc font-semibold hover:underline"
          onClick={() =>
            append({ id: crypto.randomUUID(), jobTitle: "", employer: "", duration: "" })
          }
        >
          + {t("addExperience")}
        </button>
      </div>

      {fields.length === 0 && (
        <p className="text-sub2 text-[13px] text-center py-4">
          {t("emptyExperience")}
        </p>
      )}

      {fields.map((field, i) => (
        <div key={field.id} className="border border-border-light rounded-card p-4 mb-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
            <div>
              <label className="field-label">{t("jobTitle")} *</label>
              <input
                {...register(`workExperience.${i}.jobTitle`, { required: true })}
                className="field"
                placeholder={t("jobPlaceholder")}
              />
            </div>
            <div>
              <label className="field-label">{t("employer")} *</label>
              <input
                {...register(`workExperience.${i}.employer`, { required: true })}
                className="field"
                placeholder={t("employerPlaceholder")}
              />
            </div>
          </div>
          <div className="mb-3">
            <label className="field-label">{t("duration")}</label>
            <input
              {...register(`workExperience.${i}.duration`)}
              className="field"
              placeholder={t("durationPlaceholder")}
            />
          </div>
          <div className="mb-2">
            <label className="field-label">{t("description")}</label>
            <textarea
              {...register(`workExperience.${i}.description`)}
              className="field resize-none"
              rows={2}
              placeholder={t("experiencePlaceholder")}
            />
          </div>
          <button
            type="button"
            className="text-[12px] text-sub2 hover:text-s-err-text transition-colors"
            onClick={() => remove(i)}
          >
            {t("remove")}
          </button>
        </div>
      ))}
    </div>
  );
}
