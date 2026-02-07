/* ============================================================
   PM2.5 EWS — Dashboard Functions
   Stations, table rendering, city cards, data loading
   ============================================================ */

import {
    stations, citiesInfo, map, lastResults,
    setStations, setCitiesInfo, setLastResults, setLastCityAlerts,
    tableBody, statusEl, statsRow, stationCount, mapStatus
} from './state.js';
import { updateMapMarkers } from './map.js';

export async function loadStations() {
    try {
        const resp = await fetch("/api/stations/");
        const data = await resp.json();
        setStations(data.stations);
        setCitiesInfo(data.cities || {});
        stationCount.textContent = `${data.stations.length} stations across ${Object.keys(data.cities || {}).length} cities`;
        document.getElementById("stat-total").textContent = data.stations.length;
        renderTable(null);
        if (map) updateMapMarkers(null);
    } catch (e) {
        statusEl.textContent = `Error loading stations: ${e}`;
    }
}

export function renderTable(results) {
    // Re-import current state
    const currentStations = stations;

    const resultMap = {};
    if (results) results.forEach(r => { resultMap[r.id + (r.target_city || "")] = r; });

    let html = "";
    let currentCity = null;

    currentStations.forEach(st => {
        const city = st.target_city || "";
        if (city !== currentCity) {
            currentCity = city;
            html += `<div class="tier-sep" style="color:#3b82f6;font-size:13px;padding:12px 20px 6px;">${city}</div>`;
        }

        const r = resultMap[st.id + city] || (results ? results.find(x => x.id === st.id && x.target_city === city) : null);
        const hasData = !!r;
        const pm = hasData ? r.pm25.toFixed(1) : "—";
        const pred = hasData ? r.predicted.toFixed(1) : "—";
        const lead = hasData ? r.lead : "";
        let badge = "";
        if (hasData) {
            badge = `<span class="badge" style="background:${r.level_hex};color:${r.level_text_color}">${r.level_name}</span>`;
        }

        html += `<div class="row${hasData ? "" : " no-data"}">
            <span class="td-city">${city}</span>
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

export function updateCityCards(results, cityAlerts) {
    const cityNames = Object.keys(citiesInfo);

    cityNames.forEach(city => {
        const card = document.getElementById("card-" + city);
        if (!card) return;
        const levelEl = card.querySelector(".city-card-level");
        const detailEl = card.querySelector(".city-card-detail");

        if (!results || results.length === 0) {
            card.style.setProperty("--card-color", "#3b82f6");
            card.style.borderColor = "#27272a";
            levelEl.textContent = "Waiting for data";
            levelEl.style.color = "#fafafa";
            detailEl.textContent = "";
            return;
        }

        const cityResults = results.filter(r => r.target_city === city);
        if (cityResults.length === 0) {
            card.style.setProperty("--card-color", "#3b82f6");
            card.style.borderColor = "#27272a";
            levelEl.textContent = "No data";
            levelEl.style.color = "#71717a";
            detailEl.textContent = "";
            return;
        }

        // Use city-level alert if available
        const alert = cityAlerts && cityAlerts[city];
        if (alert) {
            card.style.setProperty("--card-color", alert.level_hex);
            card.style.borderColor = alert.level_hex + "44";
            if (alert.alert) {
                const ruleLabel = alert.rule === "rule1" ? "Single station ≥55" : "Dual station sustained";
                levelEl.textContent = `${alert.level_name}  ·  ${alert.predicted_pm25} µg/m³`;
                levelEl.style.color = alert.level_hex;
                detailEl.textContent = `${ruleLabel} · ${cityResults.length} stations`;
            } else {
                levelEl.textContent = `No Alert  ·  ${alert.predicted_pm25} µg/m³`;
                levelEl.style.color = alert.level_hex;
                detailEl.textContent = `${cityResults.length} stations reporting`;
            }
        } else {
            // Fallback: use worst station prediction
            const worst = cityResults[0];
            card.style.setProperty("--card-color", worst.level_hex);
            card.style.borderColor = worst.level_hex + "44";
            levelEl.textContent = `${worst.level_name}  ·  ${worst.predicted.toFixed(1)} µg/m³`;
            levelEl.style.color = worst.level_hex;
            detailEl.textContent = `via ${worst.station} · ${cityResults.length} stations`;
        }
    });

    if (results && results.length > 0) {
        statsRow.style.display = "grid";
        const worst = results[0];
        document.getElementById("stat-worst").textContent = worst.predicted.toFixed(1);
        document.getElementById("stat-worst").style.color = worst.level_hex;
        document.getElementById("stat-reporting").textContent = results.length;
        const tier1 = results.filter(r => r.tier === 1);
        document.getElementById("stat-lead").textContent = tier1.length > 0 ? tier1[0].lead : results[0].lead;
    } else {
        statsRow.style.display = "none";
    }
}

export function handleResults(results, label, cityAlerts) {
    setLastResults(results);
    setLastCityAlerts(cityAlerts || null);
    renderTable(results);
    updateCityCards(results, cityAlerts);
    if (map) updateMapMarkers(results);
    const count = results ? results.length : 0;
    statusEl.textContent = `${label} · ${count} stations reporting`;
    mapStatus.textContent = `${label} · ${count} stations`;
}

export async function runDemo() {
    statusEl.textContent = "Loading demo scenario...";
    try {
        const resp = await fetch("/api/demo/");
        const data = await resp.json();
        handleResults(data.results, "Demo: All cities wildfire scenario", data.city_alerts);
    } catch (e) {
        statusEl.textContent = `Error: ${e}`;
    }
}

export async function loadLiveData() {
    statusEl.textContent = "Loading live data...";
    try {
        const resp = await fetch("/api/live/");
        const data = await resp.json();
        if (data.results && data.results.length > 0) {
            const age = data.age_seconds || 0;
            const mins = Math.floor(age / 60);
            let label;
            if (mins < 1) label = "Live data · just updated";
            else if (mins < 60) label = `Live data · updated ${mins} min ago`;
            else label = `Live data · updated ${Math.floor(mins / 60)}h ${mins % 60}m ago`;
            handleResults(data.results, label, data.city_alerts);
            return true;
        }
    } catch (e) { /* ignore */ }
    return false;
}
