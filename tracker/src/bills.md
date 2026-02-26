---
title: Bill Browser
---

# Bill Browser

Search and filter all flagged AI-related bills. Click any row to see match details.

```js
import {DuckDBClient} from "npm:@observablehq/duckdb";

const db = await DuckDBClient.of({
  bills: FileAttachment("data/ai_flagged_bills.parquet"),
});
```

```js
// Populate filter option lists from the data
const allStates  = await db.sql`SELECT DISTINCT state FROM bills ORDER BY state`;
const stateOpts  = ["All", ...allStates.map(d => d.state)];

const allSessions = await db.sql`SELECT DISTINCT session FROM bills WHERE session IS NOT NULL ORDER BY session DESC`;
const sessionOpts = ["All", ...allSessions.map(d => d.session)];
```

```js
// Filter inputs
const stateInput   = view(Inputs.select(stateOpts,  {label: "State"}));
const sessionInput = view(Inputs.select(sessionOpts, {label: "Session"}));
const tierInput    = view(Inputs.select(
  ["All", "Core AI", "Adjacent AI", "NCSL Only"],
  {label: "Tier"}
));
const ncslInput    = view(Inputs.toggle({label: "In NCSL only"}));
const titleInput   = view(Inputs.text({label: "Search title", placeholder: "e.g. deepfake, facial recognition…"}));
```

```js
// Build and run the filtered query
function esc(s) { return String(s).replace(/'/g, "''"); }

let where = "1=1";
if (stateInput   !== "All") where += ` AND state = '${esc(stateInput)}'`;
if (sessionInput !== "All") where += ` AND session = '${esc(sessionInput)}'`;
if (tierInput === "Core AI")     where += " AND core_ai_hits > 0";
if (tierInput === "Adjacent AI") where += " AND core_ai_hits = 0 AND source_bucket != 'ncsl_only'";
if (tierInput === "NCSL Only")   where += " AND source_bucket = 'ncsl_only'";
if (ncslInput)                   where += " AND in_ncsl = true";
if (titleInput.trim())           where += ` AND CONTAINS(LOWER(title), '${esc(titleInput.trim().toLowerCase())}')`;

const results = await db.query(`
  SELECT
    bill_id,
    state,
    identifier,
    session,
    title,
    core_ai_hits,
    adjacent_ai_hits,
    latest_action_date,
    in_ncsl,
    source_bucket,
    matched_concepts,
    match_snippets
  FROM bills
  WHERE ${where}
  ORDER BY latest_action_date DESC NULLS LAST
  LIMIT 200
`);
const rows = [...results];
const [{n}] = await db.query(`SELECT COUNT(*) AS n FROM bills WHERE ${where}`);
```

```js
html`<p class="result-count">Showing ${Math.min(rows.length, 200).toLocaleString()} of ${Number(n).toLocaleString()} matching bills
  ${Number(n) > 200 ? html`<span style="color:#BA0C2F"> — narrow your filters to see more</span>` : ""}
</p>`
```

```js
// Display table with single-row selection
const selected = view(Inputs.table(rows, {
  columns: ["state", "identifier", "session", "title", "core_ai_hits", "adjacent_ai_hits", "latest_action_date", "in_ncsl"],
  header: {
    state:              "State",
    identifier:         "Bill ID",
    session:            "Session",
    title:              "Title",
    core_ai_hits:       "Core AI",
    adjacent_ai_hits:   "Adj. AI",
    latest_action_date: "Last Action",
    in_ncsl:            "NCSL",
  },
  format: {
    in_ncsl: v => v ? "✓" : "",
    core_ai_hits: v => Number(v),
    adjacent_ai_hits: v => Number(v),
  },
  multiple: false,
  width: {title: 380, state: 55, identifier: 90, session: 110, core_ai_hits: 75, adjacent_ai_hits: 75, latest_action_date: 110, in_ncsl: 55},
}));
```

---

## Selected Bill Details

```js
if (selected) {
  const concepts = Array.isArray(selected.matched_concepts)
    ? selected.matched_concepts.join(", ")
    : (selected.matched_concepts ?? "—");

  // match_snippets may be an array of strings
  const snippets = Array.isArray(selected.match_snippets)
    ? selected.match_snippets
    : selected.match_snippets
      ? [selected.match_snippets]
      : [];

  display(html`
    <div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:.75rem;padding:1.25rem 1.5rem;margin-top:.5rem">
      <h3 style="margin-top:0;color:#1f2937">${selected.identifier} · ${selected.state} · ${selected.session}</h3>
      <p style="font-size:1.05rem;margin:.25rem 0 1rem">${selected.title ?? "(no title)"}</p>
      <table style="border-collapse:collapse;font-size:.875rem;width:100%">
        <tr><td style="padding:.3rem .6rem;color:#6b7280;width:160px">Core AI hits</td>
            <td style="padding:.3rem .6rem">${Number(selected.core_ai_hits)}</td></tr>
        <tr><td style="padding:.3rem .6rem;color:#6b7280">Adjacent AI hits</td>
            <td style="padding:.3rem .6rem">${Number(selected.adjacent_ai_hits)}</td></tr>
        <tr><td style="padding:.3rem .6rem;color:#6b7280">Matched concepts</td>
            <td style="padding:.3rem .6rem">${concepts}</td></tr>
        <tr><td style="padding:.3rem .6rem;color:#6b7280">In NCSL</td>
            <td style="padding:.3rem .6rem">${selected.in_ncsl ? "Yes" : "No"}</td></tr>
        <tr><td style="padding:.3rem .6rem;color:#6b7280">Last action</td>
            <td style="padding:.3rem .6rem">${selected.latest_action_date ?? "—"}</td></tr>
        <tr><td style="padding:.3rem .6rem;color:#6b7280">Source</td>
            <td style="padding:.3rem .6rem">${selected.source_bucket}</td></tr>
      </table>
      ${snippets.length > 0 ? html`
        <h4 style="margin:.75rem 0 .4rem;color:#6b7280;font-size:.85rem;text-transform:uppercase;letter-spacing:.05em">Match Snippets</h4>
        <ul style="margin:0;padding-left:1.2rem;font-size:.875rem;line-height:1.6">
          ${snippets.map(s => html`<li>${s}</li>`)}
        </ul>` : ""}
    </div>
  `);
} else {
  display(html`<p style="color:#6b7280;font-style:italic">Click a row above to see bill details and match snippets.</p>`);
}
```
