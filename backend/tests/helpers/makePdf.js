// Builds a small, valid PDF with the given number of A4 pages, each with a filled
// rectangle and a line of Helvetica text (a standard font that is not embedded).
export function makePdf(pageCount) {
  const objects = []
  const add = (body) => objects.push(body) && objects.length

  const catalogId = add(null)
  const pagesId = add(null)
  const fontId = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>')

  const pageIds = []
  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber++) {
    const content = `0.1 0.3 0.6 rg 50 600 495 180 re f BT /F1 36 Tf 0 0 0 rg 60 500 Td (Page ${pageNumber}) Tj ET`
    const contentId = add(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`)
    pageIds.push(
      add(
        `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`
      )
    )
  }
  objects[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`
  objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageCount} >>`

  let pdf = '%PDF-1.4\n'
  const offsets = objects.map((body, index) => {
    const offset = pdf.length
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`
    return offset
  })
  const xrefOffset = pdf.length
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  pdf += offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`
  return Buffer.from(pdf, 'latin1')
}
