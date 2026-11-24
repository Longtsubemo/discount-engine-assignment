/**
 * NlRuleInput.jsx
 *
 * Plain-English rule input with a confirm/discard step. Produces a
 * DiscountRule via onAdd(rule); knows nothing about the engine.
 */

import { useState } from 'react'
import { requestRuleParse, validateParsedRule, nextRuleId } from '../inputs/nlRule.js'

const unique = (xs) => [...new Set(xs.filter(Boolean))]

export default function NlRuleInput({ rules, cartItems, onAdd }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [parsed, setParsed] = useState(null) // { rule, warnings }

  const known = {
    brands: unique([...cartItems.map((i) => i.brand), ...rules.filter((r) => r.scope === 'brand').map((r) => r.appliesTo)]),
    platforms: unique([...cartItems.map((i) => i.platform), ...rules.filter((r) => r.scope === 'platform').map((r) => r.appliesTo)]),
  }

  async function handleParse() {
    setBusy(true); setError(''); setParsed(null)
    try {
      const raw = await requestRuleParse(text, known)
      const result = validateParsedRule(raw, nextRuleId(rules), known)
      if (result.error) return setError(result.error)
      const { rule, warnings } = result
      const same = rules.find((x) => x.scope === rule.scope && x.appliesTo.toLowerCase() === rule.appliesTo.toLowerCase() &&
        x.type === rule.type && x.value === rule.value && (x.minCartValue ?? null) === rule.minCartValue)
      if (same) warnings.push(`This is the same offer as ${same.ruleId}. Adding it again ${rule.stackable ? 'applies the discount twice' : 'changes nothing'}.`)
      const freed = rule.type === 'flat' && rule.scope !== 'cart' &&
        cartItems.filter((i) => (rule.scope === 'brand' ? i.brand : i.platform).toLowerCase() === rule.appliesTo.toLowerCase() && i.basePrice <= rule.value)
      if (freed?.length) warnings.push(`Rs.${rule.value.toLocaleString('en-IN')} off is the full price of ${freed.length} matching item${freed.length > 1 ? 's; they' : '; it'} would become free.`)
      setParsed({ rule, warnings })
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  function handleConfirm() {
    onAdd(parsed.rule)
    setParsed(null); setText('')
  }

  const r = parsed?.rule
  return (
    <div>
      <label htmlFor="nl-rule" style={{ fontSize: 12, color: '#555', display: 'block', marginBottom: 4 }}>
        Describe a new offer in plain English
      </label>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          id="nl-rule"
          value={text}
          onChange={(e) => { setText(e.target.value); setError(''); setParsed(null) }}
          onKeyDown={(e) => e.key === 'Enter' && text.trim() && !busy && handleParse()}
          placeholder='e.g. "20% off for Natura Casa brand, stackable with other offers"'
          maxLength={500}
          style={{ flex: 1, padding: '0.5rem 0.6rem', fontSize: 13, border: '1px solid #CECECE', borderRadius: 4 }}
        />
        <button
          onClick={handleParse}
          disabled={!text.trim() || busy}
          style={{ ...btn, background: !text.trim() || busy ? '#CECECE' : '#131A48' }}
        >
          {busy ? 'Reading…' : 'Parse'}
        </button>
      </div>

      {error && (
        <div role="alert" style={{ marginTop: 8, padding: '0.5rem 0.7rem', background: '#fff4e5', border: '1px solid #f5c27a', borderRadius: 4, fontSize: 12, color: '#7a4a00' }}>
          Couldn't turn that into a rule: {error}
        </div>
      )}

      {r && (
        <div style={{ marginTop: 10, padding: '0.7rem 0.9rem', border: '1px solid #131A48', borderRadius: 4, background: '#f7f8fc' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#131A48', marginBottom: 6 }}>Add this rule as {r.ruleId}?</div>
          <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '2px 12px', fontSize: 12, margin: 0 }}>
            <dt style={dt}>Scope</dt><dd style={dd}>{cap(r.scope)}</dd>
            {r.scope !== 'cart' && (<><dt style={dt}>Applies to</dt><dd style={dd}>{r.appliesTo}</dd></>)}
            <dt style={dt}>Type</dt><dd style={dd}>{cap(r.type)}</dd>
            <dt style={dt}>Value</dt><dd style={dd}>{r.type === 'percentage' ? `${r.value}% off` : `Rs.${r.value.toLocaleString('en-IN')} off`}</dd>
            {r.scope === 'cart'
              ? (<><dt style={dt}>Min cart value</dt><dd style={dd}>Rs.{r.minCartValue.toLocaleString('en-IN')}</dd></>)
              : (<><dt style={dt}>Stackable</dt><dd style={dd}>{r.stackable ? 'Yes' : 'No'}</dd></>)}
          </dl>
          {parsed.warnings.map((w) => (
            <div key={w} style={{ marginTop: 6, fontSize: 11, color: '#7a4a00' }}>⚠ {w}</div>
          ))}
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button onClick={handleConfirm} style={{ ...btn, background: '#FF5800' }}>Confirm &amp; add</button>
            <button onClick={() => setParsed(null)} style={{ ...btn, background: '#fff', color: '#131A48', border: '1px solid #131A48' }}>Discard</button>
          </div>
        </div>
      )}
    </div>
  )
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1)
const btn = { color: '#fff', border: 'none', borderRadius: 4, padding: '0.5rem 1rem', fontSize: 12, fontWeight: 700, cursor: 'pointer' }
const dt = { color: '#888' }
const dd = { margin: 0, color: '#131A48', fontWeight: 600 }
