const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const PAGE_MARGIN = 46;
const FONT_SIZE = 9;
const LINE_HEIGHT = 13;
const MAX_LINE_LENGTH = 88;
const MAX_PAGES = 12;
const HEADER_LINES = 4;
const LINES_PER_PAGE = Math.floor((PAGE_HEIGHT - (PAGE_MARGIN * 2)) / LINE_HEIGHT);

const normalisePdfText = (value: string) => value
  .normalize("NFKC")
  .replace(/[\u2018\u2019]/g, "'")
  .replace(/[\u201c\u201d]/g, '"')
  .replace(/[\u2013\u2014]/g, "-")
  .replace(/\u2026/g, "...")
  .replace(/\u20ac/g, "EUR ")
  .replace(/[^\x20-\x7e\xa3\n\r\t]/g, "?");

const wrapLine = (line: string) => {
  const cleaned = line.replace(/\t/g, "  ").trimEnd();
  if (!cleaned) return [""];

  const wrapped: string[] = [];
  let remaining = cleaned;
  while (remaining.length > MAX_LINE_LENGTH) {
    let splitAt = remaining.lastIndexOf(" ", MAX_LINE_LENGTH);
    if (splitAt < Math.floor(MAX_LINE_LENGTH * 0.55)) splitAt = MAX_LINE_LENGTH;
    wrapped.push(remaining.slice(0, splitAt).trimEnd());
    remaining = remaining.slice(splitAt).trimStart();
  }
  wrapped.push(remaining);
  return wrapped;
};

const escapePdfLiteral = (value: string) => {
  let escaped = "";
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (character === "\\" || character === "(" || character === ")") {
      escaped += `\\${character}`;
    } else if (code === 0xa3) {
      escaped += "\\243";
    } else if (code < 0x20 || code > 0x7e) {
      escaped += "?";
    } else {
      escaped += character;
    }
  }
  return escaped;
};

const latin1Bytes = (value: string) => {
  const bytes = new Uint8Array(value.length);
  for (let index = 0; index < value.length; index += 1) {
    bytes[index] = value.charCodeAt(index) & 0xff;
  }
  return bytes;
};

/**
 * Render a deterministic, text-searchable PDF representation of a body-only
 * purchase email. The exact source text remains unaltered in meaning, while
 * links and HTML are reduced to inert text before entering the existing PDF
 * receipt processor.
 */
export const createEmailBodyPdf = ({
  subject,
  senderDomain,
  body,
}: {
  subject: string;
  senderDomain: string | null;
  body: string;
}) => {
  const sourceLines = normalisePdfText(body)
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .flatMap(wrapLine);
  const header = [
    "Email purchase evidence",
    `Subject: ${normalisePdfText(subject || "(no subject)")}`,
    `Sender domain: ${normalisePdfText(senderDomain || "unknown")}`,
    "",
  ].flatMap(wrapLine);
  const maxBodyLines = Math.max(0, (LINES_PER_PAGE * MAX_PAGES) - HEADER_LINES);
  const lines = [...header, ...sourceLines.slice(0, maxBodyLines)];
  const pages: string[][] = [];
  for (let index = 0; index < lines.length; index += LINES_PER_PAGE) {
    pages.push(lines.slice(index, index + LINES_PER_PAGE));
  }
  if (pages.length === 0) pages.push(header);

  const objects = new Map<number, string>();
  const pageObjectIds: number[] = [];
  objects.set(1, "<< /Type /Catalog /Pages 2 0 R >>");
  objects.set(3, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");

  pages.forEach((pageLines, pageIndex) => {
    const pageObjectId = 4 + (pageIndex * 2);
    const contentObjectId = pageObjectId + 1;
    pageObjectIds.push(pageObjectId);
    const content = [
      "BT",
      `/F1 ${FONT_SIZE} Tf`,
      `${LINE_HEIGHT} TL`,
      `${PAGE_MARGIN} ${PAGE_HEIGHT - PAGE_MARGIN} Td`,
      ...pageLines.flatMap((line) => [`(${escapePdfLiteral(line)}) Tj`, "T*"]),
      "ET",
    ].join("\n");
    objects.set(pageObjectId, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentObjectId} 0 R >>`);
    objects.set(contentObjectId, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  });
  objects.set(2, `<< /Type /Pages /Count ${pageObjectIds.length} /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}] >>`);

  const maxObjectId = Math.max(...objects.keys());
  let pdf = "%PDF-1.4\n%\xe2\xe3\xcf\xd3\n";
  const offsets = new Array<number>(maxObjectId + 1).fill(0);
  for (let objectId = 1; objectId <= maxObjectId; objectId += 1) {
    offsets[objectId] = pdf.length;
    pdf += `${objectId} 0 obj\n${objects.get(objectId)}\nendobj\n`;
  }
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${maxObjectId + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let objectId = 1; objectId <= maxObjectId; objectId += 1) {
    pdf += `${String(offsets[objectId]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${maxObjectId + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return latin1Bytes(pdf);
};
