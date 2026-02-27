---
title: Trends
---

# Trends

How AI-related legislation has grown over time, and what topics dominate the landscape.

```js
import * as Plot from "npm:@observablehq/plot";

const byYear   = await FileAttachment("data/by_year.json").json();
const concepts = await FileAttachment("data/concepts.json").json();
const sources  = await FileAttachment("data/sources.json").json();
```

## Bills Per Year

```js
// Reshape for multi-series line chart
const lineData = [
  ...byYear.map(d => ({year: d.year, count: d.core_ai,    tier: "Core AI"})),
  ...byYear.map(d => ({year: d.year, count: d.adjacent_ai, tier: "Adjacent AI"})),
];
```

```js
Plot.plot({
  height: 340,
  marginLeft: 55,
  color: {
    domain: ["Core AI", "Adjacent AI"],
    range: ["#BA0C2F", "#A89968"],
    legend: true,
  },
  x: {label: "Year", tickFormat: "d", grid: true},
  y: {label: "Number of bills", grid: true},
  marks: [
    Plot.line(lineData, {
      x: "year",
      y: "count",
      stroke: "tier",
      strokeWidth: 2.5,
      curve: "monotone-x",
    }),
    Plot.dot(lineData, {
      x: "year",
      y: "count",
      fill: "tier",
      r: 4,
      tip: true,
      title: d => `${d.tier} · ${d.year}: ${d.count.toLocaleString()} bills`,
    }),
    Plot.ruleY([0]),
  ],
})
```

## Top 25 Matched Concepts

Concepts matched most frequently across all flagged bills (bills can match multiple concepts).

```js
Plot.plot({
  height: 560,
  marginLeft: 200,
  x: {label: "Bills matched", grid: true},
  y: {label: null},
  marks: [
    Plot.barX(concepts, {
      y: "concept",
      x: "count",
      fill: "#BA0C2F",
      sort: {y: "-x"},
      tip: true,
      title: d => `${d.concept}: ${d.count.toLocaleString()}`,
    }),
    Plot.ruleX([0]),
  ],
})
```

## Source Breakdown

```js
Plot.plot({
  height: 240,
  marginLeft: 300,
  x: {label: "Number of bills", grid: true},
  y: {label: null},
  color: {
    range: ["#BA0C2F", "#c94b68", "#A89968", "#c4b48a", "#6b7280"],
  },
  marks: [
    Plot.barX(sources, {
      y: "source",
      x: "count",
      fill: "source",
      sort: {y: "-x"},
      tip: true,
      title: d => `${d.source}: ${d.count.toLocaleString()}`,
    }),
    Plot.ruleX([0]),
  ],
})
```

## NCSL Ground-Truth Coverage

The [NCSL AI Legislation Database](https://www.ncsl.org/financial-services/artificial-intelligence-legislation-database)
serves as our validation benchmark. Of the 1,597 NCSL-curated bills, 1,466 matched to bills
in our database. Of those 239 matched to a specific session year, our regex pipeline catches **79.5%**
(190 of 239). The remaining ~20% are intentional non-catches — bills NCSL classified as AI-related
but containing no AI-specific terms that can be targeted without creating significant false positives
across the 1.45M-bill dataset.

```js
Plot.plot({
  height: 180,
  marginLeft: 260,
  x: {label: "NCSL-matched bills", grid: true},
  y: {label: null},
  color: {
    domain: ["Caught by regex (Core AI)", "Caught by regex (Adjacent AI only)", "NCSL-only (not caught by regex)"],
    range: ["#BA0C2F", "#A89968", "#d1d5db"],
  },
  marks: [
    Plot.barX(
      [
        {category: "Caught by regex (Core AI)",         count: 168},
        {category: "Caught by regex (Adjacent AI only)", count: 22},
        {category: "NCSL-only (not caught by regex)",    count: 49},
      ],
      {
        y: "category",
        x: "count",
        fill: "category",
        tip: true,
        title: d => `${d.category}: ${d.count}`,
      }
    ),
    Plot.ruleX([0]),
  ],
})
```
