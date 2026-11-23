// Run with: npm test  (Node's built-in test runner, no extra deps)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parseRulesCSV, parseCartCSV } from './csvParser.js'
import { processCart, applyCartOffer, calculateDiscountAmount } from './discountEngine.js'

const load = (f) => readFileSync(new URL(`../../sample-data/${f}`, import.meta.url), 'utf8')
const rules = parseRulesCSV(load('rules.csv'))
const cart = parseCartCSV(load('cart.csv'))

test('sample data matches the brief', () => {
  assert.deepEqual(rules.errors, [])
  assert.deepEqual(cart.errors, [])
  const results = processCart(cart.data, rules.data)
  assert.deepEqual(results.map((r) => r.finalPrice), [1104, 629, 509, 2499, 382, 809])
  const summary = applyCartOffer(results, rules.data)
  assert.equal(summary.subtotal, 5932)
  assert.deepEqual(summary.cartOffer, { ruleId: 'RULE-04', saving: 593, label: 'Cart offer: 10% off' })
  assert.equal(summary.finalTotal, 5339)
})

test('cart offer: exactly at threshold applies, Rs.1 below does not', () => {
  const rule = rules.data.find((r) => r.ruleId === 'RULE-04')
  const at = applyCartOffer([{ finalPrice: 4000 }], [rule])
  assert.equal(at.finalTotal, 3600)
  const below = applyCartOffer([{ finalPrice: 3999 }], [rule])
  assert.equal(below.cartOffer, null)
  assert.equal(below.finalTotal, 3999)
  assert.deepEqual(below.nextOffer, { ruleId: 'RULE-04', shortBy: 1 })
})

test('flat discount never makes a price negative', () => {
  assert.equal(calculateDiscountAmount(100, { type: 'flat', value: 150 }), 100)
})

test('cart rule without min_cart_value is rejected', () => {
  const { data, errors } = parseRulesCSV('rule_id,scope,applies_to,type,value,stackable,min_cart_value\nR,cart,,percentage,10,false,\n')
  assert.equal(data.length, 0)
  assert.match(errors[0], /min_cart_value/)
})
