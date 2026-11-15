// ============================================================
// Brief-Formatierung: Adressen, Absender, Briefkopf
// Single Source of Truth — wird von Result-Page und Export-Library genutzt.
// ============================================================

import type { CVProfile } from "@/types";

/**
 * Normalisiert einen Adress-String in saubere Zeilen.
 *
 * Akzeptiert mehrere Eingabe-Formate:
 *  - "Acme AG\nHauptstrasse 1\n7000 Chur"  → 3 Zeilen
 *  - "Acme AG, Hauptstrasse 1, 7000 Chur"  → 3 Zeilen (Komma-getrennt)
 *  - "Hauptstrasse 1, 7000 Chur"           → 2 Zeilen (Strasse, PLZ Ort)
 *
 * Komma-Splitting passiert nur, wenn es einen offensichtlichen
 * PLZ-Ort-Teil gibt (4-stellige Zahl gefolgt von Wort), damit Firmen
 * mit Komma im Namen ("Müller, Meier & Co. AG") nicht zerlegt werden.
 */
export function parseAddressLines(input: string | null | undefined): string[] {
  if (!input) return [];
  const trimmed = input.trim();
  if (!trimmed) return [];

  // Hat der User bereits Zeilenumbrüche gesetzt? Dann diese respektieren.
  if (trimmed.includes("\n")) {
    return trimmed
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
  }

  // Sonst nur splitten, wenn irgendwo eine PLZ-Ort-Struktur erkennbar ist
  // (4–5-stellige Zahl gefolgt von einem Wort, z.B. "7000 Chur").
  // Damit zerlegen wir Adressen, lassen aber "Müller, Meier & Co. AG" intakt.
  if (/\b\d{4,5}\s+\S/.test(trimmed)) {
    return trimmed.split(/,\s+/).map((l) => l.trim()).filter(Boolean);
  }

  return [trimmed];
}

/**
 * Liefert die Adress-Zeilen des Absenders aus dem CV.
 * Reihenfolge: Name, Wohnort (ggf. später Strasse).
 */
export function senderLines(cv: CVProfile | null): string[] {
  if (!cv) return [];
  const fullName = `${cv.firstName ?? ""} ${cv.lastName ?? ""}`.trim();
  return [fullName, cv.location ?? ""].filter(Boolean);
}

/**
 * Empfänger-Block (Firma + Adresse) für den Briefkopf.
 * Stellt sicher, dass die Firma nicht doppelt erscheint, wenn der User
 * sie auch in den Adress-Feldern angegeben hat.
 */
export function recipientLines(
  company: string | null | undefined,
  companyAddress: string | null | undefined
): string[] {
  const addr = parseAddressLines(companyAddress);
  const firma = (company ?? "").trim();
  if (!firma) return addr;

  // Wenn die erste Adresszeile bereits exakt der Firmenname ist, nicht doppeln.
  if (addr.length > 0 && addr[0].toLowerCase() === firma.toLowerCase()) {
    return addr;
  }
  return [firma, ...addr];
}

/**
 * Ortsangabe für die Datumszeile (z.B. "Chur, 12. Mai 2026").
 * Nutzt den Wohnort des Absenders, wenn vorhanden.
 */
export function dateWithLocation(
  date: string,
  cv: CVProfile | null
): string {
  // Wohnort heuristisch aus "Chur, GR" extrahieren (nur Stadt vor erstem Komma).
  const rawLocation = cv?.location?.split(",")[0]?.trim();
  if (rawLocation) return `${rawLocation}, ${date}`;
  return date;
}
