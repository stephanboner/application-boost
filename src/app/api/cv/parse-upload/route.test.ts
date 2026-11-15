import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { Document, Packer, Paragraph } from "docx";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), ai: vi.fn(), quota: vi.fn() }));
vi.mock("@/lib/api-helpers", async (original) => ({ ...await original<typeof import("@/lib/api-helpers")>(), requireAuth: mocks.auth }));
vi.mock("@/lib/anthropic", () => ({ callClaude: mocks.ai, AI_CONFIG: { cvParser: { max_tokens: 4096 } } }));
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: mocks.quota }));
import { POST } from "./route";
import { MAX_CV_UPLOAD_BYTES } from "@/lib/upload-limits";
import { ApiErrorResponse } from "@/lib/api-helpers";

function request(file: File) {
  const body = new FormData(); body.append("file", file);
  return new NextRequest("https://example.com/api/cv/parse-upload", { method: "POST", body });
}
async function docxFile() {
  const buffer = await Packer.toBuffer(new Document({ sections: [{ children: [new Paragraph("Maria Muster"), new Paragraph("Chur – IT-Projektleiterin")] }] }));
  return new File([new Uint8Array(buffer)], "test-cv.docx", { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
}
describe("CV upload boundary", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.auth.mockResolvedValue({ user: { id: "user" } }); mocks.quota.mockResolvedValue(undefined); mocks.ai.mockResolvedValue('{"firstName":"Maria","lastName":"Muster","location":"Chur"}'); });
  it("rejects files above 4 MB before parsing or paid calls", async () => {
    const response = await POST(request(new File([new Uint8Array(MAX_CV_UPLOAD_BYTES + 1)], "test.pdf", { type: "application/pdf" })));
    expect(response.status).toBe(413);
    expect(mocks.ai).not.toHaveBeenCalled(); expect(mocks.quota).not.toHaveBeenCalled();
  });
  it("extracts a real DOCX and returns validated profile fields", async () => {
    const response = await POST(request(await docxFile()));
    expect(response.status).toBe(200);
    expect((await response.json()).cv).toMatchObject({ firstName: "Maria", lastName: "Muster", workExperience: [], cvSource: "pdf" });
    expect(mocks.ai.mock.calls[0][1]).toContain("Maria Muster");
  });
  it("rejects invalid AI field types even when JSON is valid", async () => {
    mocks.ai.mockResolvedValue('{"firstName":"Maria","workExperience":"wrong"}');
    const response = await POST(request(await docxFile()));
    expect(response.status).toBe(502);
    expect((await response.json()).code).toBe("AI_INVALID_OUTPUT");
  });
  it("preserves the classified AI failure and attaches an app request ID", async () => {
    mocks.ai.mockRejectedValue(new ApiErrorResponse("Die KI hat nicht rechtzeitig geantwortet.", 504, "AI_TIMEOUT"));
    const response = await POST(request(await docxFile()));
    expect(response.status).toBe(504);
    expect(await response.json()).toMatchObject({ code: "AI_TIMEOUT", error: "Die KI hat nicht rechtzeitig geantwortet." });
    expect(response.headers.get("X-Request-ID")).toMatch(/^[0-9a-f-]{36}$/);
  });
  it("hides unexpected errors that may contain CV content", async () => {
    mocks.ai.mockRejectedValue(new Error("PRIVATE_CV_CONTENT"));
    const response = await POST(request(await docxFile()));
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.code).toBe("AI_UNKNOWN");
    expect(JSON.stringify(body)).not.toContain("PRIVATE_CV_CONTENT");
  });
});
