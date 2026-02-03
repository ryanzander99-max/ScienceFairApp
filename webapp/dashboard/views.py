import datetime
import os

from django.contrib import auth
from django.http import JsonResponse
from django.shortcuts import render, redirect
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt

from . import services
from .models import ReadingSnapshot, CachedResult, Suggestion, SuggestionVote, Comment


def index(request):
    cities = list(services.CITIES.keys())
    return render(request, "dashboard/index.html", {"cities": cities})


def api_stations(request, city=None):
    if city:
        stations = services.load_stations(city)
    else:
        stations = services.load_all_stations()
    return JsonResponse({
        "stations": stations,
        "cities": services.CITIES,
    })


def api_demo(request, city=None):
    if city:
        stations = services.load_stations(city)
        readings = services.DEMO_DATA.get(city, {})
    else:
        stations = services.load_all_stations()
        readings = services.get_all_demo_data()
    # Demo uses same readings as "previous" to simulate sustained conditions
    result = services.evaluate(stations, readings, previous_readings=readings)
    return JsonResponse({"results": result["stations"], "city_alerts": result["city_alerts"]})


def api_live(request):
    """Return the latest cached results from the server-side refresh. Public endpoint."""
    try:
        cached = CachedResult.objects.get(key="latest")
        age_seconds = (timezone.now() - cached.timestamp).total_seconds()
        return JsonResponse({
            "results": cached.results,
            "city_alerts": cached.city_alerts,
            "timestamp": cached.timestamp.isoformat(),
            "age_seconds": int(age_seconds),
        })
    except CachedResult.DoesNotExist:
        return JsonResponse({"results": None, "city_alerts": {}, "timestamp": None})


def api_refresh(request):
    """Cron endpoint: fetch WAQI data, evaluate, store in DB. Protected by CRON_SECRET."""
    # Verify secret token
    cron_secret = os.environ.get("CRON_SECRET", "")
    auth_header = request.headers.get("Authorization", "")
    if not cron_secret or auth_header != f"Bearer {cron_secret}":
        return JsonResponse({"error": "Unauthorized"}, status=401)

    config = services.load_config()
    api_key = config.get("api_key", "")
    if not api_key:
        return JsonResponse({"error": "No WAQI API token configured"}, status=400)

    try:
        stations = services.load_all_stations()
        readings = services.fetch_latest_pm25(api_key, stations)

        # Load previous readings for Rule 2 (dual-station sustained check)
        # Only use snapshots 20 min – 3 hours old
        now = timezone.now()
        previous_readings = {}
        for city_key in services.CITIES:
            try:
                snap = ReadingSnapshot.objects.get(city=city_key)
                age = now - snap.timestamp
                if datetime.timedelta(minutes=20) <= age <= datetime.timedelta(hours=3):
                    previous_readings.update(snap.readings)
            except ReadingSnapshot.DoesNotExist:
                pass

        result = services.evaluate(stations, readings, previous_readings=previous_readings)

        # Save current readings as snapshots for next refresh
        city_readings = {}
        for st in stations:
            sid = st["id"]
            if sid in readings:
                tc = st.get("target_city", "")
                city_readings.setdefault(tc, {})[sid] = readings[sid]
        for city_key, cr in city_readings.items():
            ReadingSnapshot.objects.update_or_create(city=city_key, defaults={"readings": cr})

        # Store evaluated results in CachedResult
        CachedResult.objects.update_or_create(
            key="latest",
            defaults={
                "results": result["stations"],
                "city_alerts": result["city_alerts"],
                "readings": readings,
            },
        )

        return JsonResponse({
            "ok": True,
            "stations_fetched": len(readings),
            "stations_evaluated": len(result["stations"]),
        })
    except Exception as e:
        import traceback
        return JsonResponse({"error": str(e), "trace": traceback.format_exc()}, status=500)


def api_auth_status(request):
    if request.user.is_authenticated:
        return JsonResponse({
            "authenticated": True,
            "username": request.user.get_full_name() or request.user.email or request.user.username,
        })
    return JsonResponse({"authenticated": False})


def logout_view(request):
    auth.logout(request)
    return redirect("/")


# ─────────────────────────────────────────────────────────────
# Feedback Board API
# ─────────────────────────────────────────────────────────────

import re

# Profanity filter word list (lowercase)
PROFANITY_LIST = [
    "fuck", "shit", "ass", "bitch", "damn", "crap", "dick", "cock", "pussy",
    "asshole", "bastard", "cunt", "fag", "faggot", "nigger", "nigga", "retard",
    "whore", "slut", "piss", "bollocks", "wanker", "twat", "prick", "douche",
]

def contains_profanity(text):
    """Check if text contains profanity. Returns the matched word or None."""
    text_lower = text.lower()
    # Remove common letter substitutions
    text_clean = text_lower.replace("@", "a").replace("$", "s").replace("0", "o").replace("1", "i").replace("3", "e")
    for word in PROFANITY_LIST:
        # Match whole word or with common boundaries
        pattern = r'\b' + re.escape(word) + r'\b'
        if re.search(pattern, text_clean):
            return word
        # Also check without word boundaries for concatenated profanity
        if word in text_clean:
            return word
    return None


def api_suggestions(request):
    """List all suggestions with vote counts and comment counts."""
    sort = request.GET.get("sort", "hot")  # hot, new, top
    suggestions = Suggestion.objects.all()

    # Build list with computed fields
    items = []
    for s in suggestions:
        score = s.vote_score()
        items.append({
            "id": s.id,
            "title": s.title,
            "body": s.body,
            "author": s.author.get_full_name() or s.author.username,
            "created_at": s.created_at.isoformat(),
            "score": score,
            "comment_count": s.comment_count(),
            "user_vote": 0,
        })

    # Add user's vote if authenticated
    if request.user.is_authenticated:
        user_votes = {v.suggestion_id: v.value for v in SuggestionVote.objects.filter(user=request.user)}
        for item in items:
            item["user_vote"] = user_votes.get(item["id"], 0)

    # Sort
    if sort == "new":
        items.sort(key=lambda x: x["created_at"], reverse=True)
    elif sort == "top":
        items.sort(key=lambda x: x["score"], reverse=True)
    else:  # hot: score weighted by recency
        now = timezone.now()
        for item in items:
            age_hours = (now - datetime.datetime.fromisoformat(item["created_at"])).total_seconds() / 3600
            item["_hot"] = item["score"] / (age_hours + 2) ** 1.5
        items.sort(key=lambda x: x["_hot"], reverse=True)
        for item in items:
            del item["_hot"]

    return JsonResponse({"suggestions": items})


@csrf_exempt
def api_suggestion_create(request):
    """Create a new suggestion. Requires authentication."""
    if not request.user.is_authenticated:
        return JsonResponse({"error": "Login required"}, status=401)
    if request.method != "POST":
        return JsonResponse({"error": "POST required"}, status=405)

    import json
    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({"error": "Invalid JSON"}, status=400)

    title = data.get("title", "").strip()
    body = data.get("body", "").strip()

    if not title or len(title) < 5:
        return JsonResponse({"error": "Title must be at least 5 characters"}, status=400)
    if not body or len(body) < 10:
        return JsonResponse({"error": "Description must be at least 10 characters"}, status=400)

    # Profanity check
    bad_word = contains_profanity(title) or contains_profanity(body)
    if bad_word:
        return JsonResponse({"error": "Please keep it professional — no profanity allowed"}, status=400)

    s = Suggestion.objects.create(author=request.user, title=title, body=body)
    return JsonResponse({
        "id": s.id,
        "title": s.title,
        "body": s.body,
        "author": s.author.get_full_name() or s.author.username,
        "created_at": s.created_at.isoformat(),
        "score": 0,
        "comment_count": 0,
    })


@csrf_exempt
def api_suggestion_vote(request, suggestion_id):
    """Vote on a suggestion. Requires authentication."""
    if not request.user.is_authenticated:
        return JsonResponse({"error": "Login required"}, status=401)
    if request.method != "POST":
        return JsonResponse({"error": "POST required"}, status=405)

    import json
    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({"error": "Invalid JSON"}, status=400)

    value = data.get("value", 0)
    if value not in (-1, 0, 1):
        return JsonResponse({"error": "Value must be -1, 0, or 1"}, status=400)

    try:
        suggestion = Suggestion.objects.get(id=suggestion_id)
    except Suggestion.DoesNotExist:
        return JsonResponse({"error": "Suggestion not found"}, status=404)

    if value == 0:
        SuggestionVote.objects.filter(user=request.user, suggestion=suggestion).delete()
    else:
        SuggestionVote.objects.update_or_create(
            user=request.user, suggestion=suggestion,
            defaults={"value": value}
        )

    return JsonResponse({"score": suggestion.vote_score(), "user_vote": value})


def api_suggestion_detail(request, suggestion_id):
    """Get a suggestion with all its comments."""
    try:
        s = Suggestion.objects.get(id=suggestion_id)
    except Suggestion.DoesNotExist:
        return JsonResponse({"error": "Suggestion not found"}, status=404)

    user_vote = 0
    if request.user.is_authenticated:
        vote = SuggestionVote.objects.filter(user=request.user, suggestion=s).first()
        if vote:
            user_vote = vote.value

    comments = []
    for c in s.comments.all():
        comments.append({
            "id": c.id,
            "body": c.body,
            "author": c.author.get_full_name() or c.author.username,
            "created_at": c.created_at.isoformat(),
        })

    return JsonResponse({
        "id": s.id,
        "title": s.title,
        "body": s.body,
        "author": s.author.get_full_name() or s.author.username,
        "created_at": s.created_at.isoformat(),
        "score": s.vote_score(),
        "user_vote": user_vote,
        "comments": comments,
    })


@csrf_exempt
def api_comment_create(request, suggestion_id):
    """Add a comment to a suggestion. Requires authentication."""
    if not request.user.is_authenticated:
        return JsonResponse({"error": "Login required"}, status=401)
    if request.method != "POST":
        return JsonResponse({"error": "POST required"}, status=405)

    try:
        suggestion = Suggestion.objects.get(id=suggestion_id)
    except Suggestion.DoesNotExist:
        return JsonResponse({"error": "Suggestion not found"}, status=404)

    import json
    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({"error": "Invalid JSON"}, status=400)

    body = data.get("body", "").strip()
    if not body or len(body) < 2:
        return JsonResponse({"error": "Comment must be at least 2 characters"}, status=400)

    # Profanity check
    if contains_profanity(body):
        return JsonResponse({"error": "Please keep it professional — no profanity allowed"}, status=400)

    c = Comment.objects.create(author=request.user, suggestion=suggestion, body=body)
    return JsonResponse({
        "id": c.id,
        "body": c.body,
        "author": c.author.get_full_name() or c.author.username,
        "created_at": c.created_at.isoformat(),
    })
