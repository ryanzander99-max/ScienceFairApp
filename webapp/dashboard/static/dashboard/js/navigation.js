/* ============================================================
   PM2.5 EWS — Navigation
   Tab switching, research nav, account dropdown
   ============================================================ */

import { initMap } from './map.js';

// Tab switching (sidebar)
export function initNavigation() {
    document.querySelectorAll(".sidebar-tab").forEach(t => {
        t.addEventListener("click", () => {
            document.querySelector(".sidebar-tab.tab-active")?.classList.remove("tab-active");
            t.classList.add("tab-active");
            document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("tab-visible"));
            document.getElementById("tab-" + t.dataset.tab).classList.add("tab-visible");
            if (t.dataset.tab === "map") initMap();
        });
    });

    // Research nav
    document.querySelectorAll(".rnav").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelector(".rnav-active").classList.remove("rnav-active");
            btn.classList.add("rnav-active");
            document.querySelectorAll(".research-section").forEach(s => s.classList.remove("research-visible"));
            document.getElementById("sec-" + btn.dataset.section).classList.add("research-visible");
        });
    });

    // Account dropdown
    const accountToggle = document.getElementById("account-toggle");
    const accountMenu = document.getElementById("account-menu");

    if (accountToggle && accountMenu) {
        accountToggle.addEventListener("click", (e) => {
            e.stopPropagation();
            accountMenu.classList.toggle("open");
        });

        document.addEventListener("click", (e) => {
            if (!accountMenu.contains(e.target) && !accountToggle.contains(e.target)) {
                accountMenu.classList.remove("open");
            }
        });
    }
}
