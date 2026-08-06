// Text extraction — pulls plain text from uploaded contract files.
// PDF (pdf-parse), DOCX (mammoth), TXT/MD (utf8). Ported from the POC and
// hardened: guards empty results and surfaces a clean error on failure.
export async function extractText(buf: Buffer, mime: string, filename: string): Promise<string> {
  const lower = (filename || "").toLowerCase();
  try {
    if (mime === "application/pdf" || lower.endsWith(".pdf")) {
      const mod: any = await import("pdf-parse");
      const pdf = mod.default || mod;
      const r = await pdf(buf);
      return (r?.text || "").trim();
    }
    if (
      mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      lower.endsWith(".docx")
    ) {
      const mammoth: any = await import("mammoth");
      const r = await mammoth.extractRawText({ buffer: buf });
      return (r?.value || "").trim();
    }
    if (mime.startsWith("text/") || lower.endsWith(".txt") || lower.endsWith(".md")) {
      return buf.toString("utf8").trim();
    }
    return buf.toString("utf8").trim();
  } catch (e: any) {
    throw new Error(`extract_failed: ${e.message}`);
  }
}
