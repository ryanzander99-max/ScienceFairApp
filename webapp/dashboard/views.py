import datetime
import os

from django.contrib import auth
from django.http import JsonResponse
from django.shortcuts import render, redirect
from django.utils import timezone

from . import services
from .models import ReadingSnapshot, CachedResult


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
