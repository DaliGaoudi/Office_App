/*
 * A very small .docx writer, for the demo build only.
 *
 * The real app generates its Word acts server-side with docxtemplater against
 * server/assets/template_cnss.docx. The demo has no server, but "generate the
 * act" is the end of the CNSS workflow and a download that fails — or hands back
 * a text file wearing a .docx extension — would misrepresent the product.
 *
 * So this builds a genuine OOXML package: a ZIP holding the three parts Word
 * needs to open a document. Entries are STORED (compression method 0), which
 * keeps the writer to a CRC-32 and a couple of record headers instead of pulling
 * a deflate library into the bundle. The documents are small, so the size costs
 * nothing.
 */

/* ── CRC-32 (the one checksum the ZIP format requires) ── */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/* ── ZIP writer, stored entries only ── */
function zip(files) {
  const enc = new TextEncoder();
  const parts = [];
  const central = [];
  let offset = 0;

  const u16 = (n) => [n & 0xff, (n >>> 8) & 0xff];
  const u32 = (n) => [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];

  for (const { name, content } of files) {
    const nameBytes = enc.encode(name);
    const data = enc.encode(content);
    const sum = crc32(data);

    // Local file header
    const local = [
      ...u32(0x04034b50), ...u16(20), ...u16(0), ...u16(0),
      ...u16(0), ...u16(0),                    // mtime/mdate — fixed, keeps output deterministic
      ...u32(sum), ...u32(data.length), ...u32(data.length),
      ...u16(nameBytes.length), ...u16(0),
    ];
    parts.push(new Uint8Array(local), nameBytes, data);

    central.push({ name: nameBytes, sum, size: data.length, offset });
    offset += local.length + nameBytes.length + data.length;
  }

  const dirStart = offset;
  for (const e of central) {
    const header = [
      ...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0), ...u16(0),
      ...u16(0), ...u16(0),
      ...u32(e.sum), ...u32(e.size), ...u32(e.size),
      ...u16(e.name.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0),
      ...u32(0), ...u32(e.offset),
    ];
    parts.push(new Uint8Array(header), e.name);
    offset += header.length + e.name.length;
  }

  parts.push(new Uint8Array([
    ...u32(0x06054b50), ...u16(0), ...u16(0),
    ...u16(central.length), ...u16(central.length),
    ...u32(offset - dirStart), ...u32(dirStart), ...u16(0),
  ]));

  return new Blob(parts, {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
}

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/* A paragraph: { text, bold, size (half-points), align, spaceAfter, pageBreakBefore } */
function paragraph(p) {
  const runProps = [
    p.bold ? '<w:b/>' : '',
    p.size ? `<w:sz w:val="${p.size}"/><w:szCs w:val="${p.size}"/>` : '',
  ].join('');
  const paraProps = [
    p.pageBreakBefore ? '<w:pageBreakBefore/>' : '',
    p.align ? `<w:jc w:val="${p.align}"/>` : '',
    `<w:spacing w:after="${p.spaceAfter ?? 120}"/>`,
  ].join('');
  return `<w:p><w:pPr>${paraProps}</w:pPr>`
    + `<w:r><w:rPr>${runProps}</w:rPr><w:t xml:space="preserve">${esc(p.text)}</w:t></w:r></w:p>`;
}

/* A table from a header row + body rows (arrays of strings). */
function table(head, rows) {
  const cell = (text, bold) =>
    `<w:tc><w:tcPr><w:tcW w:w="0" w:type="auto"/></w:tcPr>`
    + `<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:after="0"/></w:pPr>`
    + `<w:r><w:rPr>${bold ? '<w:b/>' : ''}<w:sz w:val="18"/></w:rPr>`
    + `<w:t xml:space="preserve">${esc(text)}</w:t></w:r></w:p></w:tc>`;
  const row = (cells, bold) => `<w:tr>${cells.map((c) => cell(c, bold)).join('')}</w:tr>`;
  const borders = ['top', 'left', 'bottom', 'right', 'insideH', 'insideV']
    .map((s) => `<w:${s} w:val="single" w:sz="6" w:color="000000"/>`).join('');
  return `<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/>`
    + `<w:tblBorders>${borders}</w:tblBorders></w:tblPr>`
    + row(head, true) + rows.map((r) => row(r, false)).join('') + '</w:tbl>';
}

/*
 * Build a .docx Blob. `blocks` is a list of
 *   { type: 'p', ...paragraph props } | { type: 'table', head, rows }
 */
export function buildDocx(blocks) {
  const body = blocks.map((b) =>
    b.type === 'table' ? table(b.head, b.rows) : paragraph(b)
  ).join('');

  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>
  <w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/></w:sectPr></w:body>
</w:document>`;

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

  return zip([
    { name: '[Content_Types].xml', content: contentTypes },
    { name: '_rels/.rels', content: rels },
    { name: 'word/document.xml', content: document },
  ]);
}

export const P = (text, props = {}) => ({ type: 'p', text, ...props });
export const TABLE = (head, rows) => ({ type: 'table', head, rows });
