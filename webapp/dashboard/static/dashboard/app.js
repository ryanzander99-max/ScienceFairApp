/* ============================================================
   PM2.5 EWS — App Entry Point
   Imports all modules and initializes the application
   ============================================================ */

import { statusEl } from './js/state.js';
import { initNavigation } from './js/navigation.js';
import { loadStations, loadLiveData, runDemo } from './js/dashboard.js';
import { mapRunDemo } from './js/map.js';
import { initFeedbackBoard } from './js/feedback.js';

// Initialize navigation
initNavigation();

// Initialize app
async function init() {
    await loadStations();
    const hasLive = await loadLiveData();
    if (!hasLive) {
        statusEl.textContent = "No live data yet — run demo or wait for next refresh";
    }
    initFeedbackBoard();
}
init();

// Expose functions for HTML onclick handlers
window.runDemo = runDemo;
window.mapRunDemo = mapRunDemo;
