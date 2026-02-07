/* ============================================================
   PM2.5 EWS — Feedback Board
   Suggestions, voting, comments
   ============================================================ */

import { escapeHtml, timeAgo } from './utils.js';

let feedbackAuth = { authenticated: false, username: "" };
let currentSort = "hot";
let currentSuggestionId = null;

export function initFeedbackBoard() {
    // Check auth status
    fetch("/api/auth-status/")
        .then(r => r.json())
        .then(data => { feedbackAuth = data; })
        .catch(() => {});

    // Sort buttons
    document.querySelectorAll(".sort-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".sort-btn").forEach(b => b.classList.remove("sort-active"));
            btn.classList.add("sort-active");
            currentSort = btn.dataset.sort;
            loadSuggestions();
        });
    });

    // New suggestion button
    document.getElementById("btn-new-suggestion")?.addEventListener("click", () => {
        if (!feedbackAuth.authenticated) {
            document.getElementById("modal-login").style.display = "flex";
            return;
        }
        document.getElementById("suggestion-title").value = "";
        document.getElementById("suggestion-body").value = "";
        document.getElementById("suggestion-error").style.display = "none";
        document.getElementById("modal-suggestion").style.display = "flex";
    });

    // Modal closes
    document.getElementById("modal-suggestion-close")?.addEventListener("click", () => {
        document.getElementById("modal-suggestion").style.display = "none";
    });
    document.getElementById("modal-suggestion-cancel")?.addEventListener("click", () => {
        document.getElementById("modal-suggestion").style.display = "none";
    });
    document.getElementById("modal-detail-close")?.addEventListener("click", () => {
        document.getElementById("modal-detail").style.display = "none";
    });
    document.getElementById("modal-login-close")?.addEventListener("click", () => {
        document.getElementById("modal-login").style.display = "none";
    });

    // Close modals on overlay click
    ["modal-suggestion", "modal-detail", "modal-login"].forEach(id => {
        document.getElementById(id)?.addEventListener("click", (e) => {
            if (e.target.classList.contains("modal-overlay")) {
                e.target.style.display = "none";
            }
        });
    });

    // Submit suggestion
    document.getElementById("modal-suggestion-submit")?.addEventListener("click", submitSuggestion);

    // Vote buttons in detail modal
    document.getElementById("detail-upvote")?.addEventListener("click", () => voteSuggestion(1));
    document.getElementById("detail-downvote")?.addEventListener("click", () => voteSuggestion(-1));

    // Add comment
    document.getElementById("btn-add-comment")?.addEventListener("click", addComment);

    // Delete suggestion
    document.getElementById("btn-delete-suggestion")?.addEventListener("click", deleteSuggestion);

    // Load initial suggestions
    loadSuggestions();
}

async function loadSuggestions() {
    const list = document.getElementById("suggestions-list");
    if (!list) return;

    try {
        const resp = await fetch(`/api/suggestions/?sort=${currentSort}`);
        const data = await resp.json();

        if (!data.suggestions || data.suggestions.length === 0) {
            list.innerHTML = `<div class="suggestions-empty">No suggestions yet. Be the first to share an idea!</div>`;
            return;
        }

        list.innerHTML = data.suggestions.map(s => `
            <div class="suggestion-card" data-id="${s.id}">
                <div class="suggestion-votes">
                    <button class="vote-btn vote-up ${s.user_vote === 1 ? 'voted-up' : ''}" data-id="${s.id}" data-vote="1">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="18 15 12 9 6 15"/></svg>
                    </button>
                    <span class="suggestion-score">${s.score}</span>
                    <button class="vote-btn vote-down ${s.user_vote === -1 ? 'voted-down' : ''}" data-id="${s.id}" data-vote="-1">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
                    </button>
                </div>
                <img src="${s.author_avatar}" alt="" class="suggestion-avatar">
                <div class="suggestion-content">
                    <div class="suggestion-title">${escapeHtml(s.title)}</div>
                    <div class="suggestion-meta">
                        <span class="suggestion-author">${escapeHtml(s.author)}</span>
                        <span>${timeAgo(s.created_at)}</span>
                        <span>${s.comment_count} comment${s.comment_count !== 1 ? 's' : ''}</span>
                    </div>
                </div>
            </div>
        `).join("");

        // Click handlers for cards
        list.querySelectorAll(".suggestion-card").forEach(card => {
            card.addEventListener("click", (e) => {
                if (e.target.closest(".vote-btn")) return;
                openSuggestionDetail(parseInt(card.dataset.id));
            });
        });

        // Vote button handlers
        list.querySelectorAll(".vote-btn").forEach(btn => {
            btn.addEventListener("click", (e) => {
                e.stopPropagation();
                const id = parseInt(btn.dataset.id);
                const vote = parseInt(btn.dataset.vote);
                quickVote(id, vote, btn);
            });
        });
    } catch (e) {
        list.innerHTML = `<div class="suggestions-empty">Failed to load suggestions</div>`;
    }
}

async function quickVote(suggestionId, value, btn) {
    if (!feedbackAuth.authenticated) {
        document.getElementById("modal-login").style.display = "flex";
        return;
    }

    const card = btn.closest(".suggestion-card");
    const scoreEl = card.querySelector(".suggestion-score");
    const upBtn = card.querySelector(".vote-up");
    const downBtn = card.querySelector(".vote-down");

    // Toggle vote
    const wasVoted = btn.classList.contains(value === 1 ? "voted-up" : "voted-down");
    const newValue = wasVoted ? 0 : value;

    try {
        const resp = await fetch(`/api/suggestions/${suggestionId}/vote/`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ value: newValue }),
        });
        const data = await resp.json();
        if (resp.ok) {
            scoreEl.textContent = data.score;
            upBtn.classList.toggle("voted-up", data.user_vote === 1);
            downBtn.classList.toggle("voted-down", data.user_vote === -1);
        }
    } catch (e) {
        console.error("Vote failed:", e);
    }
}

async function openSuggestionDetail(id) {
    currentSuggestionId = id;
    const modal = document.getElementById("modal-detail");

    try {
        const resp = await fetch(`/api/suggestions/${id}/`);
        const s = await resp.json();

        document.getElementById("detail-title").textContent = s.title;
        document.getElementById("detail-avatar").src = s.author_avatar;
        document.getElementById("detail-author").textContent = s.author;
        document.getElementById("detail-date").textContent = timeAgo(s.created_at);
        document.getElementById("detail-body").textContent = s.body;
        document.getElementById("detail-score").textContent = s.score;

        const upBtn = document.getElementById("detail-upvote");
        const downBtn = document.getElementById("detail-downvote");
        upBtn.classList.toggle("voted-up", s.user_vote === 1);
        downBtn.classList.toggle("voted-down", s.user_vote === -1);

        const commentsEl = document.getElementById("detail-comments");
        if (s.comments.length === 0) {
            commentsEl.innerHTML = `<div class="comments-empty">No comments yet</div>`;
        } else {
            commentsEl.innerHTML = s.comments.map(c => `
                <div class="comment-item">
                    <img src="${c.author_avatar}" alt="" class="comment-avatar">
                    <div class="comment-content">
                        <div class="comment-header">
                            <span class="comment-author">${escapeHtml(c.author)}</span>
                            <span class="comment-date">${timeAgo(c.created_at)}</span>
                        </div>
                        <div class="comment-body">${escapeHtml(c.body)}</div>
                    </div>
                </div>
            `).join("");
        }

        document.getElementById("comment-input").value = "";
        document.getElementById("comment-error").style.display = "none";

        // Show/hide delete button based on ownership
        const deleteBtn = document.getElementById("btn-delete-suggestion");
        if (s.is_owner) {
            deleteBtn.classList.remove("hidden");
        } else {
            deleteBtn.classList.add("hidden");
        }

        modal.style.display = "flex";
    } catch (e) {
        console.error("Failed to load suggestion:", e);
    }
}

async function voteSuggestion(value) {
    if (!feedbackAuth.authenticated) {
        document.getElementById("modal-login").style.display = "flex";
        return;
    }
    if (!currentSuggestionId) return;

    const upBtn = document.getElementById("detail-upvote");
    const downBtn = document.getElementById("detail-downvote");
    const scoreEl = document.getElementById("detail-score");

    const wasVoted = (value === 1 && upBtn.classList.contains("voted-up")) ||
                     (value === -1 && downBtn.classList.contains("voted-down"));
    const newValue = wasVoted ? 0 : value;

    try {
        const resp = await fetch(`/api/suggestions/${currentSuggestionId}/vote/`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ value: newValue }),
        });
        const data = await resp.json();
        if (resp.ok) {
            scoreEl.textContent = data.score;
            upBtn.classList.toggle("voted-up", data.user_vote === 1);
            downBtn.classList.toggle("voted-down", data.user_vote === -1);
            loadSuggestions(); // Refresh list
        }
    } catch (e) {
        console.error("Vote failed:", e);
    }
}

async function deleteSuggestion() {
    if (!currentSuggestionId) return;

    if (!confirm("Are you sure you want to delete this suggestion? This cannot be undone.")) {
        return;
    }

    try {
        const resp = await fetch(`/api/suggestions/${currentSuggestionId}/delete/`, {
            method: "DELETE",
        });
        const data = await resp.json();

        if (resp.ok) {
            document.getElementById("modal-detail").style.display = "none";
            loadSuggestions();
        } else {
            alert(data.error || "Failed to delete suggestion");
        }
    } catch (e) {
        console.error("Delete failed:", e);
        alert("Failed to delete suggestion");
    }
}

async function submitSuggestion() {
    const title = document.getElementById("suggestion-title").value.trim();
    const body = document.getElementById("suggestion-body").value.trim();
    const errorEl = document.getElementById("suggestion-error");

    if (!title || title.length < 5) {
        errorEl.textContent = "Title must be at least 5 characters";
        errorEl.style.display = "block";
        return;
    }
    if (!body || body.length < 10) {
        errorEl.textContent = "Description must be at least 10 characters";
        errorEl.style.display = "block";
        return;
    }

    try {
        const resp = await fetch("/api/suggestions/create/", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title, body }),
        });
        const data = await resp.json();

        if (!resp.ok) {
            errorEl.textContent = data.error || "Failed to create suggestion";
            errorEl.style.display = "block";
            return;
        }

        document.getElementById("modal-suggestion").style.display = "none";
        loadSuggestions();
    } catch (e) {
        errorEl.textContent = "Network error";
        errorEl.style.display = "block";
    }
}

async function addComment() {
    if (!feedbackAuth.authenticated) {
        document.getElementById("modal-login").style.display = "flex";
        return;
    }
    if (!currentSuggestionId) return;

    const input = document.getElementById("comment-input");
    const body = input.value.trim();
    const errorEl = document.getElementById("comment-error");

    if (!body || body.length < 2) {
        errorEl.textContent = "Comment must be at least 2 characters";
        errorEl.style.display = "block";
        return;
    }

    try {
        const resp = await fetch(`/api/suggestions/${currentSuggestionId}/comments/`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ body }),
        });
        const data = await resp.json();

        if (!resp.ok) {
            errorEl.textContent = data.error || "Failed to add comment";
            errorEl.style.display = "block";
            return;
        }

        // Add comment to list
        const commentsEl = document.getElementById("detail-comments");
        const emptyMsg = commentsEl.querySelector(".comments-empty");
        if (emptyMsg) emptyMsg.remove();

        commentsEl.insertAdjacentHTML("beforeend", `
            <div class="comment-item">
                <img src="${data.author_avatar}" alt="" class="comment-avatar">
                <div class="comment-content">
                    <div class="comment-header">
                        <span class="comment-author">${escapeHtml(data.author)}</span>
                        <span class="comment-date">just now</span>
                    </div>
                    <div class="comment-body">${escapeHtml(data.body)}</div>
                </div>
            </div>
        `);

        input.value = "";
        errorEl.style.display = "none";
        loadSuggestions(); // Refresh comment count
    } catch (e) {
        errorEl.textContent = "Network error";
        errorEl.style.display = "block";
    }
}
