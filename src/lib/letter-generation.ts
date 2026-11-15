import "server-only";
import { createClaudeStream, AI_CONFIG } from "@/lib/anthropic";
import { buildWritingPrompt } from "@/lib/prompts";
import { matchCVWithJob } from "@/lib/cv-matching";
import { encrypt } from "@/lib/encryption";
import { childLogger } from "@/lib/logger";
import type { SupabaseServerClient } from "@/lib/api-helpers";
import type { GenerateRequestInput } from "@/lib/schemas";
import type { CVProfile, CVMatchResult, ParsedJob } from "@/types";

const log = childLogger({ module: "letter-generation" });

export async function createLetterResponse(req: Request, input: GenerateRequestInput, cv: CVProfile,
  userId: string, supabase: SupabaseServerClient): Promise<Response> {
  const { jobData, tone, length, contactPerson, letterLanguage, qualifyAnswers, companyAddress, applicationId } = input;
  // === STUFE 2: CV-Matcher ===
  const assessment = await matchCVWithJob(cv, jobData);
  const match: CVMatchResult = assessment ?? { topMatches: [], gaps: [], keywords: [], matchScore: null };

  // === STUFE 3: Schreiben – STREAMING ===
  const { system, user: userMsg } = buildWritingPrompt(
    cv,
    jobData as ParsedJob,
    match,
    tone,
    length,
    contactPerson,
    letterLanguage,
    qualifyAnswers,
    companyAddress
  );

  const streamAbort = new AbortController();
  const abortStream = () => streamAbort.abort();
  req.signal.addEventListener("abort", abortStream, { once: true });
  if (req.signal.aborted) abortStream();
  let claudeStream;
  try {
    claudeStream = await createClaudeStream(system, userMsg, AI_CONFIG.writer, streamAbort.signal);
  } catch (err) {
    req.signal.removeEventListener("abort", abortStream);
    throw err;
  }
  let cancelled = false;

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const sendEvent = (event: string, data: string) => {
        if (!cancelled && !streamAbort.signal.aborted) {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${data}\n\n`));
        }
      };

      sendEvent("keywords", JSON.stringify(match.keywords ?? []));
      const safeScore = match.matchScore === null ? null : Math.round(match.matchScore);
      sendEvent("matchScore", JSON.stringify(safeScore));

      let fullLetter = "";
      let stopReason: string | null = null;
      let complete = false;
      let inputTokens = 0;
      let outputTokens = 0;
      const started = Date.now();

      try {
        if (streamAbort.signal.aborted) return;
        for await (const event of claudeStream) {
          if (event.type === "message_start") inputTokens = event.message.usage.input_tokens;
          if (event.type === "message_delta") {
            stopReason = event.delta.stop_reason ?? stopReason;
            outputTokens = event.usage.output_tokens;
          }
          if (event.type === "message_stop") complete = true;
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            const chunk = event.delta.text;
            fullLetter += chunk;
            sendEvent("chunk", JSON.stringify(chunk));
          }
        }

        if (streamAbort.signal.aborted) return;
        if (!fullLetter.trim()) throw new Error("Claude hat kein Schreiben geliefert");
        if (!complete || stopReason !== "end_turn") throw new Error("KI-Schreiben ist unvollständig");
        log.info({ inputTokens, outputTokens, stopReason, durationMs: Date.now() - started }, "AI letter stream finished");

        // Im Verlauf persistieren — UPDATE bei applicationId, sonst INSERT
        try {
          const wordCount = fullLetter.split(/\s+/).filter(Boolean).length;
          const payload = {
            job_title: jobData.title,
            company: jobData.company,
            letter_enc: encrypt(fullLetter),
            tone,
            language: letterLanguage,
            word_count: wordCount,
          };

          let savedId: string | null = null;

          if (applicationId) {
            // Update existing application (Regenerate-Flow)
            const { data: updated, error: updateErr } = await supabase
              .from("applications")
              .update({ ...payload, updated_at: new Date().toISOString() })
              .eq("id", applicationId)
              .eq("user_id", userId)
              .select("id")
              .single();
            if (updateErr) throw updateErr;
            savedId = updated?.id ?? null;
          } else {
            // Neu anlegen (Fresh-Flow)
            const { data: inserted, error: insertErr } = await supabase
              .from("applications")
              .insert({ user_id: userId, ...payload })
              .select("id")
              .single();
            if (insertErr) throw insertErr;
            savedId = inserted?.id ?? null;
          }

          if (!savedId) throw new Error("Gespeicherte Bewerbung hat keine ID");
          sendEvent("applicationId", JSON.stringify(savedId));
        } catch (saveErr) {
          log.error({ err: saveErr, userId: userId }, "Application save failed");
          sendEvent("error", JSON.stringify({ message: "Das Schreiben konnte nicht gespeichert werden. Bitte erneut versuchen." }));
          return;
        }

        sendEvent("done", "true");
      } catch (err) {
        if (!streamAbort.signal.aborted) {
          log.error({ err, userId: userId }, "Streaming failed");
          sendEvent("error", JSON.stringify({ message: "Generierung fehlgeschlagen" }));
        }
      } finally {
        req.signal.removeEventListener("abort", abortStream);
        if (!cancelled) controller.close();
      }
    },
    cancel() {
      cancelled = true;
      streamAbort.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
