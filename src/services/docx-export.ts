// Word (.docx) redline export. Produces a document with genuine Word tracked
// changes (w:ins / w:del) for each redline, so reviewers can Accept/Reject them
// natively in Microsoft Word. Also lists the risk score, flagged clauses, and
// missing-clause gaps.
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  InsertedTextRun, DeletedTextRun,
} from "docx";

type ClauseRow = {
  clauseType: string; heading?: string | null; severity: string;
  riskScore?: number | null; summary?: string | null;
};
type RedlineRow = {
  original: string; suggested: string; recommendation?: string | null; severity: string;
};

export async function buildRedlineDocx(opts: {
  title: string;
  docType: string;
  riskScore: number | null;
  clauses: ClauseRow[];
  missing: ClauseRow[];
  redlines: RedlineRow[];
  author?: string;
}): Promise<Buffer> {
  const author = opts.author || "Aria";
  const date = new Date().toISOString();
  const children: Paragraph[] = [];

  children.push(new Paragraph({ text: opts.title, heading: HeadingLevel.TITLE }));
  children.push(new Paragraph({
    children: [new TextRun({
      text: `${opts.docType}  ·  Overall risk ${opts.riskScore ?? "N/A"}/100 (higher = worse)`,
      italics: true,
    })],
  }));
  children.push(new Paragraph({ text: "" }));

  // ── Redlines as tracked changes ──
  children.push(new Paragraph({ text: "Proposed Redlines (tracked changes)", heading: HeadingLevel.HEADING_1 }));
  if (opts.redlines.length === 0) {
    children.push(new Paragraph({ text: "No redlines proposed." }));
  }
  let revId = 1;
  for (const r of opts.redlines) {
    children.push(new Paragraph({
      children: [
        new DeletedTextRun({ text: r.original, id: revId++, author, date }),
        new InsertedTextRun({ text: " " + r.suggested, id: revId++, author, date }),
      ],
    }));
    if (r.recommendation) {
      children.push(new Paragraph({
        children: [new TextRun({ text: `Reason (${r.severity}): ${r.recommendation}`, italics: true, size: 18 })],
      }));
    }
    children.push(new Paragraph({ text: "" }));
  }

  // ── Flagged clauses ──
  children.push(new Paragraph({ text: "Flagged Clauses", heading: HeadingLevel.HEADING_1 }));
  if (opts.clauses.length === 0) children.push(new Paragraph({ text: "None." }));
  for (const c of opts.clauses) {
    children.push(new Paragraph({
      children: [new TextRun({
        text: `[${c.severity.toUpperCase()}] ${c.clauseType}${c.heading ? " — " + c.heading : ""}` +
          (c.riskScore != null ? ` (risk ${c.riskScore}/100)` : ""),
        bold: true,
      })],
    }));
    if (c.summary) children.push(new Paragraph({ text: c.summary }));
  }
  children.push(new Paragraph({ text: "" }));

  // ── Missing clauses ──
  children.push(new Paragraph({ text: "Missing / Recommended Clauses", heading: HeadingLevel.HEADING_1 }));
  if (opts.missing.length === 0) children.push(new Paragraph({ text: "None." }));
  for (const m of opts.missing) {
    children.push(new Paragraph({
      children: [new TextRun({ text: `[${m.severity.toUpperCase()}] ${m.clauseType}`, bold: true })],
    }));
    if (m.summary) children.push(new Paragraph({ text: m.summary }));
  }

  const doc = new Document({
    creator: "TSP AI Contract — Aria",
    title: opts.title,
    sections: [{ children }],
  });
  return Packer.toBuffer(doc);
}
