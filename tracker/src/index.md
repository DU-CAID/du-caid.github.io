---
title: Overview
---

# AI Policy Tracker

State-level AI legislation across the United States, tracked by the
[DU Center for Analytics and Innovation with Data (CAID)](https://du-caid.github.io/).
Bills are drawn from the [OpenStates/Plural](https://pluralpolicy.com/) database and flagged
using a two-tier regex pipeline validated against the
[NCSL AI Legislation Database](https://www.ncsl.org/financial-services/artificial-intelligence-legislation-database).

```js
import {DuckDBClient} from "npm:@observablehq/duckdb";

const db = await DuckDBClient.of({
  bills: FileAttachment("data/ai_flagged_bills.parquet"),
});
```

```js
// Headline metrics
const [{total, core_ai, ncsl_matched, states_count}] = await db.sql`
  SELECT
    COUNT(*)                                              AS total,
    COUNT(CASE WHEN core_ai_hits > 0 THEN 1 END)         AS core_ai,
    COUNT(CASE WHEN in_ncsl THEN 1 END)                  AS ncsl_matched,
    COUNT(DISTINCT state)                                 AS states_count
  FROM bills
`;
```

```js
html`<div class="metrics-grid">
  <div class="metric-card">
    <div class="metric-value">${Number(total).toLocaleString()}</div>
    <div class="metric-label">Total Flagged Bills</div>
  </div>
  <div class="metric-card">
    <div class="metric-value">${Number(core_ai).toLocaleString()}</div>
    <div class="metric-label">Core AI Bills</div>
  </div>
  <div class="metric-card">
    <div class="metric-value">${Number(ncsl_matched).toLocaleString()}</div>
    <div class="metric-label">NCSL Matched</div>
  </div>
  <div class="metric-card">
    <div class="metric-value">${Number(states_count)}</div>
    <div class="metric-label">States &amp; Territories</div>
  </div>
</div>`
```

## Bills by State

```js
import * as Plot from "npm:@observablehq/plot";
import * as topojson from "npm:topojson-client";

const stateCounts = await db.sql`
  SELECT state, COUNT(*) AS count
  FROM bills
  GROUP BY state
  ORDER BY count DESC
`;
const stateCountsArr = [...stateCounts];
const countByState = new Map(stateCountsArr.map(d => [d.state, Number(d.count)]));
```

```js
// US choropleth map
const us = await fetch("https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json").then(r => r.json());
const stateFeatures = topojson.feature(us, us.objects.states);
const stateMesh    = topojson.mesh(us, us.objects.states, (a, b) => a !== b);

const FIPS = {
  "01":"AL","02":"AK","04":"AZ","05":"AR","06":"CA","08":"CO","09":"CT",
  "10":"DE","11":"DC","12":"FL","13":"GA","15":"HI","16":"ID","17":"IL",
  "18":"IN","19":"IA","20":"KS","21":"KY","22":"LA","23":"ME","24":"MD",
  "25":"MA","26":"MI","27":"MN","28":"MS","29":"MO","30":"MT","31":"NE",
  "32":"NV","33":"NH","34":"NJ","35":"NM","36":"NY","37":"NC","38":"ND",
  "39":"OH","40":"OK","41":"OR","42":"PA","44":"RI","45":"SC","46":"SD",
  "47":"TN","48":"TX","49":"UT","50":"VT","51":"VA","53":"WA","54":"WV",
  "55":"WI","56":"WY","72":"PR"
};

stateFeatures.features.forEach(f => {
  const abbr = FIPS[String(f.id).padStart(2, "0")];
  f.properties.abbr  = abbr;
  f.properties.count = countByState.get(abbr) ?? 0;
});

const maxCount = Math.max(...stateCountsArr.map(d => Number(d.count)));

Plot.plot({
  projection: "albers-usa",
  width: 900,
  marginBottom: 40,
  color: {
    scheme: "reds",
    domain: [0, maxCount],
    legend: true,
    label: "Flagged bills",
  },
  marks: [
    Plot.geo(stateFeatures, {
      fill: d => d.properties.count,
      title: d => `${d.properties.abbr ?? "—"}: ${(d.properties.count ?? 0).toLocaleString()} bills`,
      tip: true,
      stroke: "white",
      strokeWidth: 0.5,
    }),
    Plot.geo(stateMesh, {stroke: "white", strokeWidth: 0.5}),
  ],
})
```

## Top 15 States — Core AI vs. Adjacent AI

```js
const breakdown = await db.sql`
  SELECT
    state,
    COUNT(CASE WHEN core_ai_hits > 0 THEN 1 END)                              AS core_ai,
    COUNT(CASE WHEN core_ai_hits = 0 AND source_bucket != 'ncsl_only' THEN 1 END) AS adjacent_ai,
    COUNT(*) AS total
  FROM bills
  GROUP BY state
  ORDER BY total DESC
  LIMIT 15
`;
const breakdownArr = [...breakdown];

// Reshape for stacked bars
const stackData = [
  ...breakdownArr.map(d => ({state: d.state, count: Number(d.core_ai),    tier: "Core AI"})),
  ...breakdownArr.map(d => ({state: d.state, count: Number(d.adjacent_ai), tier: "Adjacent AI"})),
];

Plot.plot({
  height: 420,
  marginLeft: 50,
  color: {
    domain: ["Core AI", "Adjacent AI"],
    range: ["#BA0C2F", "#A89968"],
    legend: true,
  },
  x: {label: "Number of bills", grid: true},
  y: {label: null, domain: breakdownArr.map(d => d.state)},
  marks: [
    Plot.barX(stackData, Plot.stackX({
      y: "state",
      x: "count",
      fill: "tier",
      tip: true,
      title: d => `${d.tier}: ${d.count.toLocaleString()}`,
    })),
    Plot.ruleX([0]),
  ],
})
```

---

*Data sourced from [OpenStates/Plural](https://pluralpolicy.com/) · Validated against the
[NCSL AI Legislation Database](https://www.ncsl.org/financial-services/artificial-intelligence-legislation-database)
· Last pipeline run: February 2026*
