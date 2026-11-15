import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { NextRequest } from "next/server";
import { Document, Packer, Paragraph } from "docx";
import { jsPDF } from "jspdf";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), loadCV: vi.fn(), quota: vi.fn() }));
vi.mock("@/lib/api-helpers", async (original) => ({
  ...await original<typeof import("@/lib/api-helpers")>(), requireAuth: mocks.auth, loadUserCV: mocks.loadCV,
}));
vi.mock("@/lib/ai-budget", () => ({ reserveAIQuota: mocks.quota }));
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: vi.fn() }));

// Exercise extraction, prompts, the real SDK/HTTP transport and API validation.
// Only authentication, quota storage and the external provider are fixtures.
import { JOB_OUTPUT_SCHEMA } from "@/lib/job-output-schema";
import { getAnthropicClient } from "@/lib/anthropic";
import { POST as upload } from "./cv/parse-upload/route";
import { POST as parseJob } from "./parse-job/route";
import { POST as qualify } from "./qualify/route";

const cv = {
  firstName: "Maria", lastName: "Muster", location: "Chur", phone: "",
  workExperience: Array.from({ length: 10 }, (_, i) => ({
    id: `exp-${i + 1}`, jobTitle: `Projektleitung ${i + 1}`, employer: `Testfirma ${i + 1}`,
    duration: "2020–2026", description: "Kundenbedürfnisse analysieren, Softwareprojekte koordinieren und neue Produkte gemeinsam mit einem interdisziplinären Team entwickeln.",
  })),
  education: [{ id: "edu-1", degree: "Informatik", institution: "Testschule", duration: "2016–2020" }],
  skills: ["Projektleitung", "Produktentwicklung", "Kommunikation"],
  languages: [{ id: "lang-1", name: "Deutsch", level: "native" }],
  cvSource: "pdf", language: "de",
};
const match = {
  topMatches: ["Erfahrung mit Projektleitung", "Entwicklung neuer Produkte", "Kommunikation mit Kunden"],
  gaps: ["Keine Branchenerfahrung dokumentiert"], keywords: ["Projektleitung", "Produktentwicklung"], matchScore: 78,
};
const jobData = { title: "Projektleitung", company: "Testfirma", tasks: ["Produkte entwickeln"], mustHave: ["Projektleitung"], niceToHave: [] };
let mode: "success" | "billing" | "invalid" = "success";
const bodies: Array<Record<string, unknown>> = [];
const server = createServer(async (req, res) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  const body = JSON.parse(Buffer.concat(chunks).toString()) as Record<string, unknown>;
  bodies.push(body);
  res.setHeader("Content-Type", "application/json");
  res.setHeader("request-id", "req_test_pipeline");
  if (mode === "billing") {
    res.writeHead(402).end(JSON.stringify({ type: "error", error: { type: "billing_error", message: "PRIVATE_PROVIDER_CONTENT" } }));
    return;
  }
  const isCV = JSON.stringify(body.system).includes("Lebenslauf-Parser");
  const isJob = JSON.stringify(body.system).includes("Stelleninserate");
  // Simulate output larger than the old 2000/400-token ceilings.
  const outputTokens = isCV ? 2400 : isJob ? 900 : 650;
  const truncated = Number(body.max_tokens) < outputTokens;
  const text = mode === "invalid" ? '{"matchScore":"PRIVATE_INVALID_VALUE"}' : JSON.stringify(isCV ? cv : isJob ? jobData : match);
  res.end(JSON.stringify({ id: "msg_test_pipeline", type: "message", role: "assistant", model: body.model,
    content: [{ type: "text", text: truncated ? text.slice(0, 80) : text }],
    stop_reason: truncated ? "max_tokens" : "end_turn", stop_sequence: null,
    usage: { input_tokens: 1000, output_tokens: truncated ? body.max_tokens : outputTokens },
  }));
});
let previousBaseURL: string;

beforeAll(async () => {
  vi.stubEnv("ANTHROPIC_API_KEY", "test-anthropic-key");
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const client = getAnthropicClient();
  previousBaseURL = client.baseURL;
  client.baseURL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  getAnthropicClient().baseURL = previousBaseURL;
  await new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
  vi.unstubAllEnvs();
});
beforeEach(() => {
  vi.clearAllMocks(); mode = "success"; bodies.length = 0;
  mocks.auth.mockResolvedValue({ user: { id: "test-user" }, supabase: {} });
  mocks.loadCV.mockResolvedValue({ ...cv, userId: "test-user", hasCv: true });
  mocks.quota.mockResolvedValue(undefined);
});

async function uploadRequest(format = "docx") {
  let buffer: Uint8Array;
  if (format === "pdf") {
    const pdf = new jsPDF();
    pdf.text("Maria Muster - Projektleitung in Chur", 10, 20);
    buffer = new Uint8Array(pdf.output("arraybuffer"));
  } else {
    buffer = new Uint8Array(await Packer.toBuffer(new Document({ sections: [{ children: [new Paragraph("Maria Muster – Projektleitung in Chur")] }] })));
  }
  const body = new FormData();
  body.append("file", new File([new Uint8Array(buffer)], `synthetic.${format}`, { type: format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }));
  return new NextRequest("https://example.com/api/cv/parse-upload", { method: "POST", body });
}
function qualifyRequest() {
  return new NextRequest("https://example.com/api/qualify", { method: "POST", body: JSON.stringify({ jobData }) });
}

describe("CV and matching through the real SDK", () => {
  it.each(["pdf", "docx"])("imports a complete %s CV above the previous output ceiling", async (format) => {
    const response = await upload(await uploadRequest(format));
    expect(response.status).toBe(200);
    expect((await response.json()).cv.workExperience).toHaveLength(10);
    expect(bodies).toHaveLength(1);
    expect(JSON.stringify(bodies[0].messages)).toContain("Maria Muster");
    expect(mocks.quota).toHaveBeenCalledWith(expect.any(String), expect.any(String), 4096);
  });
  it("returns a complete matching result above the previous output ceiling", async () => {
    const response = await qualify(qualifyRequest());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, match, matchStatus: "available" });
    expect(bodies).toHaveLength(1);
    expect(mocks.quota).toHaveBeenCalledWith(expect.any(String), expect.any(String), 1200);
  });
  it.each(["upload", "matching"])("exposes safe billing diagnostics for %s without a second paid attempt", async (route) => {
    mode = "billing";
    const response = route === "upload" ? await upload(await uploadRequest()) : await qualify(qualifyRequest());
    expect(response.status).toBe(503);
    const data = await response.json();
    expect(data.code).toBe("AI_BILLING");
    expect(JSON.stringify(data)).not.toContain("PRIVATE_");
    expect(response.headers.get("X-Request-ID")).toMatch(/^[0-9a-f-]{36}$/);
    expect(bodies).toHaveLength(1);
  });
  it("rejects malformed matching data with a specific safe error", async () => {
    mode = "invalid";
    const response = await qualify(qualifyRequest());
    expect(response.status).toBe(502);
    const data = await response.json();
    expect(data.code).toBe("AI_INVALID_OUTPUT");
    expect(JSON.stringify(data)).not.toContain("PRIVATE_");
  });
  it("parses a detailed job through the SDK above the previous 600-token ceiling", async () => {
    const content = "Strategy leadership: interdisciplinary workshops and evidence-based recommendations. ".repeat(20);
    const response = await parseJob(new NextRequest("https://example.com/api/parse-job", {
      method: "POST", body: JSON.stringify({ type: "text", content }),
    }));
    expect(response.status).toBe(200);
    expect((await response.json()).job).toMatchObject({ title: jobData.title, rawText: content.trim() });
    expect(bodies).toHaveLength(1);
    expect(bodies[0].output_config).toEqual({ format: { type: "json_schema", schema: JOB_OUTPUT_SCHEMA } });
    expect(mocks.quota).toHaveBeenCalledWith(expect.any(String), expect.stringContaining(JSON.stringify(JOB_OUTPUT_SCHEMA)), 2000);
  });
  it("invalid job output produces safe diagnostics rather than HTTP 500", async () => {
    mode = "invalid";
    const response = await parseJob(new NextRequest("https://example.com/api/parse-job", {
      method: "POST", body: JSON.stringify({ type: "text", content: "A detailed job posting" }),
    }));
    expect(response.status).toBe(502);
    const data = await response.json();
    expect(data.code).toBe("AI_INVALID_JOB_DATA");
    expect(JSON.stringify(data)).not.toContain("PRIVATE_");
    expect(bodies).toHaveLength(1);
  });

});
