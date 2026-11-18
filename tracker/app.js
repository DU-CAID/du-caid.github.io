/* =============================================================
   U.S. State AI Policy Dashboard - app.js
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
  // Reject implausible years - TX uses session numbers like 8496, 86, 87...
  return (y >= 1990 && y <= 2035) ? m[1] : null;
}

// "no-cache" = always ask the server whether a data file changed (a quick "not modified" reply
// if it didn't). Without it, browsers can keep showing data from before an update.
const FETCH_OPTS = { cache: "no-cache" };

async function loadJSON(path) {
  const res = await fetch(path, FETCH_OPTS);
  if (!res.ok) throw new Error(`Failed to load ${path} (${res.status})`);
  return res.json();
}

/* ── Sponsor helpers ─────────────────────────────────────── */
// Escape text before putting it into HTML (sponsor names come from external data)
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

const PARTY_NAMES = { D: "Democrat", R: "Republican", Other: "Other / independent" };

// Party shown as a letter AND a colour, so it never relies on colour alone
function partyBadge(p) {
  if (!p) return "";
  const letter = p === "Other" ? "O" : p;
  return `<span class="party-badge p${letter}" title="${esc(PARTY_NAMES[p] || p)}">${letter}</span>`;
}

// A sponsor entry is [name, party, id]; matched legislators get a link to their bills
function sponsorHTML(s) {
  if (!s) return "-";
  const [name, party, id] = s;
  const label = id
    ? `<a href="#" class="sponsor-link" title="Show this legislator’s bills" data-sponsor-id="${esc(id)}" data-sponsor-name="${esc(name)}">${esc(name)}</a>`
    : esc(name);
  return `<span class="sp">${label}${partyBadge(party)}</span>`;  // keeps the badge on the name's line
}

/* ── Tab switching ───────────────────────────────────────── */
function initTabs() {
  // Each tab has its own address (#bills, #methods, ...) so the browser's Back button
  // returns to the previous tab instead of leaving the tracker.
  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      showTab(btn.dataset.tab);
      pushHash(btn.dataset.tab);
    });
  });
}

// Show one tab (no history change)
function showTab(name) {
  const panel = document.getElementById("tab-" + name);
  const btn = document.querySelector(`.tab-btn[data-tab="${name}"]`);
  if (!panel || !btn) return false;
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
  document.querySelectorAll(".tab-panel").forEach(p => p.classList.add("hidden"));
  btn.classList.add("active");
  panel.classList.remove("hidden");
  return true;
}

// Add a history entry (skipped if we are already there)
function pushHash(hash) {
  if (location.hash !== "#" + hash) history.pushState(null, "", "#" + hash);
}

/* ── Metric cards ────────────────────────────────────────── */
function renderMetrics(summary) {
  document.getElementById("m-core").textContent     = fmt(summary.core_flagged_bills);
  document.getElementById("m-adjacent").textContent = fmt(summary.tracker_only_bills);
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

  // State fills - very subtle lighter crimson
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
      tooltip.textContent   = `${name} - ${fmt(count)} ${kind} bills (click to browse)`;
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

  // Core AI - sorted by core count
  const topCore = [...stateData].sort((a, b) => b.core - a.core).slice(0, 15);
  new Chart(document.getElementById("topStatesCoreChart"), {
    type: "bar",
    data: {
      labels: topCore.map(s => s.state),
      datasets: [{ label: "Core AI Bills", data: topCore.map(s => s.core), backgroundColor: CRIMSON }],
    },
    options: barOptions(CRIMSON),
  });

}

/* ── Bill Browser ────────────────────────────────────────── */
function initBillBrowser(manifest) {
  const stateSelect   = document.getElementById("stateFilter");
  const yearSelect    = document.getElementById("yearFilter");
  const chamberSelect = document.getElementById("chamberFilter");
  const sortSelect    = document.getElementById("sortSelect");
  const ncslCheck     = document.getElementById("ncslFilter");
  const searchInput   = document.getElementById("searchInput");
  const partySelect   = document.getElementById("partyFilter");
  const tbody         = document.getElementById("billsTbody");
  const countEl       = document.getElementById("resultsCount");

  // Sponsor filter: set from the Legislators tab or by clicking a sponsor's name
  let sponsorFilter = null;  // { id, name }
  const sponsorChip     = document.getElementById("sponsorChip");
  const sponsorChipName = document.getElementById("sponsorChipName");
  function setSponsorFilter(f) {
    sponsorFilter = f;
    if (sponsorChip) {
      sponsorChip.style.display = f ? "flex" : "none";
      sponsorChipName.textContent = f ? f.name : "";
    }
  }
  const sponsorsOf = b => [...(b.primary || []), ...(b.co || [])];

  // Build state → path lookup
  const byState = {};
  manifest.forEach(row => { if (row.state) byState[row.state] = row.path; });

  // Populate state dropdown (sorted alphabetically)
  Object.keys(byState).sort().forEach(abbr => {
    const opt = document.createElement("option");
    opt.value = abbr;
    opt.textContent = `${abbr} - ${STATE_NAMES[abbr] || abbr}`;
    stateSelect.appendChild(opt);
  });

  // Per-state bill cache
  const cache = {};
  let currentBills = [];

  async function loadState(abbr) {
    if (!abbr) {
      // "All States" - fetch all state files in parallel
      if (cache["__ALL__"]) { currentBills = cache["__ALL__"]; return; }
      const states = Object.keys(byState);
      const results = await Promise.all(
        states.map(st =>
          fetch("./data/bills_by_state/" + st + ".json", FETCH_OPTS)
            .then(r => r.ok ? r.json() : [])
            .catch(() => [])
        )
      );
      cache["__ALL__"] = results.flat();
      currentBills = cache["__ALL__"];
      return;
    }
    if (cache[abbr]) { currentBills = cache[abbr]; return; }
    const res = await fetch("./data/bills_by_state/" + abbr + ".json", FETCH_OPTS);
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
    const chamber = chamberSelect.value;
    const ncsl    = ncslCheck.checked;
    const sort    = sortSelect.value;
    const party   = partySelect ? partySelect.value : "";

    let result = currentBills.filter(b => {
      if (year && yearFromSession(b.session) !== year) return false;
      if (chamber === "house"  && !/^H/i.test(b.identifier))                       return false;
      if (chamber === "senate" && !/^S/i.test(b.identifier))                       return false;
      if (ncsl && !b.in_ncsl) return false;
      if (party && b.lead_party !== party) return false;
      if (sponsorFilter && !sponsorsOf(b).some(s => s[2] === sponsorFilter.id)) return false;
      if (q) {
        const hay = [b.identifier, b.title, b.session,
                     ...(b.matched_concepts || []),
                     ...sponsorsOf(b).map(s => s[0])].join(" ").toLowerCase();
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
  let lastFilteredBills = [];

  function downloadCSV() {
    if (!lastFilteredBills.length) return;
    const cols = [
      "state", "session", "identifier", "title",
      "in_ncsl", "ncsl_status",
      "latest_action_date", "latest_action_description",
      "matched_concepts", "primary_url",
      "lead_sponsor", "lead_sponsor_party", "primary_sponsors", "cosponsor_count",
    ];
    const escape = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const named = s => s[1] ? `${s[0]} (${s[1]})` : s[0];
    const rows = [cols.join(",")];
    lastFilteredBills.forEach(b => {
      rows.push([
        b.state, b.session, b.identifier, b.title,
        b.in_ncsl ? "TRUE" : "FALSE",
        b.ncsl_status,
        b.latest_action_date, b.latest_action_description,
        (b.matched_concepts || []).join("; "),
        b.primary_url,
        b.lead ? b.lead[0] : "", b.lead_party || "",
        (b.primary || []).map(named).join("; "), b.co_n ?? "",
      ].map(escape).join(","));
    });
    const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    const stateLabel = stateSelect.value
      ? stateSelect.value.toLowerCase()
      : "all-states";
    a.href     = url;
    a.download = `caid-ai-bills-${stateLabel}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const capNotice = document.getElementById("capNotice");

  function renderTable(bills) {
    tbody.innerHTML = "";
    lastFilteredBills = bills;
    const dlBtn = document.getElementById("downloadCsvBtn");
    if (dlBtn) dlBtn.disabled = bills.length === 0;

    const shown = bills.slice(0, 500);
    countEl.textContent = bills.length === 0
      ? "No bills match the current filters."
      : `Showing ${fmt(shown.length)} of ${fmt(bills.length)} bills`;

    if (capNotice) {
      if (bills.length > 500) {
        capNotice.textContent = `Displaying the first 500 of ${fmt(bills.length)} matching bills. Use the filters above to narrow results, or use Download CSV to export the full set.`;
        capNotice.style.display = "block";
      } else {
        capNotice.style.display = "none";
      }
    }

    shown.forEach(b => {
      const isCore = b.core_ai_hits > 0;
      const billRow = document.createElement("tr");
      billRow.className = "bill-row" + (b.bill_id === expandedBillId ? " expanded" : "");
      billRow.dataset.billId = b.bill_id;

      const billLink = b.primary_url
        ? `<a href="${b.primary_url}" target="_blank" rel="noopener noreferrer">${b.identifier || "-"}</a>`
        : (b.identifier || "-");

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
          <strong>${b.title || (b.source_bucket === "ncsl_only" ? '<em style="color:var(--muted);font-weight:400">NCSL record - title not available</em>' : '<em style="color:var(--muted);font-weight:400">(no title)</em>')}</strong>
          ${concepts ? `<br><span style="color:var(--muted);font-size:0.82rem">${concepts}</span>` : ""}
        </td>
        <td class="lead-cell">${sponsorHTML(b.lead)}${(() => {
          const others = (b.primary || []).length - (b.lead ? 1 : 0) + (b.co_n || 0);
          return others > 0 ? `<br><span class="more">+ ${fmt(others)} more</span>` : "";
        })()}</td>
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

      billRow.addEventListener("click", (ev) => {
        if (ev.target.closest("a")) return;  // links (bill text, sponsor names) do their own thing
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
      ? `${b.latest_action_date ? b.latest_action_date + " - " : ""}${b.latest_action_description || ""}`
      : "-";

    const primaries = (b.primary || []).map(s => `<li>${sponsorHTML(s)}</li>`).join("");
    const cos = (b.co || []).map(s => `<li>${sponsorHTML(s)}</li>`).join("");
    const coMore = (b.co_n || 0) > (b.co || []).length
      ? `<li style="color:var(--muted)">… and ${fmt(b.co_n - b.co.length)} more</li>` : "";
    const sponsorBlock = (b.primary || b.co) ? `
          <div class="detail-field" style="grid-column:1/-1">
            <div class="field-label">Primary sponsors</div>
            <ul class="sponsor-list">${primaries || "<li style='color:var(--muted)'>none listed</li>"}</ul>
          </div>
          ${b.co_n ? `
          <div class="detail-field" style="grid-column:1/-1">
            <div class="field-label">Co-sponsors (${fmt(b.co_n)})</div>
            <ul class="sponsor-list">${cos}${coMore}</ul>
          </div>` : ""}` : "";

    detailRow.innerHTML = `
      <td colspan="9">
        <div class="bill-detail">
          ${sponsorBlock}
          <div class="detail-field">
            <div class="field-label">Bill ID</div>
            <div class="field-value" style="font-size:0.8rem;color:var(--muted)">${b.bill_id || "-"}</div>
          </div>
          <div class="detail-field">
            <div class="field-label">Source</div>
            <div class="field-value">${b.source_bucket || "-"}</div>
          </div>
          <div class="detail-field">
            <div class="field-label">Last updated</div>
            <div class="field-value">${b.updated || "-"}</div>
          </div>
          <div class="detail-field">
            <div class="field-label">Latest action</div>
            <div class="field-value">${latestAction}</div>
          </div>
          <div class="detail-field">
            <div class="field-label">NCSL</div>
            <div class="field-value">${b.in_ncsl ? "Yes - matched to NCSL AI legislation database" : "Not in NCSL database"}</div>
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

  document.getElementById("downloadCsvBtn")?.addEventListener("click", downloadCSV);
  stateSelect.addEventListener("change", () => selectState(stateSelect.value));
  yearSelect.addEventListener("change", runFilters);
  chamberSelect.addEventListener("change", runFilters);
  sortSelect.addEventListener("change", runFilters);
  ncslCheck.addEventListener("change", runFilters);
  searchInput.addEventListener("input", runFilters);
  partySelect?.addEventListener("change", runFilters);
  document.getElementById("sponsorChipClear")?.addEventListener("click", () => {
    setSponsorFilter(null);
    renderTable(applyFilters());
    history.replaceState(null, "", "#bills");
  });
  // Clicking a sponsor's name (in a row or the detail panel) filters to that legislator's bills
  tbody.addEventListener("click", ev => {
    const a = ev.target.closest("a.sponsor-link");
    if (!a) return;
    ev.preventDefault();
    expandedBillId = null;
    setSponsorFilter({ id: a.dataset.sponsorId, name: a.dataset.sponsorName });
    renderTable(applyFilters());
    pushHash(sponsorHash(a.dataset.sponsorId, a.dataset.sponsorName));
  });

  // Load all bills immediately so the browser is populated on first visit
  selectState("");

  const showBillsTab = () => showTab("bills");

  // Expose navigation function for map click-through
  async function navigateTo(abbr, tier, year) {
    showBillsTab();
    pushHash("bills");
    setSponsorFilter(null);
    await selectState(abbr);

    // Set year after populateYears() has rebuilt the dropdown
    if (year && yearSelect.querySelector(`option[value="${year}"]`)) {
      yearSelect.value = year;
      runFilters();
    }

    // Scroll bill browser into view
    document.getElementById("tab-bills").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // From the Legislators tab: show one legislator's bills (all states, so Congress and moves are covered)
  // push = false when replaying history (Back/Forward or a shared link)
  navigateTo.toSponsor = async function (id, name, push = true) {
    showBillsTab();
    if (push) pushHash(sponsorHash(id, name));
    setSponsorFilter({ id, name });
    yearSelect.value = "";
    if (partySelect) partySelect.value = "";
    searchInput.value = "";
    await selectState("");
    document.getElementById("tab-bills").scrollIntoView({ behavior: "smooth", block: "start" });
  };
  // Back to the plain Bill Browser (used when history returns to #bills)
  navigateTo.clearSponsor = function () {
    if (!sponsorFilter) return;
    setSponsorFilter(null);
    renderTable(applyFilters());
  };
  return navigateTo;
}

// Address for "bills sponsored by one legislator", e.g. #bills/sponsor/<id>/<name>
function sponsorHash(id, name) {
  return `bills/sponsor/${encodeURIComponent(id)}/${encodeURIComponent(name || "")}`;
}

// Show whatever the address (#...) asks for: on first load, and on Back / Forward
function route(navigateTo) {
  const parts = location.hash.replace(/^#/, "").split("/");
  const tab = parts[0] || "overview";
  if (tab === "bills" && parts[1] === "sponsor" && parts[2]) {
    navigateTo.toSponsor(decodeURIComponent(parts[2]), decodeURIComponent(parts[3] || "") || "selected legislator", false);
    return;
  }
  if (tab === "bills") navigateTo.clearSponsor();
  if (!showTab(tab)) showTab("overview");
}

/* ── Trends charts ───────────────────────────────────────── */
function renderTrends(byYear, concepts, topStatesByYear, conceptsByYear) {
  // Filter to 2019 through the CURRENT calendar year. Some states pre-file bills for next year's
  // session (e.g., Virginia's 2027 bills in November 2026); those stay in the Bill Browser but are
  // left out of the trend charts until that year starts, so a few pre-filed bills from one state
  // never show up as "the most recent year".
  const MAX_YEAR = String(new Date().getFullYear());
  const recentYears = byYear.filter(d => d.year >= "2019" && d.year <= MAX_YEAR);
  const yearLabels  = recentYears.map(d => d.year);

  // 1. Combined year chart - Core AI bills per year
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
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${fmt(ctx.parsed.y)}` } },
      },
      scales: {
        x: { grid: { display: false } },
        y: { ticks: { callback: v => fmt(v) }, grid: { color: "#e5e7eb" } },
      },
    },
  });

  // 2. Top states for most recent year
  const mostRecentYear = Object.keys(topStatesByYear || {}).filter(y => y <= MAX_YEAR).sort().reverse()[0];
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
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${fmt(ctx.parsed.y)}` } },
        },
        scales: {
          x: { grid: { display: false } },
          y: { ticks: { callback: v => fmt(v) }, grid: { color: "#e5e7eb" } },
        },
      },
    });
  }

  // 3. Core AI concepts - horizontal bar with year filter
  const conceptsYearSelect = document.getElementById("conceptsYearSelect");

  // Populate year dropdown from conceptsByYear data
  if (conceptsByYear && conceptsByYear.length) {
    const allConceptYears = Object.keys(conceptsByYear[0].by_year).filter(y => y >= "2019" && y <= MAX_YEAR).sort().reverse();
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

/* ── Legislators tab ─────────────────────────────────────── */
function renderLegislators(summary, legislators, navigateTo) {
  const PARTY_D = "#1F6FB8";
  const NEUTRAL = "#8A8F98";

  // Scope line and headline cards
  document.getElementById("legScope").textContent =
    `Statistics cover core AI state bills (not resolutions) introduced since 2019. Sponsors matched to a legislator: ` +
    `${(100 * summary.match_rate_ai).toFixed(1)}% of AI-bill sponsorships. Legislator roster updated ${summary.roster_downloaded}.`;
  const note = document.getElementById("matchRateNote");
  if (note) note.textContent = `For core AI state bills since 2019, ${(100 * summary.match_rate_ai).toFixed(1)}% of sponsorships are matched to a legislator.`;

  const years = summary.by_year;
  const thisYear = new Date().getFullYear();
  const fullYears = years.filter(d => d.year < thisYear);
  const latest = fullYears[fullYears.length - 1] || years[years.length - 1];
  const pooledSeats = summary.party_by_year.reduce((a, d) => a + d.seats_d, 0) / Math.max(1, summary.party_by_year.length);
  document.getElementById("lm-sponsors").textContent = fmt(summary.ai_sponsors_total);
  document.getElementById("lm-pct-year").textContent = latest ? latest.year : "-";
  document.getElementById("lm-pct").textContent = latest ? `${latest.pct_of_legislators}%` : "-";
  document.getElementById("lm-dem").textContent = `${summary.pooled_ai_lead_d}%`;
  document.getElementById("lm-dem-sub").textContent = `Democrats held about ${pooledSeats.toFixed(0)}% of seats over the same years`;
  document.getElementById("lm-top10").textContent = `${summary.top10pct_lead_share}%`;

  // Growth: one series, so no legend; the title names it
  new Chart(document.getElementById("legGrowthChart"), {
    type: "bar",
    data: {
      labels: years.map(d => String(d.year) + (d.year >= thisYear ? "*" : "")),
      datasets: [{ label: "Legislators sponsoring AI bills", data: years.map(d => d.ai_sponsors),
                   backgroundColor: CRIMSON, borderRadius: 4, maxBarThickness: 56 }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false },
                 tooltip: { callbacks: { label: c => {
                   const d = years[c.dataIndex];
                   return `${fmt(d.ai_sponsors)} legislators (${d.pct_of_legislators}% of those serving) · ${fmt(d.ai_bills)} AI bills`;
                 } } } },
      scales: { x: { grid: { display: false } },
                y: { beginAtZero: true, ticks: { callback: v => fmt(v) }, grid: { color: "#e5e7eb" } } },
    },
  });

  // Party share: AI bills vs all bills vs seats, for the party chosen in the Democrats | Republicans toggle
  const pb = summary.party_by_year;
  const PARTY_R = "#D32F2F";  // Republican red; validated against PARTY_D for colour-vision separation
  const PARTY_VIEW = {
    D: { noun: "Democrats", adj: "Democratic", color: PARTY_D, key: "d" },
    R: { noun: "Republicans", adj: "Republican", color: PARTY_R, key: "r" },
  };
  // y-axis: a 10-point grid that fits the chosen party's three lines with some room
  const yRange = vals => ({ min: Math.max(0, Math.floor((Math.min(...vals) - 5) / 10) * 10),
                            max: Math.min(100, Math.ceil((Math.max(...vals) + 5) / 10) * 10) });
  function partyDatasets(p) {
    const v = PARTY_VIEW[p];
    return [
      { label: `AI bills led by ${v.noun}`, data: pb.map(d => d["ai_" + v.key]), borderColor: v.color, backgroundColor: v.color,
        borderWidth: 2, pointRadius: 4, tension: 0 },
      { label: `All bills led by ${v.noun}`, data: pb.map(d => d["all_" + v.key]), borderColor: NEUTRAL, backgroundColor: NEUTRAL,
        borderWidth: 2, pointRadius: 4, tension: 0, borderDash: [6, 4] },
      { label: `${v.adj} share of seats`, data: pb.map(d => d["seats_" + v.key]), borderColor: GOLD, backgroundColor: GOLD,
        borderWidth: 2, pointRadius: 4, tension: 0, borderDash: [2, 3] },
    ];
  }
  const partyChart = new Chart(document.getElementById("legPartyChart"), {
    type: "line",
    data: { labels: pb.map(d => String(d.year) + (d.year >= thisYear ? "*" : "")), datasets: partyDatasets("D") },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: { legend: { position: "bottom", labels: { usePointStyle: true, pointStyle: "line", boxWidth: 40 } },
                 tooltip: { callbacks: { label: c => `${c.dataset.label}: ${c.parsed.y}%` } } },
      scales: { x: { grid: { display: false } },
                y: { ...yRange(partyDatasets("D").flatMap(s => s.data)),
                     ticks: { callback: v => v + "%" }, grid: { color: "#e5e7eb" } } },
    },
  });
  function showParty(p) {
    const v = PARTY_VIEW[p];
    partyChart.data.datasets = partyDatasets(p);
    Object.assign(partyChart.options.scales.y, yRange(partyChart.data.datasets.flatMap(s => s.data)));
    partyChart.update();
    document.getElementById("legPartyTitle").textContent = `${v.adj} Share: AI Bills, All Bills and Seats`;
    document.getElementById("legPartyDesc").textContent =
      `Share of bills whose lead (first-listed) sponsor is a ${v.noun.slice(0, -1)}, for core AI bills and for all state bills, ` +
      `compared with ${v.noun}’ share of state legislative seats.`;
    document.querySelectorAll(".seg-btn").forEach(b => {
      const on = b.dataset.party === p;
      b.classList.toggle("active", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }
  document.querySelectorAll(".seg-btn").forEach(b => b.addEventListener("click", () => showParty(b.dataset.party)));

  // Searchable legislator table
  const stateSel = document.getElementById("legState");
  const partySel = document.getElementById("legParty");
  const chamSel  = document.getElementById("legChamber");
  const search   = document.getElementById("legSearch");
  const tbody    = document.getElementById("legTbody");
  const countEl  = document.getElementById("legCount");
  [...new Set(legislators.map(l => l.state))].sort().forEach(s => {
    const o = document.createElement("option");
    o.value = s;
    o.textContent = s === "US" ? "US - Congress" : `${s} - ${STATE_NAMES[s] || s}`;
    stateSel.appendChild(o);
  });
  const CHAMBER = { lower: "House / Assembly", upper: "Senate", legislature: "Unicameral" };

  function render() {
    const q = search.value.trim().toLowerCase();
    const rows = legislators.filter(l =>
      (!stateSel.value || l.state === stateSel.value) &&
      (!partySel.value || l.party === partySel.value) &&
      (!chamSel.value || l.chamber === chamSel.value) &&
      (!q || (l.name || "").toLowerCase().includes(q)));
    const shown = rows.slice(0, 300);
    countEl.textContent = rows.length > 300
      ? `Showing the first 300 of ${fmt(rows.length)} legislators. Filter by state or search to narrow.`
      : `${fmt(rows.length)} legislators`;
    tbody.innerHTML = shown.map(l => `
      <tr tabindex="0" data-id="${esc(l.id)}" data-name="${esc(l.name)}">
        <td><strong>${esc(l.name)}</strong></td>
        <td>${esc(l.state)}</td>
        <td>${partyBadge(l.party)} <span style="font-size:0.8rem;color:var(--muted)">${esc(l.party_label || "")}</span></td>
        <td>${esc(CHAMBER[l.chamber] || l.chamber || "")}</td>
        <td class="num">${fmt(l.ai_lead)}</td>
        <td class="num">${fmt(l.ai_primary)}</td>
        <td class="num">${fmt(l.ai_cosponsor)}</td>
        <td>${l.first_year ?? ""}${l.last_year && l.last_year !== l.first_year ? "–" + l.last_year : ""}</td>
      </tr>`).join("");
  }
  const go = tr => tr && navigateTo.toSponsor(tr.dataset.id, tr.dataset.name);
  tbody.addEventListener("click", ev => go(ev.target.closest("tr")));
  tbody.addEventListener("keydown", ev => { if (ev.key === "Enter") go(ev.target.closest("tr")); });
  [stateSel, partySel, chamSel].forEach(el => el.addEventListener("change", render));
  search.addEventListener("input", debounce(render, 180));
  render();
}

/* ── Mobile site menu ────────────────────────────────────── */
function initSiteMenu() {
  const btn = document.querySelector(".nav-toggle");
  const links = document.getElementById("nav-links");
  if (!btn || !links) return;
  const setOpen = open => {
    links.classList.toggle("open", open);
    btn.setAttribute("aria-expanded", open ? "true" : "false");
  };
  btn.addEventListener("click", () => setOpen(!links.classList.contains("open")));
  // Close when clicking elsewhere or pressing Escape
  document.addEventListener("click", ev => { if (!ev.target.closest(".nav")) setOpen(false); });
  document.addEventListener("keydown", ev => { if (ev.key === "Escape") setOpen(false); });
}

/* ── Main entry point ────────────────────────────────────── */
async function main() {
  initSiteMenu();
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

    // Legislators tab (optional data: hidden if the sponsor files were not built)
    const [legSummary, legislators] = await Promise.all([
      loadJSON("./data/legislators_summary.json").catch(() => null),
      loadJSON("./data/legislators.json").catch(() => null),
    ]);
    if (legSummary && legislators) {
      renderLegislators(legSummary, legislators, navigateTo);
    } else {
      document.getElementById("legislatorsTabBtn")?.remove();
    }

    // Open the tab named in the address (e.g. a shared link to #methods), and follow Back/Forward
    route(navigateTo);
    window.addEventListener("popstate", () => route(navigateTo));

  } catch (err) {
    console.error("Dashboard failed to load:", err);
    document.getElementById("heroMeta").textContent =
      "Dashboard data unavailable. Run scripts/build_dashboard_data.py first.";
  }
}

main();
