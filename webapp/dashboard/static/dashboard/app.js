/* ============================================================
   PM2.5 EWS — App Logic
   ============================================================ */

let stations = [];
let currentCity = "Toronto";
let cityLat = 43.7479;
let cityLon = -79.2741;
let map = null;
let mapMarkers = [];
let mapCityMarker = null;
let lastResults = null;

// DOM refs
const banner = document.getElementById("banner");
const bannerTitle = document.getElementById("banner-title");
const bannerLevel = document.getElementById("banner-level");
const bannerHealth = document.getElementById("banner-health");
const tableBody = document.getElementById("table-body");
const statusEl = document.getElementById("status");
const btnFetch = document.getElementById("btn-fetch");
const statsRow = document.getElementById("stats-row");
const stationCount = document.getElementById("station-count");
const mapStatus = document.getElementById("map-status");
const mapBtnFetch = document.getElementById("map-btn-fetch");

// ---- Tab switching ----
document.querySelectorAll(".tab").forEach(t => {
    t.addEventListener("click", () => {
        document.querySelector(".tab-active").classList.remove("tab-active");
        t.classList.add("tab-active");
        document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("tab-visible"));
        document.getElementById("tab-" + t.dataset.tab).classList.add("tab-visible");

        if (t.dataset.tab === "map") {
            initMap();
        }
    });
});

// ---- City switching ----
document.querySelectorAll(".pill").forEach(pill => {
    pill.addEventListener("click", () => {
        document.querySelector(".pill-active")?.classList.remove("pill-active");
        pill.classList.add("pill-active");
        currentCity = pill.dataset.city;
        bannerTitle.textContent = currentCity.toUpperCase();
        resetBanner();
        lastResults = null;
        loadStations().then(() => fetchLive());
    });
});

// ---- Research nav ----
document.querySelectorAll(".rnav").forEach(btn => {
    btn.addEventListener("click", () => {
        document.querySelector(".rnav-active").classList.remove("rnav-active");
        btn.classList.add("rnav-active");
        document.querySelectorAll(".research-section").forEach(s => s.classList.remove("research-visible"));
        document.getElementById("sec-" + btn.dataset.section).classList.add("research-visible");
    });
});

// ---- Dashboard functions ----
function resetBanner() {
    banner.style.setProperty("--banner-color", "#3b82f6");
    banner.style.borderColor = "#27272a";
    bannerLevel.textContent = "Waiting for data";
    bannerLevel.style.color = "#fafafa";
    bannerHealth.textContent = "";
    bannerTitle.style.color = "#a1a1aa";
    statsRow.style.display = "none";
}

async function loadStations() {
    try {
        const resp = await fetch(`/api/stations/${currentCity}/`);
        const data = await resp.json();
        stations = data.stations;
        cityLat = data.city_lat;
        cityLon = data.city_lon;
        stationCount.textContent = `${stations.length} stations`;
        document.getElementById("stat-total").textContent = stations.length;
        renderTable(null);
        // Update map if visible
        if (map) updateMapMarkers(null);
    } catch (e) {
        statusEl.textContent = `Error loading stations: ${e}`;
    }
}

function renderTable(results) {
    const resultMap = {};
    if (results) results.forEach(r => { resultMap[r.id] = r; });

    let html = "";
    let currentTier = null;

    stations.forEach(st => {
        if (st.tier !== currentTier) {
            currentTier = st.tier;
            const label = st.tier === 1
                ? "Tier 1 — Greater than 250 km · 12–48 hr lead"
                : "Tier 2 — 100–250 km · 6–18 hr lead";
            html += `<div class="tier-sep">${label}</div>`;
        }

        const r = resultMap[st.id];
        const hasData = !!r;
        const pm = hasData ? r.pm25.toFixed(1) : "—";
        const pred = hasData ? r.predicted.toFixed(1) : "—";
        const lead = hasData ? r.lead : "";
        let badge = "";
        if (hasData) {
            badge = `<span class="badge" style="background:${r.level_hex};color:${r.level_text_color}">${r.level_name}</span>`;
        }

        html += `<div class="row${hasData ? "" : " no-data"}">
            <span class="td-station">${st.city_name}</span>
            <span class="td-dist">${st.distance.toFixed(0)} km</span>
            <span class="td-dir">${st.direction}</span>
            <span class="td-tier">T${st.tier}</span>
            <span class="td-pm">${pm}</span>
            <span class="td-pred">${pred}</span>
            <span class="td-level">${badge}</span>
            <span class="td-lead">${lead}</span>
        </div>`;
    });

    tableBody.innerHTML = html || `<div class="empty-state">
        <div class="empty-icon">📡</div>
        <div class="empty-text">No stations loaded</div>
    </div>`;
}

function updateBanner(results) {
    if (!results || results.length === 0) {
        resetBanner();
        bannerLevel.textContent = "No matching station data";
        return;
    }

    const worst = results[0];
    banner.style.setProperty("--banner-color", worst.level_hex);
    banner.style.borderColor = worst.level_hex + "44";
    bannerLevel.textContent = `${worst.level_name}  ·  ${worst.predicted.toFixed(1)} µg/m³`;
    bannerLevel.style.color = worst.level_hex;
    bannerHealth.textContent = worst.health;
    bannerTitle.style.color = "#a1a1aa";

    statsRow.style.display = "grid";
    document.getElementById("stat-worst").textContent = worst.predicted.toFixed(1);
    document.getElementById("stat-worst").style.color = worst.level_hex;
    document.getElementById("stat-reporting").textContent = results.length;

    const tier1 = results.filter(r => r.tier === 1);
    document.getElementById("stat-lead").textContent = tier1.length > 0 ? tier1[0].lead : results[0].lead;
}

function handleResults(results, label) {
    lastResults = results;
    renderTable(results);
    updateBanner(results);
    if (map) updateMapMarkers(results);
    const count = results ? results.length : 0;
    statusEl.textContent = `${label} · ${count} stations reporting`;
    mapStatus.textContent = `${label} · ${count} stations`;
}

async function runDemo() {
    statusEl.textContent = "Loading demo scenario...";
    try {
        const resp = await fetch(`/api/demo/${currentCity}/`);
        const data = await resp.json();
        handleResults(data.results, `Demo: ${currentCity} wildfire scenario`);
    } catch (e) {
        statusEl.textContent = `Error: ${e}`;
    }
}

const progressWrap = document.getElementById("progress-wrap");
const progressFill = document.getElementById("progress-fill");
const progressLabel = document.getElementById("progress-label");
let progressInterval = null;

function showProgress(label) {
    progressWrap.style.display = "block";
    progressLabel.textContent = label || "Fetching live data...";
    progressFill.style.width = "0%";
    let pct = 0;
    clearInterval(progressInterval);
    progressInterval = setInterval(() => {
        pct += (100 - pct) * 0.08;
        if (pct > 95) pct = 95;
        progressFill.style.width = pct + "%";
    }, 200);
}

function hideProgress() {
    clearInterval(progressInterval);
    progressFill.style.width = "100%";
    setTimeout(() => { progressWrap.style.display = "none"; }, 400);
}

async function fetchLive() {
    btnFetch.disabled = true;
    btnFetch.innerHTML = svgRefresh + " Fetching...";
    statusEl.textContent = "Connecting to OpenAQ...";
    showProgress("Fetching live data from OpenAQ...");
    try {
        const resp = await fetch(`/api/fetch/${currentCity}/`, { method: "POST" });
        const data = await resp.json();
        if (data.error) {
            statusEl.textContent = data.error;
        } else {
            const now = new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC";
            handleResults(data.results, `Live data · ${now}`);
        }
    } catch (e) {
        statusEl.textContent = `Error: ${e}`;
    } finally {
        hideProgress();
        btnFetch.disabled = false;
        btnFetch.innerHTML = svgRefresh + " Fetch Live Data";
    }
}

const svgRefresh = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 4v6h6"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>`;

// ---- Map functions ----
function initMap() {
    if (map) {
        map.invalidateSize();
        return;
    }
    map = L.map("map-container", {
        zoomControl: true,
        attributionControl: true,
    }).setView([cityLat, cityLon], 6);

    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
        maxZoom: 18,
    }).addTo(map);

    updateMapMarkers(lastResults);
}

function createCircleIcon(color, size) {
    return L.divIcon({
        className: "",
        html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:2px solid rgba(255,255,255,0.3);box-shadow:0 0 8px ${color}66;"></div>`,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
    });
}

function updateMapMarkers(results) {
    // Clear existing
    mapMarkers.forEach(m => map.removeLayer(m));
    mapMarkers = [];
    if (mapCityMarker) { map.removeLayer(mapCityMarker); mapCityMarker = null; }

    const resultMap = {};
    if (results) results.forEach(r => { resultMap[r.id] = r; });

    // City center marker
    mapCityMarker = L.marker([cityLat, cityLon], {
        icon: L.divIcon({
            className: "",
            html: `<div style="width:18px;height:18px;border-radius:50%;background:#3b82f6;border:3px solid white;box-shadow:0 0 12px #3b82f688;"></div>`,
            iconSize: [18, 18],
            iconAnchor: [9, 9],
        }),
        zIndexOffset: 1000,
    }).addTo(map);
    mapCityMarker.bindPopup(`<div class="popup-name">${currentCity}</div><div style="color:#a1a1aa">Target City</div>`);
    mapMarkers.push(mapCityMarker);

    // Station markers
    stations.forEach(st => {
        if (st.lat == null || st.lon == null) return;

        const r = resultMap[st.id];
        let color = "#52525b"; // no data
        let size = 10;
        let popupExtra = "";

        if (r) {
            color = r.level_hex;
            size = 14;
            popupExtra = `
                <div class="popup-row"><span class="popup-label">PM2.5:</span><span class="popup-val">${r.pm25.toFixed(1)} µg/m³</span></div>
                <div class="popup-row"><span class="popup-label">Predicted:</span><span class="popup-val" style="color:${r.level_hex}">${r.predicted.toFixed(1)} µg/m³</span></div>
                <div class="popup-row"><span class="popup-label">Level:</span><span class="popup-val"><span class="badge" style="background:${r.level_hex};color:${r.level_text_color};font-size:9px;padding:2px 6px">${r.level_name}</span></span></div>
                <div class="popup-row"><span class="popup-label">Lead Time:</span><span class="popup-val">${r.lead}</span></div>
            `;
        }

        const marker = L.marker([st.lat, st.lon], {
            icon: createCircleIcon(color, size),
        }).addTo(map);

        marker.bindPopup(`
            <div class="popup-name">${st.city_name}</div>
            <div class="popup-row"><span class="popup-label">Distance:</span><span class="popup-val">${st.distance.toFixed(0)} km ${st.direction}</span></div>
            <div class="popup-row"><span class="popup-label">Tier:</span><span class="popup-val">${st.tier}</span></div>
            <div class="popup-row"><span class="popup-label">R:</span><span class="popup-val">${st.R.toFixed(3)}</span></div>
            ${popupExtra}
        `);

        // Draw a faint line to city center if has data
        if (r) {
            const line = L.polyline([[st.lat, st.lon], [cityLat, cityLon]], {
                color: r.level_hex,
                weight: 1,
                opacity: 0.25,
                dashArray: "4 6",
            }).addTo(map);
            mapMarkers.push(line);
        }

        mapMarkers.push(marker);
    });

    // Fit bounds
    if (stations.length > 0) {
        const lats = stations.filter(s => s.lat).map(s => s.lat).concat([cityLat]);
        const lons = stations.filter(s => s.lon).map(s => s.lon).concat([cityLon]);
        map.fitBounds([
            [Math.min(...lats) - 1, Math.min(...lons) - 1],
            [Math.max(...lats) + 1, Math.max(...lons) + 1],
        ]);
    }
}

// Map buttons
async function mapRunDemo() {
    mapStatus.textContent = "Loading demo...";
    try {
        const resp = await fetch(`/api/demo/${currentCity}/`);
        const data = await resp.json();
        lastResults = data.results;
        updateMapMarkers(data.results);
        renderTable(data.results);
        updateBanner(data.results);
        mapStatus.textContent = `Demo: ${currentCity} · ${data.results.length} stations`;
    } catch (e) {
        mapStatus.textContent = `Error: ${e}`;
    }
}

async function mapFetchLive() {
    mapBtnFetch.disabled = true;
    mapStatus.textContent = "Fetching live data...";
    try {
        const resp = await fetch(`/api/fetch/${currentCity}/`, { method: "POST" });
        const data = await resp.json();
        if (data.error) {
            mapStatus.textContent = data.error;
        } else {
            lastResults = data.results;
            updateMapMarkers(data.results);
            renderTable(data.results);
            updateBanner(data.results);
            mapStatus.textContent = `Live data · ${data.results.length} stations`;
        }
    } catch (e) {
        mapStatus.textContent = `Error: ${e}`;
    } finally {
        mapBtnFetch.disabled = false;
    }
}

// Init — load stations then auto-fetch live data
const AUTO_REFRESH_MS = 15 * 60 * 1000; // 15 minutes

async function init() {
    await loadStations();
    fetchLive();
}

init();

// Auto-refresh every 15 minutes
setInterval(() => {
    fetchLive();
}, AUTO_REFRESH_MS);
