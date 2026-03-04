/* =============================================================
   U.S. State AI Policy Dashboard — app.js
   Vanilla JS, no build step. CDN deps: Chart.js, D3, TopoJSON.
   ============================================================= */

/* ── FIPS code → state abbreviation ─────────────────────── */
const FIPS = {
  "01":"AL","02":"AK","04":"AZ","05":"AR","06":"CA","08":"CO","09":"CT",
  "10":"DE","11":"DC","12":"FL","13":"GA","15":"HI","16":"ID","17":"IL",
  "18":"IN","19":"IA","20":"KS","21":"KY","22":"LA","23":"ME","24":"MD",
  "25":"MA","26":"MI","27":"MN","28":"MS","29":"MO","30":"MT","31":"NE",
  "32":"NV","33":"NH","34":"NJ","35":"NM","36":"NY","37":"NC","38":"ND",
  "39":"OH","40":"OK","41":"OR","42":"PA","44":"RI","45":"SC","46":"SD",
  "47":"TN","48":"TX","49":"UT","50":"VT","51":"VA","53":"WA","54":"WV",
  "55":"WI","56":"WY","60":"AS","66":"GU","69":"MP","72":"PR","78":"VI",
};

const STATE_NAMES = {
  AL:"Alabama",AK:"Alaska",AZ:"Arizona",AR:"Arkansas",CA:"California",
  CO:"Colorado",CT:"Connecticut",DE:"Delaware",DC:"District of Columbia",
  FL:"Florida",GA:"Georgia",HI:"Hawaii",ID:"Idaho",IL:"Illinois",IN:"Indiana",
  IA:"Iowa",KS:"Kansas",KY:"Kentucky",LA:"Louisiana",ME:"Maine",MD:"Maryland",
  MA:"Massachusetts",MI:"Michigan",MN:"Minnesota",MS:"Mississippi",MO:"Missouri",
  MT:"Montana",NE:"Nebraska",NV:"Nevada",NH:"New Hampshire",NJ:"New Jersey",
  NM:"New Mexico",NY:"New York",NC:"North Carolina",ND:"North Dakota",OH:"Ohio",
  OK:"Oklahoma",OR:"Oregon",PA:"Pennsylvania",RI:"Rhode Island",SC:"South Carolina",
  SD:"South Dakota",TN:"Tennessee",TX:"Texas",UT:"Utah",VT:"Vermont",VA:"Virginia",
  WA:"Washington",WV:"West Virginia",WI:"Wisconsin",WY:"Wyoming",
  PR:"Puerto Rico",GU:"Guam",VI:"U.S. Virgin Islands",AS:"American Samoa",MP:"Northern Mariana Islands",
};

/* ── DU brand colors ─────────────────────────────────────── */
const CRIMSON = "#BA0C2F";
const GOLD    = "#A89968";
const CRIMSON_LIGHT = "rgba(186,12,47,0.15)";
const GOLD_LIGHT    = "rgba(168,153,104,0.15)";

/* ── Helpers ─────────────────────────────────────────────── */
function fmt(n) {
  return (n ?? 0).toLocaleString("en-US");
}

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

function yearFromSession(session) {
  const s = String(session || "");
  return s.length >= 4 && /^\d{4}/.test(s) ? s.slice(0, 4) : null;
}

async function loadJSON(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed to load ${path} (${res.status})`);
  return res.json();
}

/* ── Tab switching ───────────────────────────────────────── */
function initTabs() {
  const btns   = document.querySelectorAll(".tab-btn");
  const panels = document.querySelectorAll(".tab-panel");

  btns.forEach(btn => {
    btn.addEventListener("click", () => {
      btns.forEach(b => b.classList.remove("active"));
      panels.forEach(p => p.classList.add("hidden"));
      btn.classList.add("active");
      document.getElementById("tab-" + btn.dataset.tab).classList.remove("hidden");
    });
  });
}

/* ── Metric cards ────────────────────────────────────────── */
function renderMetrics(summary) {
  document.getElementById("m-total").textContent  = fmt(summary.total_flagged_bills);
  document.getElementById("m-core").textContent   = fmt(summary.core_flagged_bills);
  document.getElementById("m-ncsl").textContent   = fmt(summary.in_ncsl_bills);
  document.getElementById("m-states").textContent = fmt(summary.total_states);

  const meta = document.getElementById("heroMeta");
  if (summary.generated_at_utc) {
    const d = new Date(summary.generated_at_utc);
    meta.textContent = `Last updated: ${d.toLocaleDateString("en-US", {year:"numeric",month:"long",day:"numeric"})}`;
  } else {
    meta.textContent = "";
  }
}

/* ── Choropleth map ──────────────────────────────────────── */
async function renderMap(stateData) {
  const container = document.getElementById("map-container");
  const tooltip   = document.getElementById("mapTooltip");

  // Build lookup: state abbrev → total count
  const counts = {};
  stateData.forEach(s => { counts[s.state] = s.total; });
  const maxVal = Math.max(...Object.values(counts));

  // Log scale color — handles the wide range (e.g. NY=17k vs small states=50)
  const colorScale = d3.scaleSequential()
    .domain([0, Math.log1p(maxVal)])
    .interpolator(d3.interpolate("#fce8ec", CRIMSON));

  // Fetch US TopoJSON (states-10m.json is ~100KB)
  const us = await d3.json("https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json");
  const states = topojson.feature(us, us.objects.states);

  const width  = container.clientWidth || 900;
  const height = Math.round(width * 0.62);

  const projection = d3.geoAlbersUsa()
    .fitSize([width, height], states);

  const path = d3.geoPath().projection(projection);

  const svg = d3.select(container)
    .append("svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("aria-label", "Choropleth map of flagged AI bills by U.S. state");

  svg.selectAll("path")
    .data(states.features)
    .join("path")
    .attr("d", path)
    .attr("fill", d => {
      const abbr  = FIPS[String(d.id).padStart(2, "0")];
      const count = counts[abbr] || 0;
      return colorScale(Math.log1p(count));
    })
    .on("mousemove", (event, d) => {
      const abbr  = FIPS[String(d.id).padStart(2, "0")] || "??";
      const name  = STATE_NAMES[abbr] || abbr;
      const count = counts[abbr] || 0;
      tooltip.style.opacity = "1";
      tooltip.style.left = (event.clientX + 14) + "px";
      tooltip.style.top  = (event.clientY - 32) + "px";
      tooltip.textContent = `${name} — ${fmt(count)} bills`;
    })
    .on("mouseleave", () => {
      tooltip.style.opacity = "0";
    });
}

/* ── Top 15 states stacked bar ───────────────────────────── */
function renderTopStates(stateData) {
  const top15 = stateData.slice(0, 15);
  const labels = top15.map(s => s.state);
  const core   = top15.map(s => s.core);
  const adj    = top15.map(s => s.adjacent_only);

  new Chart(document.getElementById("topStatesChart"), {
    type: "bar",
    data: {
      labels,
      datasets: [
        { label: "Core AI",     data: core, backgroundColor: CRIMSON },
        { label: "Adjacent AI", data: adj,  backgroundColor: GOLD    },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: "top" },
        tooltip: {
          callbacks: {
            label: ctx => `${ctx.dataset.label}: ${fmt(ctx.parsed.y)}`,
          },
        },
      },
      scales: {
        x: { stacked: true, grid: { display: false } },
        y: {
          stacked: true,
          ticks: { callback: v => fmt(v) },
          grid: { color: "#e5e7eb" },
        },
      },
    },
  });
}

/* ── Bill Browser ────────────────────────────────────────── */
function initBillBrowser(manifest) {
  const stateSelect  = document.getElementById("stateFilter");
  const yearSelect   = document.getElementById("yearFilter");
  const tierSelect   = document.getElementById("tierFilter");
  const ncslCheck    = document.getElementById("ncslFilter");
  const searchInput  = document.getElementById("searchInput");
  const tbody        = document.getElementById("billsTbody");
  const countEl      = document.getElementById("resultsCount");

  // Build state → path lookup
  const byState = {};
  manifest.forEach(row => { if (row.state) byState[row.state] = row.path; });

  // Populate state dropdown (sorted alphabetically)
  Object.keys(byState).sort().forEach(abbr => {
    const opt = document.createElement("option");
    opt.value = abbr;
    opt.textContent = `${abbr} — ${STATE_NAMES[abbr] || abbr}`;
    stateSelect.appendChild(opt);
  });

  // Per-state bill cache
  const cache = {};
  let currentBills = [];

  async function loadState(abbr) {
    if (!abbr) { currentBills = []; return; }
    if (cache[abbr]) { currentBills = cache[abbr]; return; }
    const res = await fetch("./data/bills_by_state/" + abbr + ".json");
    if (!res.ok) throw new Error(`Could not load ${byState[abbr]}`);
    cache[abbr] = await res.json();
    currentBills = cache[abbr];
  }

  function populateYears() {
    const years = new Set();
    currentBills.forEach(b => {
      const y = yearFromSession(b.session);
      if (y) years.add(y);
    });
    yearSelect.innerHTML = '<option value="">All years</option>';
    [...years].sort().reverse().forEach(y => {
      const opt = document.createElement("option");
      opt.value = y;
      opt.textContent = y;
      yearSelect.appendChild(opt);
    });
  }

  function applyFilters() {
    const q     = searchInput.value.trim().toLowerCase();
    const year  = yearSelect.value;
    const tier  = tierSelect.value;
    const ncsl  = ncslCheck.checked;

    return currentBills.filter(b => {
      if (year && yearFromSession(b.session) !== year) return false;
      if (tier === "core"     && b.core_ai_hits <= 0)      return false;
      if (tier === "adjacent" && (b.adjacent_ai_hits <= 0 || b.core_ai_hits > 0)) return false;
      if (ncsl && !b.in_ncsl) return false;
      if (q) {
        const hay = [b.identifier, b.title, b.session,
                     ...(b.matched_concepts || [])].join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }

  let expandedBillId = null;

  function renderTable(bills) {
    tbody.innerHTML = "";

    if (!stateSelect.value) {
      countEl.textContent = "Select a state to load bills.";
      return;
    }

    const shown = bills.slice(0, 500);
    countEl.textContent = bills.length === 0
      ? "No bills match the current filters."
      : `Showing ${fmt(shown.length)} of ${fmt(bills.length)} bills`;

    shown.forEach(b => {
      const isCore = b.core_ai_hits > 0;
      const billRow = document.createElement("tr");
      billRow.className = "bill-row" + (b.bill_id === expandedBillId ? " expanded" : "");
      billRow.dataset.billId = b.bill_id;

      const billLink = b.primary_url
        ? `<a href="${b.primary_url}" target="_blank" rel="noopener noreferrer">${b.identifier || "—"}</a>`
        : (b.identifier || "—");

      const ncslBadge = b.in_ncsl ? '<span class="tag tag-ncsl">NCSL</span>' : "";
      const concepts  = (b.matched_concepts || []).slice(0, 3).join(", ");

      billRow.innerHTML = `
        <td>${b.state || ""}</td>
        <td style="white-space:nowrap">${billLink}</td>
        <td style="white-space:nowrap">${b.session || ""}</td>
        <td>
          <span class="tag ${isCore ? "tag-core" : "tag-adjacent"}" style="margin-bottom:0.25rem">
            ${isCore ? "Core AI" : "Adjacent"}
          </span>
          ${ncslBadge}
          <br>
          <strong>${b.title || "(no title)"}</strong>
          ${concepts ? `<br><span style="color:var(--muted);font-size:0.82rem">${concepts}</span>` : ""}
        </td>
        <td style="text-align:center">${b.core_ai_hits || 0}</td>
        <td style="text-align:center">${b.adjacent_ai_hits || 0}</td>
        <td style="text-align:center">${b.in_ncsl ? "✓" : ""}</td>
      `;

      tbody.appendChild(billRow);

      // Expandable detail row
      if (b.bill_id === expandedBillId) {
        tbody.appendChild(buildDetailRow(b));
      }

      billRow.addEventListener("click", () => {
        if (expandedBillId === b.bill_id) {
          expandedBillId = null;
        } else {
          expandedBillId = b.bill_id;
        }
        renderTable(applyFilters());
      });
    });
  }

  function buildDetailRow(b) {
    const detailRow = document.createElement("tr");
    detailRow.className = "detail-row";

    const concepts = (b.matched_concepts || [])
      .map(c => `<li class="concept-tag">${c}</li>`).join("") || "<li class='concept-tag' style='color:var(--muted)'>none</li>";

    detailRow.innerHTML = `
      <td colspan="7">
        <div class="bill-detail">
          <div class="detail-field">
            <div class="field-label">Bill ID</div>
            <div class="field-value" style="font-size:0.8rem;color:var(--muted)">${b.bill_id || "—"}</div>
          </div>
          <div class="detail-field">
            <div class="field-label">Source</div>
            <div class="field-value">${b.source_bucket || "—"}</div>
          </div>
          <div class="detail-field">
            <div class="field-label">Last updated</div>
            <div class="field-value">${b.updated || "—"}</div>
          </div>
          <div class="detail-field">
            <div class="field-label">NCSL</div>
            <div class="field-value">${b.in_ncsl ? "Yes — matched to NCSL AI legislation database" : "Not in NCSL database"}</div>
          </div>
          <div class="detail-field" style="grid-column:1/-1">
            <div class="field-label">Matched concepts</div>
            <ul class="concepts-list">${concepts}</ul>
          </div>
          ${b.primary_url ? `
          <div class="detail-field" style="grid-column:1/-1">
            <div class="field-label">Source document</div>
            <div class="field-value"><a href="${b.primary_url}" target="_blank" rel="noopener noreferrer">${b.primary_url}</a></div>
          </div>` : ""}
        </div>
      </td>
    `;
    return detailRow;
  }

  const runFilters = debounce(() => renderTable(applyFilters()), 180);

  stateSelect.addEventListener("change", async () => {
    expandedBillId = null;
    countEl.textContent = "Loading…";
    tbody.innerHTML = "";
    try {
      await loadState(stateSelect.value);
      populateYears();
      renderTable(applyFilters());
    } catch (e) {
      countEl.textContent = "Failed to load bill data.";
      console.error(e);
    }
  });

  yearSelect.addEventListener("change", runFilters);
  tierSelect.addEventListener("change", runFilters);
  ncslCheck.addEventListener("change", runFilters);
  searchInput.addEventListener("input", runFilters);
}

/* ── Trends charts ───────────────────────────────────────── */
function renderTrends(byYear, concepts, sources) {

  // Bills per year — line chart
  const yearLabels = byYear.map(d => d.year);
  new Chart(document.getElementById("yearChart"), {
    type: "line",
    data: {
      labels: yearLabels,
      datasets: [
        {
          label: "Core AI",
          data: byYear.map(d => d.core),
          borderColor: CRIMSON,
          backgroundColor: CRIMSON_LIGHT,
          tension: 0.3,
          fill: true,
          pointBackgroundColor: CRIMSON,
        },
        {
          label: "Adjacent AI",
          data: byYear.map(d => d.adjacent),
          borderColor: GOLD,
          backgroundColor: GOLD_LIGHT,
          tension: 0.3,
          fill: true,
          pointBackgroundColor: GOLD,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: "top" },
        tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${fmt(ctx.parsed.y)}` } },
      },
      scales: {
        x: { grid: { display: false } },
        y: {
          ticks: { callback: v => fmt(v) },
          grid: { color: "#e5e7eb" },
        },
      },
    },
  });

  // Top concepts — horizontal bar
  new Chart(document.getElementById("conceptsChart"), {
    type: "bar",
    data: {
      labels: concepts.map(d => d.concept),
      datasets: [{
        label: "Bills",
        data: concepts.map(d => d.count),
        backgroundColor: CRIMSON,
      }],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => fmt(ctx.parsed.x) } },
      },
      scales: {
        x: {
          ticks: { callback: v => fmt(v) },
          grid: { color: "#e5e7eb" },
        },
        y: { grid: { display: false } },
      },
    },
  });

  // Source breakdown — horizontal bar
  new Chart(document.getElementById("sourcesChart"), {
    type: "bar",
    data: {
      labels: sources.map(d => d.source),
      datasets: [{
        label: "Bills",
        data: sources.map(d => d.count),
        backgroundColor: GOLD,
      }],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => fmt(ctx.parsed.x) } },
      },
      scales: {
        x: {
          ticks: { callback: v => fmt(v) },
          grid: { color: "#e5e7eb" },
        },
        y: { grid: { display: false } },
      },
    },
  });
}

/* ── Main entry point ────────────────────────────────────── */
async function main() {
  initTabs();

  try {
    // Load all static JSON files in parallel
    const [summary, stateData, manifest, byYear, concepts, sources] = await Promise.all([
      loadJSON("./data/summary.json"),
      loadJSON("./data/states.json"),
      loadJSON("./data/bills_manifest.json"),
      loadJSON("./data/by_year.json").catch(() => []),
      loadJSON("./data/concepts.json").catch(() => []),
      loadJSON("./data/sources.json").catch(() => []),
    ]);

    renderMetrics(summary);
    renderTopStates(stateData);
    renderMap(stateData);
    initBillBrowser(manifest);
    renderTrends(byYear, concepts, sources);

  } catch (err) {
    console.error("Dashboard failed to load:", err);
    document.getElementById("heroMeta").textContent =
      "Dashboard data unavailable. Run scripts/build_dashboard_data.py first.";
  }
}

main();
