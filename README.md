# Opptra Discount Engine

**Live demo:** https://discount-engine-assignment-nine-navy.vercel.app

Sample files to try it with are in [`sample-data/`](sample-data/) (`rules.csv`, `cart.csv`, `cart.pdf`, `cart-malformed.pdf`).

This is the base implementation for the Opptra FDE Intern assignment.
Fork this repo, complete the tasks in the assignment brief, and submit your GitHub link + Loom.

## Running locally

```bash
npm install
cp .env.example .env   # then paste your Anthropic API key into .env
npm run dev
```

Open http://localhost:5173. The API key is only needed for the plain-English rule input; everything else works without it.

## Deploying

```bash
npm run build
```

Deploy the `dist/` folder to Vercel, Netlify, or any static host.
The live deployment URL must be in your README before submission.

## How to use

1. Upload `sample-data/rules.csv` as the discount rules input
2. Upload `sample-data/cart.csv` (or `cart.pdf`) as the cart input
3. Click **Calculate Discounts**

## Adding an offer in plain English

Type a rule like *"Rs.100 flat discount on all Flipkart items"* in **Add an Offer** and press **Parse**.
Claude turns it into a rule, the app shows the parsed fields, and you **Confirm & add** or **Discard**.
On confirm the rule joins the active rules and the cart is recalculated.

How it's put together:

- `api/parse-rule.js` calls Claude (`claude-opus-5-5`, structured JSON output) on the server, so the API key never ships to the browser. It runs as a Vercel function in production; `vite.config.js` mounts the same handler during `npm run dev`. Set `ANTHROPIC_API_KEY` in the Vercel project's environment variables.
- The prompt includes the brand and platform names from the current cart, so "Amazon" maps to "Amazon India".
- The LLM output is treated as untrusted. `src/inputs/nlRule.js` checks scope, type, value (> 0, percentages ≤ 100), the target name and the cart threshold before anything reaches the engine. Anything it can't use comes back as a plain message telling the user what to add.
- Vague input such as *"Give a discount for big orders"* returns `unresolvable` with the missing pieces, never a guessed number.
- A rule naming a brand or platform not in the cart is allowed but flagged, since it won't change any prices yet.
- The engine is unchanged: the new input just produces the same `DiscountRule` shape the CSV parser does.

## Uploading a cart as a PDF

The cart upload accepts `.pdf` as well as `.csv`. The PDF needs a table with the columns **Product, Brand, Platform, Base Price** (see `sample-data/cart.pdf`). Lines above the header, like an order number, are ignored. Loading a PDF replaces the cart and recalculates with the active rules straight away.

How rows are read, and what happens when they're wrong:

- Parsing runs in the browser with pdf.js, so no server is involved. Each cell is assigned to a column by its position under the header, so multi-word names like "Amazon India" stay together. This works whether the PDF stores each cell separately or each line as one monospaced string.
- Prices may be written `Rs.1,299`, `₹ 849`, `INR 2499.00` or `599`.
- A row with a missing column or an unreadable price is **skipped and listed** above the cart ("Row 2 (Mystery Lamp): price "TBD" isn't a valid amount — skipped"), and the good rows still load. Dropping a row silently would change what the customer pays without telling them; refusing the whole file over one bad row would block the other items. `sample-data/cart-malformed.pdf` shows this.
- If no row is usable, or the file isn't a readable PDF, the current cart is kept and the reason is shown.
- PDFs carry no item IDs, so items are numbered `ITEM-01`, `ITEM-02`… in table order.
- **Assumption:** the PDF contains real text. A scanned (image-only) PDF would need OCR or an LLM vision call, which I left out.

## Project structure

```
src/
  engine/
    discountEngine.js   ← pure discount logic (no UI)
    csvParser.js        ← CSV → typed objects
  inputs/
    nlRule.js           ← plain English → validated DiscountRule
    pdfCart.js          ← PDF table → CartItem[]
  components/
    CsvUploader.jsx     ← file upload area
    DataTable.jsx       ← reusable table
    ErrorBanner.jsx     ← parse error display
    NlRuleInput.jsx     ← plain-English rule box + confirm step
  App.jsx               ← main UI + state
  main.jsx              ← entry point

api/
  parse-rule.js         ← serverless LLM call (keeps the API key server-side)

sample-data/
  rules.csv             ← sample discount rules
  cart.csv              ← sample cart items
  cart.pdf              ← the same cart as a PDF
  cart-malformed.pdf    ← PDF with bad rows, to show error handling
```

## CSV formats

**rules.csv**

| Column     | Type              | Example          |
|------------|-------------------|------------------|
| rule_id    | string            | RULE-01          |
| scope      | brand \| platform \| cart | platform  |
| applies_to | string            | Amazon India     |
| type       | percentage \| flat| percentage       |
| value      | number            | 15               |
| stackable  | true \| false     | false            |
| min_cart_value | number (cart rules only) | 4000     |

Cart rules use `scope = cart`, leave `applies_to` blank, and require `min_cart_value`.

**cart.csv**

| Column     | Type   | Example      |
|------------|--------|--------------|
| item_id    | string | ITEM-01      |
| product    | string | Cushion Cover|
| brand      | string | Natura Casa  |
| platform   | string | Amazon India |
| base_price | number | 1299         |

## Discount logic

- When multiple non-stackable rules match an item, the one giving the **largest saving in rupees** is applied.
- Rules marked `stackable: true` apply **on top of** the winning non-stackable rule.
- If no rules match, the base price is returned with a "No offers available" note.
- **Cart offers** are checked after item discounts: if the sum of final item prices is ≥ `min_cart_value`, the discount applies to that subtotal and shows as its own line. If several cart rules qualify, the biggest saving wins (cart rules don't stack). Below the threshold, no offer row appears; the customer sees how much more to add instead.
- A flat discount is capped at the item price, so a price never goes negative.

Run the engine tests with `npm test`.

## Expected results for the sample data

| Item    | Base Price | Final Price | Reasoning                              |
|---------|-----------|-------------|----------------------------------------|
| ITEM-01 | Rs.1,299  | Rs.1,104    | Platform offer: 15% off (beats Rs.150) |
| ITEM-02 | Rs.849    | Rs.629      | Brand offer: Rs.150 off + Platform 10% |
| ITEM-03 | Rs.599    | Rs.509      | Platform offer: 15% off                |
| ITEM-04 | Rs.2,499  | Rs.2,499    | No offers available                    |
| ITEM-05 | Rs.449    | Rs.382      | Platform offer: 15% off                |
| ITEM-06 | Rs.899    | Rs.809      | Platform offer: 10% off                |
| Cart total before offer | | Rs.5,932 |                              |
| Cart offer (RULE-04) | | −Rs.593 | 10% off, cart ≥ Rs.4,000          |
| **Final cart total** | | **Rs.5,339** |                          |
