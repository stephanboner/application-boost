import { describe, expect, it } from "vitest";
import { extractJobText, htmlToJobText, isRecognisedJob, JOB_TEXT_LIMIT } from "../job-text";
const description = '<p>Planung &amp; Moderation strategischer Workshops. </p>'.repeat(8);
const job = { "@type": "JobPosting", title: "Strategische Leitung", description, hiringOrganization: { name: "Testinstitut" }, url: "https://example.ch/jobs/1" };
const script = (data: unknown) => `<script type="application/ld+json">${JSON.stringify(data)}</script>`;
describe("job page extraction", () => {
  it.each([job, [job], { "@graph": [job] }])("keeps structured vacancy details and discards related jobs", (data) => {
    const text = extractJobText(`<nav>${'Navigation '.repeat(1000)}</nav>${script(data)}<main>Andere Stelle: Sales</main>`);
    expect(text).toContain("Arbeitgeber: Testinstitut");
    expect(text).toContain("Planung & Moderation");
    expect(text).not.toContain("Navigation"); expect(text).not.toContain("Sales");
  });
  it("selects the matching detail URL when several vacancies exist", () => {
    const text = extractJobText(script([{ ...job, title: "Wrong", url: "https://example.ch/jobs/2" }, job]), job.url);
    expect(text).toContain("Strategische Leitung"); expect(text).not.toContain("Wrong");
  });
  it("falls back to visible content instead of guessing among unrelated postings", () => {
    expect(extractJobText(`${script([job, job])}<main>Aktuelle Stelle</main>`)).toBe("Aktuelle Stelle");
  });
  it("handles broken metadata and strips scripts, navigation and entities", () => {
    expect(extractJobText('<script type="application/ld+json">invalid</script><main><nav>Menu</nav><script>secret()</script><p>Forschung &#38; Entwicklung &#xFC; &nbsp; &quot;Test&quot;</p></main><footer>Links</footer>'))
      .toBe('Forschung & Entwicklung ü "Test"');
    expect(htmlToJobText('&#x110000; &#0; &#xD800;')).toBe("");
  });
  it("bounds large extracted descriptions", () => {
    const text = extractJobText(script({ ...job, description: description.repeat(100) }));
    expect(text).toHaveLength(JOB_TEXT_LIMIT);
  });
});


describe("vacancy recognition", () => {
  const job = { title: "Strategische Leitung", tasks: ["Strategie entwickeln"], mustHave: [], niceToHave: [] };
  it.each(["Unbekannt", "Unknown", "N/A", "Nicht angegeben", " — "])("rejects placeholder title %s", (title) => {
    expect(isRecognisedJob({ ...job, title })).toBe(false);
  });
  it("requires at least one actual task or requirement", () => {
    expect(isRecognisedJob({ ...job, tasks: [" "] })).toBe(false);
    expect(isRecognisedJob({ ...job, tasks: [], mustHave: ["Doktorat"] })).toBe(true);
    expect(isRecognisedJob(job)).toBe(true);
  });
});
