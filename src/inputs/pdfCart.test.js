import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { extractPdfLines, parseCartLines, parsePrice } from './pdfCart.js'

const pdf = (f) => Uint8Array.from(readFileSync(new URL(`../../sample-data/${f}`, import.meta.url))).buffer

test('sample cart PDF gives the same items as cart.csv', async () => {
  const { data, errors } = parseCartLines(await extractPdfLines(pdf('cart.pdf')))
  assert.deepEqual(errors, [])
  assert.deepEqual(data.map((d) => [d.itemId, d.product, d.brand, d.platform, d.basePrice]), [
    ['ITEM-01', 'Cushion Cover', 'Natura Casa', 'Amazon India', 1299],
    ['ITEM-02', 'Bed Sheet Set', 'Natura Casa', 'Flipkart', 849],
    ['ITEM-03', 'Wall Shelf', 'LivSpace Pro', 'Amazon India', 599],
    ['ITEM-04', 'Ceramic Vase', 'LivSpace Pro', 'Noon', 2499],
    ['ITEM-05', 'Cutting Board', 'Nordic Basics', 'Amazon India', 449],
    ['ITEM-06', 'Desk Organiser', 'Nordic Basics', 'Flipkart', 899],
  ])
})

test('malformed rows are skipped with a reason; good rows still load', async () => {
  const { data, errors } = parseCartLines(await extractPdfLines(pdf('cart-malformed.pdf')))
  assert.deepEqual(data.map((d) => d.product), ['Cushion Cover', 'Wall Shelf'])
  assert.equal(errors.length, 2)
  assert.match(errors[0], /Mystery Lamp.*TBD/)
  assert.match(errors[1], /missing brand/)
})

test('PDF without the expected header is rejected', () => {
  const { data, errors } = parseCartLines([[{ x: 0, str: 'Invoice' }], [{ x: 0, str: 'Thanks for shopping' }]])
  assert.equal(data.length, 0)
  assert.match(errors[0], /table header/)
})

test('price formats', () => {
  assert.equal(parsePrice('Rs.1,299'), 1299)
  assert.equal(parsePrice('₹ 849'), 849)
  assert.equal(parsePrice('INR 2499.00'), 2499)
  assert.equal(parsePrice('TBD'), null)
  assert.equal(parsePrice('Rs.0'), null)
})
