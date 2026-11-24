import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateParsedRule, nextRuleId } from './nlRule.js'

const known = { brands: ['Natura Casa', 'LivSpace Pro'], platforms: ['Amazon India', 'Flipkart'] }
const ok = (o) => ({ status: 'ok', reason: '', applies_to: '', stackable: false, min_cart_value: 0, ...o })

test('the three examples from the brief parse into rules', () => {
  assert.deepEqual(validateParsedRule(ok({ scope: 'brand', applies_to: 'Natura Casa', type: 'percentage', value: 20, stackable: true }), 'RULE-05', known).rule,
    { ruleId: 'RULE-05', scope: 'brand', appliesTo: 'Natura Casa', type: 'percentage', value: 20, stackable: true, minCartValue: null })
  assert.equal(validateParsedRule(ok({ scope: 'platform', applies_to: 'Flipkart', type: 'flat', value: 100 }), 'R', known).rule.stackable, false)
  assert.equal(validateParsedRule(ok({ scope: 'cart', type: 'percentage', value: 10, min_cart_value: 5000 }), 'R', known).rule.minCartValue, 5000)
})

test('unresolvable input surfaces the reason, not a crash', () => {
  assert.equal(validateParsedRule({ status: 'unresolvable', reason: 'How much off, and above what cart value?' }, 'R', known).error,
    'How much off, and above what cart value?')
})

test('invalid LLM output is rejected', () => {
  assert.ok(validateParsedRule(null, 'R').error)
  assert.ok(validateParsedRule(ok({ scope: 'category', type: 'flat', value: 5, applies_to: 'x' }), 'R').error)
  assert.ok(validateParsedRule(ok({ scope: 'brand', applies_to: 'Natura Casa', type: 'percentage', value: 150 }), 'R').error)
  assert.ok(validateParsedRule(ok({ scope: 'brand', applies_to: 'Natura Casa', type: 'flat', value: 0 }), 'R').error)
  assert.ok(validateParsedRule(ok({ scope: 'brand', applies_to: '', type: 'flat', value: 50 }), 'R').error)
  assert.ok(validateParsedRule(ok({ scope: 'cart', type: 'percentage', value: 10, min_cart_value: 0 }), 'R').error)
})

test('unknown brand is allowed but warned about', () => {
  const r = validateParsedRule(ok({ scope: 'brand', applies_to: 'Ikea', type: 'flat', value: 50 }), 'R', known)
  assert.equal(r.warnings.length, 1)
})

test('nextRuleId continues the sequence', () => {
  assert.equal(nextRuleId([{ ruleId: 'RULE-01' }, { ruleId: 'RULE-04' }]), 'RULE-05')
  assert.equal(nextRuleId([]), 'RULE-01')
})

test('cart rules are never stackable, whatever the parser says', () => {
  const { rule } = validateParsedRule(ok({ scope: 'cart', type: 'flat', value: 300, stackable: true, min_cart_value: 4000 }), 'R')
  assert.equal(rule.stackable, false)
})
