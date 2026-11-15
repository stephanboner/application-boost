"use client";

import { useTranslations } from "next-intl";
import { useFieldArray, type Control, type UseFormRegister } from "react-hook-form";
import { LANGUAGE_LEVELS } from "@/lib/constants";
import type { CVProfile } from "@/types";

interface Props {
  control: Control<CVProfile>;
  register: UseFormRegister<CVProfile>;
}

export function LanguagesCard({ control, register }: Props) {
  const t = useTranslations("cv");
  const { fields, append, remove } = useFieldArray({ control, name: "languages" });

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span>🌍</span>
          <h2 className="font-serif font-semibold text-[16px] text-text">{t("languages")}</h2>
        </div>
        <button
          type="button"
          className="text-[13px] text-acc font-semibold hover:underline"
          onClick={() => append({ id: crypto.randomUUID(), name: "", level: "B2" })}
        >
          + {t("addLanguage")}
        </button>
      </div>

      {fields.length === 0 && (
        <p className="text-sub2 text-[13px] text-center py-4">
          {t("emptyLanguages")}
        </p>
      )}

      {fields.map((field, i) => (
        <div key={field.id} className="flex items-center gap-3 mb-2">
          <input
            {...register(`languages.${i}.name`, { required: true })}
            className="field flex-1"
            placeholder={t("languagePlaceholder")}
          />
          <select
            {...register(`languages.${i}.level`)}
            className="field w-36 flex-shrink-0"
          >
            {LANGUAGE_LEVELS.map((l) => (
              <option key={l} value={l}>
                {l === "native" ? t("nativeLevel") : l}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="text-sub2 hover:text-s-err-text text-[16px] flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-btn hover:bg-red-50 transition-colors"
            onClick={() => remove(i)}
            aria-label={t("remove")}
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
