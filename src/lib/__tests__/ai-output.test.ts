import { describe, expect, it } from "vitest";
import { AIOutputError, parseAIOutput } from "../ai-output";
import { cvMatchSchema, cvImportSchema, parsedJobSchema } from "../schemas";

const match = { topMatches: ["Erfahrung"], gaps: [], keywords: ["IT"], matchScore: 82 };
describe("AI response contracts", () => {
  it("accepts complete JSON including Markdown fences", () => {
    expect(parseAIOutput("```json\n" + JSON.stringify(match) + "\n```", cvMatchSchema)).toEqual(match);
  });
  it.each([{}, { ...match, topMatches: "wrong" }, { ...match, matchScore: "82" }, { ...match, matchScore: 101 }])("rejects malformed matches without inventing data", (value) => {
    expect(() => parseAIOutput(JSON.stringify(value), cvMatchSchema)).toThrow(/Format/);
  });
  it("rejects truncated JSON and surrounding explanations", () => {
    expect(() => parseAIOutput('{"matchScore":82', cvMatchSchema)).toThrow(/JSON/);
    expect(() => parseAIOutput('Explanation: ' + JSON.stringify(match), cvMatchSchema)).toThrow(/JSON/);
  });
  it("normalizes missing CV information for manual review, without accepting wrong array types", () => {
    const result = parseAIOutput('{"firstName":"Maria","lastName":null,"phone":null,"location":null}', cvImportSchema);
    expect(result.lastName).toBe("");
    expect(result.phone).toBe("");
    expect(result.cvSource).toBe("pdf");
    expect(() => parseAIOutput('{"firstName":"Maria","skills":"IT"}', cvImportSchema)).toThrow();
    expect(() => parseAIOutput('{}', cvImportSchema)).toThrow();
  });
  it("validates the job parser and removes unexpected fields", () => {
    expect(parseAIOutput('{"title":"IT","company":"Test","unexpected":"ignore"}', parsedJobSchema)).not.toHaveProperty("unexpected");
    expect(() => parseAIOutput('{"title":"IT","company":"Test","tasks":"wrong"}', parsedJobSchema)).toThrow();
  });
  it("classifies format failures without retaining rejected contents", () => {
    for (const [raw, stage] of [['PRIVATE_NOT_JSON', 'json'], ['{"tasks":"PRIVATE_VALUE"}', 'schema']]) {
      try { parseAIOutput(raw, parsedJobSchema); throw new Error("Expected rejection"); }
      catch (error) {
        expect(error).toBeInstanceOf(AIOutputError);
        expect(error).toHaveProperty("stage", stage);
        expect(JSON.stringify(error)).not.toContain("PRIVATE");
      }
    }
  });

  it("normalizes the provider's documented enum capitalization variation only", () => {
    expect(parseAIOutput('{"title":"IT","company":"Test","tone":"Formal","language":"EN"}', parsedJobSchema))
      .toMatchObject({ tone: "formal", language: "en" });
    expect(() => parseAIOutput('{"title":"IT","company":"Test","tone":"PRIVATE_UNSUPPORTED_STYLE"}', parsedJobSchema)).toThrow();
  });

});
