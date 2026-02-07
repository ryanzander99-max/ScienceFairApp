/* ============================================================
   PM2.5 EWS — State Management
   Shared state and DOM references
   ============================================================ */

// Shared state
export let stations = [];
export let citiesInfo = {};
export let map = null;
export let mapMarkers = [];
export let lastResults = null;
export let lastCityAlerts = null;

// State setters
export function setStations(s) { stations = s; }
export function setCitiesInfo(c) { citiesInfo = c; }
export function setMap(m) { map = m; }
export function setMapMarkers(m) { mapMarkers = m; }
export function setLastResults(r) { lastResults = r; }
export function setLastCityAlerts(a) { lastCityAlerts = a; }

// DOM refs
export const tableBody = document.getElementById("table-body");
export const statusEl = document.getElementById("status");
export const statsRow = document.getElementById("stats-row");
export const stationCount = document.getElementById("station-count");
export const mapStatus = document.getElementById("map-status");
