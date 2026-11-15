import type { Page, Route } from "@playwright/test";

// ============================================================
// API-Mocks für E2E-Tests
//
// Intercepted alle relevanten Routen, damit die Tests deterministisch
// und ohne echte Supabase-/Anthropic-Verbindung laufen.
// ============================================================

export interface MockState {
  cv: Record<string, unknown> | null;
  applications: Array<{
    id: string;
    job_title: string;
    company: string;
    letter: string;
    tone: string;
    language: string;
    created_at: string;
  }>;
}

export function createMockState(): MockState {
  return {
    cv: {
      firstName: "Maria",
      lastName: "Muster",
      phone: "+41 79 123 45 67",
      location: "Chur, GR",
      workExperience: [
        {
          id: "exp-1",
          jobTitle: "Sachbearbeiterin",
          employer: "Gemeinde Chur",
          duration: "2020–heute",
          description: "Allg. Sachbearbeitung",
        },
      ],
      education: [
        { id: "edu-1", degree: "KV / EFZ", institution: "Berufsschule Chur", duration: "2015–2018" },
      ],
      skills: ["MS Office", "Kundenkontakt"],
      languages: [{ id: "lang-1", name: "Deutsch", level: "native" }],
      hasCv: true,
      cvSource: "manual",
      language: "de",
    },
    applications: [
      {
        id: "00000000-0000-0000-0000-000000000001",
        job_title: "Sachbearbeiter/in",
        company: "Kanton Graubünden",
        letter: "Sehr geehrte Damen und Herren,\n\nMit grossem Interesse bewerbe ich mich…\n\nFreundliche Grüsse\nMaria Muster",
        tone: "balanced",
        language: "de",
        created_at: "2026-05-10T10:00:00Z",
      },
    ],
  };
}

const MOCK_PARSED_JOB = {
  title: "Sachbearbeiter/in 80–100%",
  company: "Kanton Graubünden",
  location: "Chur",
  tasks: ["Schriftverkehr", "Telefonzentrale", "Aktenführung"],
  mustHave: ["KV-Abschluss", "Deutsch C2", "MS Office"],
  niceToHave: ["Italienisch", "Verwaltungserfahrung"],
  tone: "formal" as const,
  language: "de",
  address: "Reichsgasse 35\n7000 Chur",
  contactPerson: "Frau Meier",
};

const MOCK_MATCH = {
  topMatches: ["KV-Abschluss vorhanden", "MS Office Erfahrung", "Deutsch Muttersprache"],
  gaps: ["Italienischkenntnisse fehlen"],
  keywords: ["Sachbearbeitung", "Schriftverkehr", "MS Office", "Kundenkontakt"],
  matchScore: 82,
};

const MOCK_LETTER_CHUNKS = [
  "Sehr geehrte Frau Meier,\n\n",
  "mit grossem Interesse habe ich Ihr Stelleninserat für die Position als ",
  "Sachbearbeiter/in beim Kanton Graubünden gelesen. ",
  "Meine fünfjährige Erfahrung in der Gemeinde Chur ",
  "und mein KV-Abschluss qualifizieren mich für diese Aufgabe.\n\n",
  "Über eine Einladung zu einem Gespräch würde ich mich sehr freuen.\n\n",
  "Freundliche Grüsse\nMaria Muster",
];

/**
 * Setzt einen Supabase-Auth-Cookie, damit die Middleware den User als
 * eingeloggt erkennt. Die Proxy-Prüfung validiert diese Session über den
 * lokalen Supabase-Fixture-Server, auch bei serverseitigen Requests.
 */
export async function setMockSessionCookie(page: Page, accessToken = "mock-token") {
  await page.context().addCookies([
    {
      name: "sb-127-auth-token",
      value: "base64-" + Buffer.from(JSON.stringify({
        access_token: accessToken,
        refresh_token: "mock-refresh",
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        user: { id: "00000000-0000-0000-0000-000000000099", email: "maria@example.ch" },
      })).toString("base64url"),
      domain: "localhost",
      path: "/",
      expires: Math.floor(Date.now() / 1000) + 3600,
      httpOnly: false,
      secure: false,
      sameSite: "Lax",
    },
  ]);
}

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

/**
 * Registriert Mocks für alle /api/*-Routen.
 * Browser-Supabase-Calls werden hier interceptet. Serverseitige Calls
 * gehen an den lokalen Supabase-Fixture-Server aus playwright.config.ts.
 */
export async function mockApiRoutes(page: Page, state: MockState) {
  // ── Supabase Auth (User-Info-Calls) ──
  await page.route("**/auth/v1/user**", (route) =>
    json(route, {
      id: "00000000-0000-0000-0000-000000000099",
      email: "maria@example.ch",
      aud: "authenticated",
      role: "authenticated",
    })
  );

  // ── Supabase PostgREST: GETs / POSTs / PATCHs / DELETEs ──
  // Wir fangen alle /rest/v1/* Aufrufe und routen anhand der Tabelle.
  await page.route("**/rest/v1/cv_profiles**", (route) => {
    const method = route.request().method();
    if (method === "GET") {
      return json(route, {
        parsed_json_enc: "mock-enc",
        has_cv: true,
        cv_source: "manual",
        language: "de",
        updated_at: "2026-05-10T10:00:00Z",
      });
    }
    return json(route, { success: true });
  });

  await page.route("**/rest/v1/applications**", (route) => {
    const method = route.request().method();
    const url = new URL(route.request().url());
    if (method === "GET") {
      // Einzeldatensatz?
      const idFilter = url.searchParams.get("id");
      if (idFilter) {
        const app = state.applications[0];
        return json(route, [
          {
            id: app.id,
            job_title: app.job_title,
            company: app.company,
            letter_enc: "mock-letter-enc",
            tone: app.tone,
            language: app.language,
            word_count: 120,
            is_exported: false,
            created_at: app.created_at,
            updated_at: app.created_at,
          },
        ]);
      }
      return json(route, state.applications.map((a) => ({
        id: a.id,
        job_title: a.job_title,
        company: a.company,
        letter_enc: "mock-letter-enc",
        tone: a.tone,
        language: a.language,
        word_count: 120,
        is_exported: false,
        created_at: a.created_at,
        updated_at: a.created_at,
      })));
    }
    return json(route, { success: true });
  });

  // ── App-API: /api/cv ──
  await page.route("**/api/cv", (route) => {
    if (route.request().method() === "GET") {
      return json(route, { ...state.cv, hasCv: true });
    }
    return json(route, { success: true });
  });

  // ── /api/parse-job ──
  await page.route("**/api/parse-job", (route) =>
    json(route, { success: true, job: MOCK_PARSED_JOB })
  );

  // ── /api/qualify ──
  await page.route("**/api/qualify", (route) =>
    json(route, { success: true, match: MOCK_MATCH })
  );

  // ── /api/regenerate ──
  await page.route("**/api/regenerate", (route) =>
    json(route, {
      success: true,
      result: "FORMELLE VERSION: " + MOCK_LETTER_CHUNKS.join(""),
    })
  );

  // ── /api/generate (SSE-Stream) ──
  await page.route("**/api/generate", async (route) => {
    const encoder = new TextEncoder();
    const parts: string[] = [];

    parts.push(`event: keywords\ndata: ${JSON.stringify(MOCK_MATCH.keywords)}\n\n`);
    parts.push(`event: matchScore\ndata: ${JSON.stringify(MOCK_MATCH.matchScore)}\n\n`);
    for (const chunk of MOCK_LETTER_CHUNKS) {
      parts.push(`event: chunk\ndata: ${JSON.stringify(chunk)}\n\n`);
    }
    parts.push(`event: applicationId\ndata: ${JSON.stringify(state.applications[0].id)}\n\n`);
    parts.push(`event: done\ndata: true\n\n`);

    await route.fulfill({
      status: 200,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
      },
      body: Buffer.from(encoder.encode(parts.join(""))),
    });
  });

  // ── /api/history ──
  await page.route("**/api/history**", (route) => {
    const url = new URL(route.request().url());
    const id = url.searchParams.get("id");
    const method = route.request().method();
    if (method === "GET") {
      if (id) {
        const app = state.applications.find((a) => a.id === id);
        if (!app) return json(route, { error: "Bewerbung nicht gefunden" }, 404);
        return json(route, {
          application: {
            id: app.id,
            jobTitle: app.job_title,
            company: app.company,
            letter: app.letter,
            tone: app.tone,
            language: app.language,
            createdAt: app.created_at,
            updatedAt: app.created_at,
            isExported: false,
          },
        });
      }
      return json(route, {
        applications: state.applications.map((a) => ({
          id: a.id,
          jobTitle: a.job_title,
          company: a.company,
          tone: a.tone,
          language: a.language,
          createdAt: a.created_at,
          updatedAt: a.created_at,
          isExported: false,
        })),
        total: state.applications.length,
      });
    }
    return json(route, { success: true });
  });
}

