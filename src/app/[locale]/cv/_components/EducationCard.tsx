"use client";

import { useTranslations } from "next-intl";
import { useFieldArray, type Control, type UseFormRegister } from "react-hook-form";
import type { CVProfile } from "@/types";

interface Props {
  control: Control<CVProfile>;
  register: UseFormRegister<CVProfile>;
}

export function EducationCard({ control, register }: Props) {
  const t = useTranslations("cv");
  const { fields, append, remove } = useFieldArray({ control, name: "education" });

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span>🎓</span>
          <h2 className="font-serif font-semibold text-[16px] text-text">{t("education")}</h2>
        </div>
        <button
          type="button"
          className="text-[13px] text-acc font-semibold hover:underline"
          onClick={() =>
            append({ id: crypto.randomUUID(), degree: "", institution: "", duration: "" })
          }
        >
          + {t("addEducation")}
        </button>
      </div>

      {fields.length === 0 && (
        <p className="text-sub2 text-[13px] text-center py-4">
          {t("emptyEducation")}
        </p>
      )}

      {fields.map((field, i) => (
        <div key={field.id} className="border border-border-light rounded-card p-4 mb-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
            <div>
              <label className="field-label">{t("degree")} *</label>
              <input
                {...register(`education.${i}.degree`, { required: true })}
                className="field"
                placeholder={t("degreePlaceholder")}
              />
            </div>
            <div>
              <label className="field-label">{t("institution")}</label>
              <input
                {...register(`education.${i}.institution`)}
                className="field"
                placeholder={t("institutionPlaceholder")}
              />
            </div>
          </div>
          <div className="mb-2">
            <label className="field-label">{t("duration")}</label>
            <input
              {...register(`education.${i}.duration`)}
              className="field"
              placeholder={t("durationPlaceholder")}
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
