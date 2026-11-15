import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ reserve: vi.fn(), create: vi.fn(), stream: vi.fn(), options: vi.fn(), logError: vi.fn() }));
vi.mock("@/lib/ai-budget", () => ({ reserveAIQuota: mocks.reserve }));
vi.mock("@/lib/logger", () => {
  const log = { info: vi.fn(), error: mocks.logError };
  return { childLogger: () => log, logger: log };
});
vi.mock("@anthropic-ai/sdk", async (original) => {
  const sdk = await original<typeof import("@anthropic-ai/sdk")>();
  class Client {
    static APIConnectionError = sdk.default.APIConnectionError;
    static APIConnectionTimeoutError = sdk.default.APIConnectionTimeoutError;
    static APIError = sdk.default.APIError;
    messages = { create: mocks.create, stream: mocks.stream };
    constructor(options: unknown) { mocks.options(options); }
  }
  return { default: Client };
});
import Anthropic from "@anthropic-ai/sdk";
import { AI_CONFIG, callClaude, createClaudeStream } from "../anthropic";
const config = { model: "test-model", max_tokens: 400, temperature: 0.1 };
const complete = { model: "test-model", stop_reason: "end_turn", usage: { input_tokens: 10, output_tokens: 3 }, content: [{ type: "text", text: "result" }] };

describe("budgeted AI transport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    mocks.reserve.mockResolvedValue(undefined);
    mocks.create.mockResolvedValue(complete);
    mocks.stream.mockReturnValue({});
  });
  it("disables SDK retries so every paid attempt reserves quota", async () => {
    expect(await callClaude("system", "user", config)).toBe("result");
    expect(mocks.options).toHaveBeenCalledWith({ apiKey: "test-key", maxRetries: 0, timeout: 20000 });
    expect(mocks.reserve).toHaveBeenCalledTimes(1);
    expect(mocks.reserve.mock.invocationCallOrder[0]).toBeLessThan(mocks.create.mock.invocationCallOrder[0]);
  });
  it("sends the static job contract using native structured outputs and accounts for it", async () => {
    await callClaude("system", "source", AI_CONFIG.jobParser);
    expect(mocks.create.mock.calls[0][0].output_config).toEqual({ format: { type: "json_schema", schema: AI_CONFIG.jobParser.outputSchema } });
    expect(mocks.reserve).toHaveBeenCalledWith("system", expect.stringContaining('"additionalProperties":false'), 2000);
  });
  it("keeps ordinary text requests unconstrained", async () => {
    await callClaude("system", "source", config);
    expect(mocks.create.mock.calls[0][0]).not.toHaveProperty("output_config");
  });
  it("reserves a second quota slot for a transient retry", async () => {
    mocks.create.mockRejectedValueOnce(new Anthropic.APIConnectionError({ message: "test transport failure" }));
    expect(await callClaude("system", "user", config)).toBe("result");
    expect(mocks.reserve).toHaveBeenCalledTimes(2);
    expect(mocks.create).toHaveBeenCalledTimes(2);
    expect(mocks.reserve.mock.invocationCallOrder[1]).toBeLessThan(mocks.create.mock.invocationCallOrder[1]);
  });
  it("does not retry when the retry quota is denied", async () => {
    mocks.create.mockRejectedValueOnce(new Anthropic.APIConnectionError({ message: "test transport failure" }));
    mocks.reserve.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("quota denied"));
    await expect(callClaude("system", "user", config)).rejects.toThrow("quota denied");
    expect(mocks.create).toHaveBeenCalledTimes(1);
  });
  it.each([
    ["max_tokens", "AI_OUTPUT_LIMIT", 502],
    ["refusal", "AI_REFUSAL", 422],
    ["tool_use", "AI_INCOMPLETE", 502],
  ])("rejects incomplete answers (%s) with a safe reason and no retry", async (stop_reason, code, status) => {
    mocks.create.mockResolvedValue({ ...complete, stop_reason });
    await expect(callClaude("system", "user", config)).rejects.toMatchObject({ code, status });
    expect(mocks.create).toHaveBeenCalledTimes(1);
  });
  it("rejects empty output with a distinct reason", async () => {
    mocks.create.mockResolvedValue({ ...complete, content: [] });
    await expect(callClaude("system", "user", config)).rejects.toMatchObject({ code: "AI_EMPTY_OUTPUT", status: 502 });
    expect(mocks.reserve).toHaveBeenCalledTimes(1);
  });
  it.each([
    [400, "AI_REQUEST_REJECTED", 502, 1],
    [402, "AI_BILLING", 503, 1],
    [401, "AI_CONFIGURATION", 503, 1],
    [403, "AI_CONFIGURATION", 503, 1],
    [404, "AI_MODEL_UNAVAILABLE", 503, 1],
    [429, "AI_PROVIDER_LIMIT", 503, 2],
    [500, "AI_PROVIDER_UNAVAILABLE", 503, 2],
    [504, "AI_TIMEOUT", 504, 2],
    [529, "AI_PROVIDER_UNAVAILABLE", 503, 2],
  ])("classifies provider status %s without exposing provider bodies", async (providerStatus, code, status, attempts) => {
    mocks.create.mockRejectedValue(new Anthropic.APIError(providerStatus,
      { error: { message: "PRIVATE_PROVIDER_BODY" } }, "PRIVATE_PROVIDER_MESSAGE", { "request-id": "req_test123" }));
    const failure = await callClaude("PRIVATE_SYSTEM", "PRIVATE_CV", config).catch((err) => err);
    expect(failure).toMatchObject({ code, status });
    expect(failure.message).not.toContain("PRIVATE_");
    expect(mocks.reserve).toHaveBeenCalledTimes(attempts);
    expect(mocks.create).toHaveBeenCalledTimes(attempts);
    expect(mocks.logError).toHaveBeenLastCalledWith(expect.objectContaining({
      failureCode: code, providerStatus, providerRequestId: "req_test123", willRetry: false,
    }), "AI request failed");
    expect(JSON.stringify(mocks.logError.mock.calls)).not.toContain("PRIVATE_");
  });
  it("classifies exhausted client timeouts and reserves every attempt", async () => {
    mocks.create.mockRejectedValue(new Anthropic.APIConnectionTimeoutError());
    await expect(callClaude("system", "user", config)).rejects.toMatchObject({ code: "AI_TIMEOUT", status: 504 });
    expect(mocks.reserve).toHaveBeenCalledTimes(2);
    expect(mocks.logError).toHaveBeenLastCalledWith(expect.objectContaining({ failureCode: "AI_TIMEOUT", willRetry: false }), "AI request failed");
  });
  it("gives CV analysis enough time without sending transport options to the API", async () => {
    await callClaude("system", "user", AI_CONFIG.cvParser);
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ max_tokens: 4096 }),
      { timeout: expect.any(Number) });
    const [body, options] = mocks.create.mock.calls[0];
    expect(body).not.toHaveProperty("timeoutMs");
    expect(options.timeout).toBeGreaterThan(40_000);
    expect(options.timeout).toBeLessThanOrEqual(45_000);
  });
  it("does not start another paid CV attempt after its deadline", async () => {
    const started = Date.now();
    const clock = vi.spyOn(Date, "now").mockReturnValue(started);
    mocks.create.mockImplementationOnce(async () => {
      clock.mockReturnValue(started + 45_000);
      throw new Anthropic.APIConnectionTimeoutError();
    });
    try {
      await expect(callClaude("system", "user", AI_CONFIG.cvParser)).rejects.toMatchObject({ code: "AI_TIMEOUT" });
      expect(mocks.create).toHaveBeenCalledTimes(1);
      expect(mocks.reserve).toHaveBeenCalledTimes(1);
    } finally { clock.mockRestore(); }
  });
  it("keeps a fast transient matching retry inside the original deadline", async () => {
    const started = Date.now();
    const clock = vi.spyOn(Date, "now").mockReturnValue(started);
    mocks.create.mockImplementationOnce(async () => {
      clock.mockReturnValue(started + 12_000);
      throw new Anthropic.APIConnectionError({ message: "temporary" });
    });
    try {
      expect(await callClaude("system", "user", AI_CONFIG.cvMatcher)).toBe("result");
      expect(mocks.create.mock.calls[0][1].timeout).toBe(30_000);
      expect(mocks.create.mock.calls[1][1].timeout).toBe(18_000);
      expect(mocks.reserve).toHaveBeenCalledTimes(2);
    } finally { clock.mockRestore(); }
  });
  it("does not copy unexpected error messages or arbitrary request IDs into logs", async () => {
    mocks.create.mockRejectedValueOnce(new Error("PRIVATE_ERROR_CONTENT"));
    await expect(callClaude("system", "user", config)).rejects.toMatchObject({ code: "AI_UNKNOWN", status: 500 });
    mocks.create.mockRejectedValueOnce(new Anthropic.APIError(400, {}, "PRIVATE_ERROR_CONTENT", { "request-id": "PRIVATE ID CONTENT" }));
    await expect(callClaude("system", "user", config)).rejects.toMatchObject({ code: "AI_REQUEST_REJECTED" });
    expect(mocks.logError.mock.calls.every(([fields]) => fields.providerRequestId === undefined)).toBe(true);
    expect(JSON.stringify(mocks.logError.mock.calls)).not.toContain("PRIVATE");
  });
  it("does not begin a stream without quota", async () => {
    mocks.reserve.mockRejectedValue(new Error("quota denied"));
    await expect(createClaudeStream("system", "user", config, new AbortController().signal)).rejects.toThrow("quota denied");
    expect(mocks.stream).not.toHaveBeenCalled();
  });
  it("propagates cancellation to the SDK stream", async () => {
    const abort = new AbortController();
    await createClaudeStream("system", "user", config, abort.signal);
    const signal = mocks.stream.mock.calls[0][1].signal as AbortSignal;
    expect(signal.aborted).toBe(false);
    abort.abort();
    expect(signal.aborted).toBe(true);
  });
  it("reports absent credentials before making a paid call", async () => {
    vi.resetModules();
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const fresh = await import("../anthropic");
    await expect(fresh.callClaude("system", "user", config)).rejects.toMatchObject({ code: "AI_CONFIGURATION", status: 503 });
    expect(mocks.reserve).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
