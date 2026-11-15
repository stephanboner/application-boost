/** Static provider-side contract. No user data belongs in a cached JSON schema.
 * Keep local Zod validation too: provider grammar does not enforce string/array limits.
 * https://platform.claude.com/docs/en/build-with-claude/structured-outputs
 */
export const JOB_OUTPUT_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    title: { type: "string", description: "Exakter Jobtitel, höchstens 300 Zeichen." },
    company: { type: "string", description: "Arbeitgeber, höchstens 300 Zeichen." },
    industry: { type: ["string", "null"] },
    location: { type: ["string", "null"] },
    tasks: { type: "array", items: { type: "string" }, description: "Höchstens 5 kurze Kernaufgaben, je höchstens 1000 Zeichen." },
    mustHave: { type: "array", items: { type: "string" }, description: "Höchstens 5 zwingende Anforderungen, je höchstens 1000 Zeichen." },
    niceToHave: { type: "array", items: { type: "string" }, description: "Höchstens 3 Wünsche, je höchstens 1000 Zeichen." },
    tone: { type: "string", enum: ["formal", "casual", "startup"] },
    language: { type: "string", enum: ["de", "fr", "it", "en", "rm", "uk", "sr", "sq", "hr", "pt", "es"] },
    contactPerson: { type: ["string", "null"], description: "Name als Text, keine verschachtelte Kontaktstruktur." },
    address: { type: ["string", "null"], description: "Adresse als Text, keine verschachtelte Adressstruktur." },
  },
  required: ["title", "company", "industry", "location", "tasks", "mustHave", "niceToHave", "tone", "language", "contactPerson", "address"],
  additionalProperties: false,
};
