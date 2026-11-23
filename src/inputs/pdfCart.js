/**
 * pdfCart.js
 *
 * PDF cart upload: PDF → text lines with x positions → CartItem[].
 * Expects a table with columns Product, Brand, Platform, Base Price
 * (anything above the header, like "Order #OP-9921", is ignored).
 * Returns { data, errors } — the same shape as parseCartCSV.
 */

const HEADERS = ['product', 'brand', 'platform', 'base price']

/** Reads every page of the PDF into lines of positioned cells: [[{ x, str }]] */
export async function extractPdfLines(arrayBuffer) {
  const inBrowser = typeof window !== 'undefined'
  const pdfjs = inBrowser ? await import('pdfjs-dist') : await import('pdfjs-dist/legacy/build/pdf.mjs') // legacy build for Node tests
  if (inBrowser && !pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
  }
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(arrayBuffer) }).promise
  const lines = []
  for (let p = 1; p <= pdf.numPages; p++) {
    const { items } = await (await pdf.getPage(p)).getTextContent()
    const rows = new Map() // rounded y → cells
    for (const it of items) {
      if (!it.str?.trim()) continue
      const y = Math.round(it.transform[5] / 3) * 3 // same visual line despite sub-pixel drift
      if (!rows.has(y)) rows.set(y, [])
      rows.get(y).push(...splitItem(it))
    }
    ;[...rows.entries()].sort((a, b) => b[0] - a[0]).forEach(([, cells]) => lines.push(cells.sort((a, b) => a.x - b.x)))
  }
  return lines
}

/**
 * A text item may hold a whole monospace line ("Cushion Cover   Natura Casa ...").
 * Split it on runs of 2+ spaces and estimate each piece's x from character width.
 */
function splitItem(it) {
  const charW = it.str.length ? it.width / it.str.length : 0
  const out = []
  const re = /\S+(?: \S+)*/g // words joined by single spaces
  let m
  while ((m = re.exec(it.str))) out.push({ x: it.transform[4] + m.index * charW, str: m[0] })
  return out
}

/** Pure: positioned lines → { data: CartItem[], errors: string[] } */
export function parseCartLines(lines) {
  const headerIdx = lines.findIndex((cells) => {
    const names = cells.map((c) => c.str.trim().toLowerCase())
    return HEADERS.every((h) => names.includes(h))
  })
  if (headerIdx === -1) {
    return { data: [], errors: ['Could not find the table header. The PDF needs columns: Product, Brand, Platform, Base Price.'] }
  }

  const header = lines[headerIdx]
  const colX = HEADERS.map((h) => header.find((c) => c.str.trim().toLowerCase() === h).x)
  const tolerance = 4 // cells may start a little left of their header

  const data = []
  const errors = []
  lines.slice(headerIdx + 1).forEach((cells, i) => {
    const text = cells.map((c) => c.str).join(' ').trim()
    if (!text || /^[-─_=\s]+$/.test(text)) return // separator rule
    const rowNum = i + 1

    const cols = ['', '', '', '']
    for (const c of cells) {
      let col = 0
      colX.forEach((x, k) => { if (c.x >= x - tolerance) col = k })
      cols[col] = (cols[col] + ' ' + c.str).trim()
    }
    const [product, brand, platform, priceText] = cols

    const missing = HEADERS.filter((_, k) => !cols[k])
    if (missing.length) {
      errors.push(`Row ${rowNum} ("${text}"): missing ${missing.join(', ')} — skipped`)
      return
    }
    const price = parsePrice(priceText)
    if (price === null) {
      errors.push(`Row ${rowNum} (${product}): price "${priceText}" isn't a valid amount — skipped`)
      return
    }
    data.push({ itemId: `ITEM-${String(data.length + 1).padStart(2, '0')}`, product, brand, platform, basePrice: price })
  })

  if (!data.length && !errors.length) errors.push('The table has a header but no item rows.')
  return { data, errors }
}

/** "Rs.1,299" / "₹ 849" / "INR 2499.00" / "599" → rupees, or null */
export function parsePrice(s) {
  const m = s.replace(/\s/g, '').match(/^(?:rs\.?|₹|inr)?([\d,]+(?:\.\d+)?)$/i)
  if (!m) return null
  const n = Number(m[1].replace(/,/g, ''))
  return n > 0 ? Math.round(n) : null
}

export async function parseCartPdf(arrayBuffer) {
  try {
    return parseCartLines(await extractPdfLines(arrayBuffer))
  } catch {
    return { data: [], errors: ["Couldn't read this file as a PDF. Is it a valid, unencrypted PDF?"] }
  }
}
