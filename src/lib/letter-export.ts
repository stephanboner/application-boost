// ============================================================
// Letter-Export: Word (docx) und PDF (jsPDF)
// Reine Funktionen – werden lazy aus dem Result-Panel geladen
// ============================================================

import { recipientLines, senderLines, dateWithLocation } from "@/lib/letter-format";
import type { CVProfile } from "@/types";

const SUBJECT_PREFIX: Record<string, string> = {
  de: "Bewerbung als",
  fr: "Candidature pour",
  it: "Candidatura per",
  en: "Application for",
  rm: "Candidatura per",
  uk: "Заявка на посаду",
  sr: "Prijava za",
  sq: "Aplikim për",
  hr: "Prijava za",
  pt: "Candidatura para",
  es: "Solicitud para",
};

function dateLocale(language: string): string {
  if (language === "de" || language === "rm") return "de-CH";
  if (language === "fr") return "fr-CH";
  if (language === "it") return "it-CH";
  return "de-CH";
}

export interface LetterMeta {
  subject: string;
  date: string;
}

export interface JobMinimal {
  title: string;
  company: string;
}

export function buildLetterMeta(
  parsedJob: JobMinimal | null,
  language: string
): LetterMeta {
  const prefix = SUBJECT_PREFIX[language] ?? "Bewerbung als";
  const subject = parsedJob
    ? `${prefix} ${parsedJob.title} – ${parsedJob.company}`
    : "Bewerbungsschreiben";
  const date = new Date().toLocaleDateString(dateLocale(language), {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  return { subject, date };
}

function sanitizeFilename(input: string): string {
  return input.replace(/[^a-zA-Z0-9_.-]/g, "_");
}

function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ============================================================
// Word-Export (docx)
// ============================================================

export async function exportLetterAsWord(params: {
  letter: string;
  parsedJob: JobMinimal | null;
  language: string;
  companyAddress: string;
  cv?: CVProfile | null;
}): Promise<void> {
  const { letter, parsedJob, language, companyAddress, cv } = params;
  const { Document, Paragraph, TextRun, Packer, AlignmentType, BorderStyle } = await import("docx");
  const { subject, date } = buildLetterMeta(parsedJob, language);
  const sender = senderLines(cv ?? null);
  const recipient = recipientLines(parsedJob?.company, companyAddress);
  const dateLine = dateWithLocation(date, cv ?? null);

  const mm = (v: number) => Math.round(v * 56.7); // mm → twips
  const font = "Calibri";
  const sz = 22; // 11 pt
  const szSm = 20; // 10 pt
  const szSubj = 24; // 12 pt
  const lineSpacing = { line: 276, lineRule: "auto" as const };

  const p = (
    text: string,
    opts: {
      bold?: boolean;
      size?: number;
      align?: "right" | "left";
      afterMm?: number;
      beforeMm?: number;
      color?: string;
    } = {}
  ) =>
    new Paragraph({
      alignment: opts.align === "right" ? AlignmentType.RIGHT : AlignmentType.LEFT,
      children: [
        new TextRun({
          text: text || " ",
          font,
          size: opts.size ?? sz,
          bold: opts.bold,
          color: opts.color,
        }),
      ],
      spacing: {
        ...lineSpacing,
        before: mm(opts.beforeMm ?? 0),
        after: mm(opts.afterMm ?? 0),
      },
    });

  const paras: InstanceType<typeof Paragraph>[] = [];

  // Absender (oben rechts, klein)
  if (sender.length > 0) {
    sender.forEach((line, i) =>
      paras.push(
        p(line, {
          size: szSm,
          align: "right",
          afterMm: i === sender.length - 1 ? 10 : 0,
        })
      )
    );
  }

  // Empfänger (links)
  if (recipient.length > 0) {
    recipient.forEach((line, i) =>
      paras.push(
        p(line, { size: szSm, afterMm: i === recipient.length - 1 ? 10 : 0 })
      )
    );
  } else {
    paras.push(p("", { afterMm: 10 }));
  }

  // Ort, Datum (rechts)
  paras.push(p(dateLine, { align: "right", afterMm: 8 }));

  // Trennlinie
  paras.push(
    new Paragraph({
      border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: "2D5A3D", space: 1 } },
      spacing: { after: mm(7) },
    })
  );

  // Betreff
  paras.push(p(subject, { bold: true, size: szSubj, color: "2D5A3D", afterMm: 9 }));

  // Brieftext
  const letterParagraphs = letter.split(/\n{2,}/);
  letterParagraphs.forEach((para, pi) => {
    const lines = para.split("\n");
    lines.forEach((line, li) => {
      const isLastLineOfPara = li === lines.length - 1;
      const isLastPara = pi === letterParagraphs.length - 1;
      paras.push(p(line, { afterMm: isLastLineOfPara && !isLastPara ? 3 : 0 }));
    });
  });

  const doc = new Document({
    sections: [
      {
        properties: {
          page: { margin: { top: mm(27), bottom: mm(22), left: mm(27), right: mm(22) } },
        },
        children: paras,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  triggerBlobDownload(
    blob,
    sanitizeFilename(`Bewerbungsschreiben_${parsedJob?.company ?? "Stelle"}.docx`)
  );
}

// ============================================================
// PDF-Export (jsPDF)
// ============================================================

export async function exportLetterAsPdf(params: {
  letter: string;
  parsedJob: JobMinimal | null;
  language: string;
  companyAddress: string;
  cv?: CVProfile | null;
}): Promise<void> {
  const { letter, parsedJob, language, companyAddress, cv } = params;
  const { jsPDF } = await import("jspdf");
  const { subject, date } = buildLetterMeta(parsedJob, language);
  const sender = senderLines(cv ?? null);
  const recipient = recipientLines(parsedJob?.company, companyAddress);
  const dateLine = dateWithLocation(date, cv ?? null);

  const doc = new jsPDF({ format: "a4", unit: "mm" });
  const ml = 27;
  const mr = 22;
  const mt = 27;
  const pw = 210;
  const ph = 297;
  const cw = pw - ml - mr;
  const lh = 5.8;
  const lhSm = 5.2;
  let y = mt;

  const checkPage = (needed = lh) => {
    if (y + needed > ph - 22) {
      doc.addPage();
      y = mt;
    }
  };

  // Absender (oben rechts, klein)
  if (sender.length > 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(80, 80, 80);
    for (const line of sender) {
      checkPage(lhSm);
      doc.text(line, pw - mr, y, { align: "right" });
      y += lhSm;
    }
    y += 4;
  }

  // Empfänger (links)
  if (recipient.length > 0) {
    doc.setFontSize(10);
    doc.setTextColor(40, 40, 40);
    for (const line of recipient) {
      checkPage(lhSm);
      doc.text(line, ml, y);
      y += lhSm;
    }
    y += 6;
  }

  // Ort, Datum (rechts)
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(80, 80, 80);
  doc.text(dateLine, pw - mr, y, { align: "right" });
  y += lh * 1.8;

  // Trennlinie (Forest Green)
  doc.setDrawColor(45, 90, 61);
  doc.setLineWidth(0.5);
  doc.line(ml, y, pw - mr, y);
  y += 6;

  // Betreff
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(45, 90, 61);
  const subjectLines = doc.splitTextToSize(subject, cw) as string[];
  checkPage(subjectLines.length * lh + 6);
  doc.text(subjectLines, ml, y);
  y += subjectLines.length * lh + 8;

  // Brieftext
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(30, 30, 30);

  const letterParagraphs = letter.split(/\n{2,}/);
  letterParagraphs.forEach((para, pi) => {
    const lines = para.split("\n");
    lines.forEach((line) => {
      if (!line.trim()) return;
      const wrapped = doc.splitTextToSize(line, cw) as string[];
      checkPage(wrapped.length * lh);
      doc.text(wrapped, ml, y);
      y += wrapped.length * lh;
    });
    if (pi < letterParagraphs.length - 1) y += 2.5;
  });

  doc.save(sanitizeFilename(`Bewerbungsschreiben_${parsedJob?.company ?? "Stelle"}.pdf`));
}
