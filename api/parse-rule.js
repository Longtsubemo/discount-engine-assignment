/**
 * POST /api/parse-rule  { text, brands?, platforms? } → raw parsed-rule JSON
 *
 * Vercel serverless function; vite.config.js mounts the same handler in dev.
 * Keeps ANTHROPIC_API_KEY on the server. The browser validates the result
 * (src/inputs/nlRule.js) before it can become a rule.
 */
import Anthropic from '@anthropic-ai/sdk'

const SCHEMA = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['ok', 'unresolvable'] },
    reason: { type: 'string', description: 'If unresolvable: what is missing, phrased as a request to the user. Otherwise empty.' },
    scope: { type: 'string', enum: ['brand', 'platform', 'cart'] },
    applies_to: { type: 'string', description: 'Brand or platform name; empty for cart rules.' },
    type: { type: 'string', enum: ['percentage', 'flat'] },
    value: { type: 'number', description: 'Percent (15 = 15%) or rupees. 0 if not stated.' },
    stackable: { type: 'boolean' },
    min_cart_value: { type: 'number', description: 'Cart rules only: minimum cart total in rupees. 0 otherwise.' },
  },
  required: ['status', 'reason', 'scope', 'applies_to', 'type', 'value', 'stackable', 'min_cart_value'],
  additionalProperties: false,
}

const SYSTEM = `You convert a merchant's plain-English discount description into one structured rule for an e-commerce discount engine.

Scopes:
- brand: applies to every item of one brand (applies_to = brand name)
- platform: applies to every item sold on one marketplace (applies_to = platform name)
- cart: applies to the whole cart total once it reaches min_cart_value (applies_to = "")

Rules:
- stackable is true only if the text says the offer combines/stacks with other offers; otherwise false.
- If the text names a brand or platform that matches one of the known names below (ignoring case or small variations like "Amazon" for "Amazon India"), use the known spelling exactly.
- "more than Rs.X" / "above Rs.X" / "over Rs.X" for a cart means min_cart_value = X.
- Never invent a number. If the discount amount, the target (brand/platform), or a cart threshold is missing or ambiguous, return status "unresolvable" with a short reason telling the user what to add. Fill the other fields with any valid placeholder.`

export async function parseRuleText({ text, brands = [], platforms = [] }) {
  if (typeof text !== 'string' || !text.trim()) throw new UserError('Describe the rule first.')
  if (text.length > 500) throw new UserError('Keep the description under 500 characters.')

  const client = new Anthropic()
  const response = await client.beta.messages.create({
    model: 'claude-opus-5-5',
    max_tokens: 4000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
    system: SYSTEM,
    messages: [{
      role: 'user',
      content: `Known brands: ${brands.join(', ') || '(none)'}\nKnown platforms: ${platforms.join(', ') || '(none)'}\n\nDescription: ${text}`,
    }],
  })

  if (response.stop_reason === 'refusal') throw new UserError('The parser declined this description. Please rephrase it.')
  if (response.stop_reason === 'max_tokens') throw new UserError('The parser ran out of room. Try a shorter description.')
  const textBlock = response.content.find((b) => b.type === 'text')
  try {
    return JSON.parse(textBlock?.text ?? '')
  } catch {
    throw new UserError('The parser returned something unreadable. Please try again.')
  }
}

export class UserError extends Error {}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST.' })
  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: 'The rule parser is not configured (no ANTHROPIC_API_KEY on the server).' })
  try {
    res.status(200).json(await parseRuleText(req.body ?? {}))
  } catch (err) {
    if (err instanceof UserError) return res.status(400).json({ error: err.message })
    if (err instanceof Anthropic.AuthenticationError) return res.status(500).json({ error: 'The server has no valid ANTHROPIC_API_KEY configured.' })
    if (err instanceof Anthropic.RateLimitError) return res.status(429).json({ error: 'Too many requests right now. Wait a moment and try again.' })
    console.error(err)
    res.status(502).json({ error: 'The rule parser is unavailable. Please try again.' })
  }
}
