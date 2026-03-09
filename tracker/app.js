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
  const m = s.match(/^(\d{4})/);
  if (!m) return null;
  const y = parseInt(m[1], 10);
  // Reject implausible years — TX uses session numbers like 8496, 86, 87...
  return (y >= 1990 && y <= 2035) ? m[1] : null;
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
  document.getElementById("m-core").textContent     = fmt(summary.core_flagged_bills);
  document.getElementById("m-adjacent").textContent = fmt(summary.adjacent_only_flagged_bills);
  document.getElementById("m-ncsl").textContent     = fmt(summary.in_ncsl_bills);
  document.getElementById("m-states").textContent   = fmt(summary.total_states);

  const meta = document.getElementById("heroMeta");
  if (summary.generated_at_utc) {
    const d = new Date(summary.generated_at_utc);
    meta.textContent = `Last updated: ${d.toLocaleDateString("en-US", {year:"numeric",month:"long",day:"numeric"})}`;
  } else {
    meta.textContent = "";
  }
}

/* ── Hero map silhouette ─────────────────────────────────── */
async function renderHeroMap(usTopoJson) {
  const el = document.getElementById("heroMapBg");
  if (!el) return;

  const states = topojson.feature(usTopoJson, usTopoJson.objects.states);

  const w = el.clientWidth  || 1200;
  const h = el.clientHeight || 220;

  // Fit the US map to fill the hero, shifted slightly right and down
  const projection = d3.geoAlbersUsa()
    .fitExtent([[w * 0.05, h * -0.15], [w * 1.05, h * 1.25]], states);

  const path = d3.geoPath().projection(projection);

  const svg = d3.select(el)
    .append("svg")
    .attr("viewBox", `0 0 ${w} ${h}`)
    .attr("preserveAspectRatio", "xMidYMid slice");

  // State fills — very subtle lighter crimson
  svg.selectAll("path.hero-state")
    .data(states.features)
    .join("path")
    .attr("class", "hero-state")
    .attr("d", path)
    .attr("fill", "rgba(255,255,255,0.06)")
    .attr("stroke", "rgba(255,255,255,0.18)")
    .attr("stroke-width", "0.7");
}

/* ── Choropleth map ──────────────────────────────────────── */
async function renderMap(stateData, navigateTo, usTopoJson) {
  const container    = document.getElementById("map-container");
  const tooltip      = document.getElementById("mapTooltip");
  const viewSelect   = document.getElementById("mapViewSelect");
  const headingEl    = document.getElementById("mapHeading");
  const legendLabel  = document.getElementById("mapLegendLabel");

  // Build count lookups by view type
  const countsByView = { core: {}, adjacent: {}, total: {} };
  stateData.forEach(s => {
    countsByView.core[s.state]     = s.core;
    countsByView.adjacent[s.state] = s.adjacent_only;
    countsByView.total[s.state]    = s.total;
  });

  const VIEW_META = {
    core:     { label: "Core AI Bills by State",     legend: "Core AI bills",     tier: "core" },
    adjacent: { label: "Adjacent AI Bills by State", legend: "Adjacent AI bills", tier: "adjacent" },
    total:    { label: "All Flagged Bills by State",  legend: "All flagged bills", tier: "" },
  };

  // Use the pre-fetched TopoJSON (shared with hero map)
  const states = topojson.feature(usTopoJson, usTopoJson.objects.states);

  const width  = container.clientWidth || 900;
  const height = Math.round(width * 0.62);

  const projection = d3.geoAlbersUsa().fitSize([width, height], states);
  const path       = d3.geoPath().projection(projection);

  const svg = d3.select(container)
    .append("svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("aria-label", "Choropleth map of flagged AI bills by U.S. state");

  const paths = svg.selectAll("path")
    .data(states.features)
    .join("path")
    .attr("d", path)
    .style("cursor", "pointer");

  function getView()   { return viewSelect ? viewSelect.value : "core"; }
  function getCounts() { return countsByView[getView()]; }

  // Quantile scale: divides states into 5 equal-sized buckets regardless of absolute values
  // so there is always clear color differentiation across states
  const QUANT_COLORS = ["#fce8ec", "#f4b8c3", "#e87a90", "#d63a5d", CRIMSON];
  function buildColorScale(counts) {
    const vals = Object.values(counts).filter(v => v > 0);
    if (!vals.length) return () => "#e5e7eb";
    return d3.scaleQuantile().domain(vals).range(QUANT_COLORS);
  }

  function updateMap() {
    const view   = getView();
    const counts = getCounts();
    const meta   = VIEW_META[view];
    const color  = buildColorScale(counts);

    paths.attr("fill", d => {
      const abbr = FIPS[String(d.id).padStart(2, "0")];
      const val  = counts[abbr] || 0;
      return val === 0 ? "#e5e7eb" : color(val);
    });

    if (headingEl)   headingEl.textContent   = meta.label;
    if (legendLabel) legendLabel.textContent = meta.legend;
  }

  paths
    .on("mousemove", (event, d) => {
      const abbr   = FIPS[String(d.id).padStart(2, "0")] || "??";
      const name   = STATE_NAMES[abbr] || abbr;
      const count  = getCounts()[abbr] || 0;
      const view   = getView();
      const kind   = view === "core" ? "core AI" : view === "adjacent" ? "adjacent AI" : "flagged";
      tooltip.style.opacity = "1";
      tooltip.style.left    = (event.clientX + 14) + "px";
      tooltip.style.top     = (event.clientY - 32) + "px";
      tooltip.textContent   = `${name} — ${fmt(count)} ${kind} bills (click to browse)`;
    })
    .on("mouseleave", () => { tooltip.style.opacity = "0"; })
    .on("click", (event, d) => {
      const abbr = FIPS[String(d.id).padStart(2, "0")];
      if (abbr && navigateTo) navigateTo(abbr, VIEW_META[getView()].tier);
    });

  if (viewSelect) viewSelect.addEventListener("change", updateMap);
  updateMap();
}

/* ── Top 15 states stacked bar ───────────────────────────── */
function renderTopStates(stateData) {
  const barOptions = (color) => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: { callbacks: { label: ctx => fmt(ctx.parsed.y) } },
    },
    scales: {
      x: { grid: { display: false } },
      y: { ticks: { callback: v => fmt(v) }, grid: { color: "#e5e7eb" } },
    },
  });

  // Core AI — sorted by core count
  const topCore = [...stateData].sort((a, b) => b.core - a.core).slice(0, 15);
  new Chart(document.getElementById("topStatesCoreChart"), {
    type: "bar",
    data: {
      labels: topCore.map(s => s.state),
      datasets: [{ label: "Core AI Bills", data: topCore.map(s => s.core), backgroundColor: CRIMSON }],
    },
    options: barOptions(CRIMSON),
  });

  // Adjacent AI — sorted by adjacent_only count
  const topAdj = [...stateData].sort((a, b) => b.adjacent_only - a.adjacent_only).slice(0, 15);
  new Chart(document.getElementById("topStatesAdjChart"), {
    type: "bar",
    data: {
      labels: topAdj.map(s => s.state),
      datasets: [{ label: "Adjacent AI Bills", data: topAdj.map(s => s.adjacent_only), backgroundColor: GOLD }],
    },
    options: barOptions(GOLD),
  });
}

/* ── Bill Browser ────────────────────────────────────────── */
function initBillBrowser(manifest) {
  const stateSelect   = document.getElementById("stateFilter");
  const yearSelect    = document.getElementById("yearFilter");
  const tierSelect    = document.getElementById("tierFilter");
  const chamberSelect = document.getElementById("chamberFilter");
  const sortSelect    = document.getElementById("sortSelect");
  const ncslCheck     = document.getElementById("ncslFilter");
  const searchInput   = document.getElementById("searchInput");
  const tbody         = document.getElementById("billsTbody");
  const countEl       = document.getElementById("resultsCount");

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
    const q       = searchInput.value.trim().toLowerCase();
    const year    = yearSelect.value;
    const tier    = tierSelect.value;
    const chamber = chamberSelect.value;
    const ncsl    = ncslCheck.checked;
    const sort    = sortSelect.value;

    let result = currentBills.filter(b => {
      if (year && yearFromSession(b.session) !== year) return false;
      if (tier === "core"     && b.core_ai_hits <= 0)                              return false;
      if (tier === "adjacent" && (b.adjacent_ai_hits <= 0 || b.core_ai_hits > 0)) return false;
      if (chamber === "house"  && !/^H/i.test(b.identifier))                       return false;
      if (chamber === "senate" && !/^S/i.test(b.identifier))                       return false;
      if (ncsl && !b.in_ncsl) return false;
      if (q) {
        const hay = [b.identifier, b.title, b.session,
                     ...(b.matched_concepts || [])].join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    if (sort === "year_desc" || sort === "") {
      result.sort((a, b) => {
        const ya = yearFromSession(a.session) || "0", yb = yearFromSession(b.session) || "0";
        if (yb !== ya) return yb > ya ? 1 : -1;
        return (a.identifier || "").localeCompare(b.identifier || "", undefined, { numeric: true });
      });
    } else if (sort === "year_asc") {
      result.sort((a, b) => {
        const ya = yearFromSession(a.session) || "0", yb = yearFromSession(b.session) || "0";
        if (ya !== yb) return ya > yb ? 1 : -1;
        return (a.identifier || "").localeCompare(b.identifier || "", undefined, { numeric: true });
      });
    }

    return result;
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

      // Status cell: NCSL status (colour-coded) if available, else latest action date
      const statusCell = (() => {
        if (b.ncsl_status) {
          const s = b.ncsl_status;
          const lower = s.toLowerCase();
          let color = "var(--muted)";
          if (lower.includes("enact") || lower.includes("sign") || lower.includes("chapter")) color = "#16a34a";
          else if (lower.includes("veto") || lower.includes("fail")) color = "var(--du-crimson)";
          else if (lower.includes("pend") || lower.includes("progress")) color = "var(--du-gold)";
          return `<span style="font-size:0.78rem;color:${color};font-weight:600">${s}</span>`;
        }
        if (b.latest_action_date) {
          return `<span style="font-size:0.78rem;color:var(--muted)">${b.latest_action_date}</span>`;
        }
        return "";
      })();

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
          <strong>${b.title || (b.source_bucket === "ncsl_only" ? '<em style="color:var(--muted);font-weight:400">NCSL record — title not available</em>' : '<em style="color:var(--muted);font-weight:400">(no title)</em>')}</strong>
          ${concepts ? `<br><span style="color:var(--muted);font-size:0.82rem">${concepts}</span>` : ""}
        </td>
        <td style="text-align:center">${b.core_ai_hits || 0}</td>
        <td style="text-align:center">${b.adjacent_ai_hits || 0}</td>
        <td style="text-align:center">${b.in_ncsl ? "✓" : ""}</td>
        <td style="white-space:nowrap">${statusCell}</td>
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

    const latestAction = (b.latest_action_date || b.latest_action_description)
      ? `${b.latest_action_date ? b.latest_action_date + " — " : ""}${b.latest_action_description || ""}`
      : "—";

    detailRow.innerHTML = `
      <td colspan="8">
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
            <div class="field-label">Latest action</div>
            <div class="field-value">${latestAction}</div>
          </div>
          <div class="detail-field">
            <div class="field-label">NCSL</div>
            <div class="field-value">${b.in_ncsl ? "Yes — matched to NCSL AI legislation database" : "Not in NCSL database"}</div>
          </div>
          ${b.ncsl_status ? `
          <div class="detail-field">
            <div class="field-label">NCSL status</div>
            <div class="field-value">${b.ncsl_status}</div>
          </div>` : ""}
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

  async function selectState(abbr) {
    expandedBillId = null;
    stateSelect.value = abbr;
    countEl.textContent = "Loading…";
    tbody.innerHTML = "";
    try {
      await loadState(abbr);
      populateYears();
      renderTable(applyFilters());
    } catch (e) {
      countEl.textContent = "Failed to load bill data.";
      console.error(e);
    }
  }

  stateSelect.addEventListener("change", () => selectState(stateSelect.value));
  yearSelect.addEventListener("change", runFilters);
  tierSelect.addEventListener("change", runFilters);
  chamberSelect.addEventListener("change", runFilters);
  sortSelect.addEventListener("change", runFilters);
  ncslCheck.addEventListener("change", runFilters);
  searchInput.addEventListener("input", runFilters);

  // Expose navigation function for map click-through
  return async function navigateTo(abbr, tier, year) {
    // Switch to bills tab
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach(p => p.classList.add("hidden"));
    document.querySelector('[data-tab="bills"]').classList.add("active");
    document.getElementById("tab-bills").classList.remove("hidden");

    // Set tier filter, then load state (populateYears runs inside selectState)
    if (tier) tierSelect.value = tier;
    await selectState(abbr);

    // Set year after populateYears() has rebuilt the dropdown
    if (year && yearSelect.querySelector(`option[value="${year}"]`)) {
      yearSelect.value = year;
      runFilters();
    }

    // Scroll bill browser into view
    document.getElementById("tab-bills").scrollIntoView({ behavior: "smooth", block: "start" });
  };
}

/* ── Trends charts ───────────────────────────────────────── */
function renderTrends(byYear, concepts, topStatesByYear, conceptsByYear) {
  // Filter to 2019–present, drop unknown/implausible years
  const recentYears = byYear.filter(d => d.year >= "2019" && d.year <= "2035");
  const yearLabels  = recentYears.map(d => d.year);

  // 1. Combined year chart — Core, Adjacent, NCSL on one canvas
  new Chart(document.getElementById("yearCombinedChart"), {
    type: "line",
    data: {
      labels: yearLabels,
      datasets: [
        {
          label: "Core AI",
          data: recentYears.map(d => d.core),
          borderColor: CRIMSON,
          backgroundColor: CRIMSON_LIGHT,
          tension: 0.3,
          fill: true,
          pointBackgroundColor: CRIMSON,
          borderWidth: 2,
        },
        {
          label: "Adjacent AI",
          data: recentYears.map(d => d.adjacent),
          borderColor: GOLD,
          backgroundColor: GOLD_LIGHT,
          tension: 0.3,
          fill: true,
          pointBackgroundColor: GOLD,
          borderWidth: 2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          position: "top",
          labels: { usePointStyle: true, pointStyleWidth: 10, padding: 20 },
        },
        tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${fmt(ctx.parsed.y)}` } },
      },
      scales: {
        x: { grid: { display: false } },
        y: { ticks: { callback: v => fmt(v) }, grid: { color: "#e5e7eb" } },
      },
    },
  });

  // 2. Top states for most recent year
  const mostRecentYear = Object.keys(topStatesByYear || {}).sort().reverse()[0];
  if (mostRecentYear && topStatesByYear[mostRecentYear]) {
    const yearLabel = document.getElementById("trendsYearLabel");
    if (yearLabel) yearLabel.textContent = `(${mostRecentYear})`;

    const top = topStatesByYear[mostRecentYear].slice(0, 12);
    new Chart(document.getElementById("topStatesYearChart"), {
      type: "bar",
      data: {
        labels: top.map(s => s.state),
        datasets: [
          {
            label: "Core AI",
            data: top.map(s => s.core),
            backgroundColor: CRIMSON,
          },
          {
            label: "Adjacent AI",
            data: top.map(s => s.adjacent),
            backgroundColor: GOLD,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: true,
            position: "top",
            labels: { usePointStyle: true, pointStyleWidth: 10, padding: 20 },
          },
          tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${fmt(ctx.parsed.y)}` } },
        },
        scales: {
          x: { stacked: true, grid: { display: false } },
          y: { stacked: true, ticks: { callback: v => fmt(v) }, grid: { color: "#e5e7eb" } },
        },
      },
    });
  }

  // 3. Core AI concepts — horizontal bar with year filter
  const conceptsYearSelect = document.getElementById("conceptsYearSelect");

  // Populate year dropdown from conceptsByYear data
  if (conceptsByYear && conceptsByYear.length) {
    const allConceptYears = Object.keys(conceptsByYear[0].by_year).filter(y => y >= "2019").sort().reverse();
    allConceptYears.forEach(y => {
      const opt = document.createElement("option");
      opt.value = y; opt.textContent = y;
      conceptsYearSelect.appendChild(opt);
    });
  }

  const conceptsChart = new Chart(document.getElementById("conceptsChart"), {
    type: "bar",
    data: { labels: [], datasets: [{ label: "Core AI Bills", data: [], backgroundColor: CRIMSON }] },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => fmt(ctx.parsed.x) } },
      },
      scales: {
        x: { ticks: { callback: v => fmt(v) }, grid: { color: "#e5e7eb" } },
        y: { grid: { display: false } },
      },
    },
  });

  function updateConceptsChart() {
    const year = conceptsYearSelect ? conceptsYearSelect.value : "";
    let sorted;
    if (year && conceptsByYear && conceptsByYear.length) {
      sorted = [...conceptsByYear]
        .map(c => ({ concept: c.concept, count: c.by_year[year] || 0 }))
        .filter(c => c.count > 0)
        .sort((a, b) => b.count - a.count);
    } else {
      sorted = [...concepts]
        .sort((a, b) => b.core_count - a.core_count)
        .map(c => ({ concept: c.concept, count: c.core_count }));
    }
    conceptsChart.data.labels = sorted.map(d => d.concept);
    conceptsChart.data.datasets[0].data = sorted.map(d => d.count);
    conceptsChart.update();
  }

  if (conceptsYearSelect) conceptsYearSelect.addEventListener("change", updateConceptsChart);
  updateConceptsChart();
}

/* ── Main entry point ────────────────────────────────────── */
async function main() {
  initTabs();

  try {
    // Load dashboard data and TopoJSON in parallel (TopoJSON shared by hero + choropleth)
    const [summary, stateData, manifest, byYear, concepts, topStatesByYear, conceptsByYear, usTopoJson] = await Promise.all([
      loadJSON("./data/summary.json"),
      loadJSON("./data/states.json"),
      loadJSON("./data/bills_manifest.json"),
      loadJSON("./data/by_year.json").catch(() => []),
      loadJSON("./data/concepts.json").catch(() => []),
      loadJSON("./data/top_states_by_year.json").catch(() => ({})),
      loadJSON("./data/concepts_by_year.json").catch(() => []),
      d3.json("https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json"),
    ]);

    renderMetrics(summary);
    renderHeroMap(usTopoJson);
    renderTopStates(stateData);
    const navigateTo = initBillBrowser(manifest);
    renderMap(stateData, navigateTo, usTopoJson);
    renderTrends(byYear, concepts, topStatesByYear, conceptsByYear);

  } catch (err) {
    console.error("Dashboard failed to load:", err);
    document.getElementById("heroMeta").textContent =
      "Dashboard data unavailable. Run scripts/build_dashboard_data.py first.";
  }
}

main();
