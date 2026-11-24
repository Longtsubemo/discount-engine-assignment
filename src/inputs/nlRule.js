/**
 * nlRule.js
 *
 * Natural-language rule input: plain English → LLM → validated DiscountRule.
 * The LLM call lives server-side (api/parse-rule.js) so the API key never
 * reaches the browser. Everything the LLM returns is untrusted and goes
 * through validateParsedRule before it can reach the engine.
 */

/**
 * Sends the text to the parse endpoint. Returns the raw LLM JSON or throws
 * with a message that is safe to show the user.
 */
export async function requestRuleParse(text, context) {
  let res
  try {
    res = await fetch('/api/parse-rule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, ...context }),
    })
  } catch {
    throw new Error('Could not reach the rule parser. Check your connection and try again.')
  }
  const body = await res.json().catch(() => null)
  if (!res.ok || !body) throw new Error(body?.error || `Rule parser failed (HTTP ${res.status}).`)
  return body
}

/**
 * Turns the LLM's JSON into a DiscountRule, or explains why it can't.
 *
 * raw:   { status, reason, scope, applies_to, type, value, stackable, min_cart_value }
 * ruleId: id to assign to the new rule
 * known: { brands: string[], platforms: string[] } — names in the current cart/rules
 *
 * Returns { rule, warnings } or { error }.
 */
export function validateParsedRule(raw, ruleId, known = { brands: [], platforms: [] }) {
  if (!raw || typeof raw !== 'object') return { error: 'The parser returned no rule. Please rephrase.' }
  if (raw.status !== 'ok') {
    return { error: raw.reason || 'That description is too vague to become a rule. Say what the discount is, and who or what it applies to.' }
  }

  const scope = String(raw.scope ?? '').toLowerCase()
  const type = String(raw.type ?? '').toLowerCase()
  const value = Number(raw.value)
  const appliesTo = String(raw.applies_to ?? '').trim()
  const minCartValue = Number(raw.min_cart_value)

  if (!['brand', 'platform', 'cart'].includes(scope)) return { error: `Unknown scope "${raw.scope}". A rule must target a brand, a platform, or the whole cart.` }
  if (!['percentage', 'flat'].includes(type)) return { error: `Unknown discount type "${raw.type}". Use a percentage or a flat rupee amount.` }
  if (!Number.isFinite(value) || value <= 0) return { error: 'The discount amount is missing. Say how much off, e.g. "15% off" or "Rs.100 off".' }
  if (type === 'percentage' && value > 100) return { error: `${value}% off is more than the full price. Use a percentage up to 100.` }
  if (scope !== 'cart' && !appliesTo) return { error: `Which ${scope} does this apply to? Name it, e.g. "Natura Casa" or "Flipkart".` }
  if (scope === 'cart' && (!Number.isFinite(minCartValue) || minCartValue <= 0)) {
    return { error: 'A cart offer needs a minimum cart value, e.g. "if the cart is over Rs.5,000".' }
  }

  const warnings = []
  const pool = scope === 'brand' ? known.brands : scope === 'platform' ? known.platforms : []
  if (scope !== 'cart' && pool.length && !pool.some((n) => n.toLowerCase() === appliesTo.toLowerCase())) {
    warnings.push(`No ${scope} called "${appliesTo}" is in the current cart, so this rule won't change any prices yet.`)
  }

  return {
    rule: {
      ruleId,
      scope,
      appliesTo: scope === 'cart' ? 'Entire cart' : appliesTo,
      type,
      value,
      stackable: scope !== 'cart' && raw.stackable === true, // the engine never stacks cart rules
      minCartValue: scope === 'cart' ? minCartValue : null,
    },
    warnings,
  }
}

/** Next free id in the RULE-NN sequence. */
export function nextRuleId(rules) {
  const max = rules.reduce((m, r) => Math.max(m, Number(r.ruleId.match(/(\d+)$/)?.[1] ?? 0)), 0)
  return `RULE-${String(max + 1).padStart(2, '0')}`
}
