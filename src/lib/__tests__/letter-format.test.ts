import { describe, it, expect } from "vitest";
import {
  parseAddressLines,
  senderLines,
  recipientLines,
  dateWithLocation,
} from "../letter-format";
import type { CVProfile } from "@/types";

const cvFixture: CVProfile = {
  userId: "u1",
  firstName: "Maria",
  lastName: "Muster",
  phone: "",
  location: "Chur, GR",
  workExperience: [],
  education: [],
  skills: [],
  languages: [],
  hasCv: true,
  cvSource: "manual",
  language: "de",
};

describe("parseAddressLines", () => {
  it("respektiert vom Nutzer gesetzte Zeilenumbrüche", () => {
    expect(parseAddressLines("Acme AG\nHauptstrasse 1\n7000 Chur")).toEqual([
      "Acme AG",
      "Hauptstrasse 1",
      "7000 Chur",
    ]);
  });

  it("splittet Strasse von PLZ-Ort an Komma", () => {
    expect(parseAddressLines("Hauptstrasse 1, 7000 Chur")).toEqual([
      "Hauptstrasse 1",
      "7000 Chur",
    ]);
  });

  it("splittet auch dreiteilige Adressen am Komma", () => {
    expect(parseAddressLines("Acme AG, Hauptstrasse 1, 7000 Chur")).toEqual([
      "Acme AG",
      "Hauptstrasse 1",
      "7000 Chur",
    ]);
  });

  it("splittet NICHT bei Komma im Firmennamen ohne PLZ-Folge", () => {
    expect(parseAddressLines("Müller, Meier & Co. AG")).toEqual([
      "Müller, Meier & Co. AG",
    ]);
  });

  it("liefert leeres Array bei null/leerem Input", () => {
    expect(parseAddressLines(null)).toEqual([]);
    expect(parseAddressLines("")).toEqual([]);
    expect(parseAddressLines("   ")).toEqual([]);
  });

  it("trimmt jede Zeile", () => {
    expect(parseAddressLines("  Acme AG  \n  Chur  ")).toEqual(["Acme AG", "Chur"]);
  });
});

describe("senderLines", () => {
  it("baut Name und Wohnort", () => {
    expect(senderLines(cvFixture)).toEqual(["Maria Muster", "Chur, GR"]);
  });

  it("filtert leere Felder", () => {
    expect(senderLines({ ...cvFixture, location: "" })).toEqual(["Maria Muster"]);
  });

  it("liefert leeres Array bei null", () => {
    expect(senderLines(null)).toEqual([]);
  });
});

describe("recipientLines", () => {
  it("setzt Firmenname vor die Adresse", () => {
    expect(recipientLines("Acme AG", "Hauptstrasse 1, 7000 Chur")).toEqual([
      "Acme AG",
      "Hauptstrasse 1",
      "7000 Chur",
    ]);
  });

  it("vermeidet doppelten Firmennamen", () => {
    expect(recipientLines("Acme AG", "Acme AG\nHauptstrasse 1\n7000 Chur")).toEqual([
      "Acme AG",
      "Hauptstrasse 1",
      "7000 Chur",
    ]);
  });

  it("zeigt nur die Firma wenn keine Adresse", () => {
    expect(recipientLines("Acme AG", "")).toEqual(["Acme AG"]);
    expect(recipientLines("Acme AG", null)).toEqual(["Acme AG"]);
  });

  it("zeigt nur die Adresse wenn keine Firma", () => {
    expect(recipientLines("", "Hauptstrasse 1\n7000 Chur")).toEqual([
      "Hauptstrasse 1",
      "7000 Chur",
    ]);
  });
});

describe("dateWithLocation", () => {
  it("baut Schweizer Format mit Ort und Datum", () => {
    expect(dateWithLocation("12. Mai 2026", cvFixture)).toBe("Chur, 12. Mai 2026");
  });

  it("extrahiert nur die Stadt vor dem Komma", () => {
    expect(dateWithLocation("12. Mai 2026", { ...cvFixture, location: "Chur, GR" })).toBe(
      "Chur, 12. Mai 2026"
    );
  });

  it("nur Datum wenn kein Ort verfügbar", () => {
    expect(dateWithLocation("12. Mai 2026", null)).toBe("12. Mai 2026");
    expect(dateWithLocation("12. Mai 2026", { ...cvFixture, location: "" })).toBe(
      "12. Mai 2026"
    );
  });
});
