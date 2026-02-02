import json

from django.http import JsonResponse
from django.shortcuts import render
from django.views.decorators.csrf import csrf_exempt

from . import services


def index(request):
    cities = list(services.CITIES.keys())
    return render(request, "dashboard/index.html", {"cities": cities})


def api_stations(request, city):
    stations = services.load_stations(city)
    city_info = services.CITIES.get(city, {})
    return JsonResponse({
        "stations": stations,
        "city_lat": city_info.get("lat"),
        "city_lon": city_info.get("lon"),
        "city_label": city_info.get("label", city),
    })


def api_demo(request, city):
    stations = services.load_stations(city)
    readings = services.DEMO_DATA.get(city, {})
    results = services.evaluate(stations, readings)
    return JsonResponse({"results": results})


@csrf_exempt
def api_fetch(request, city):
    config = services.load_config()
    api_key = config.get("api_key", "")
    location_mapping = config.get("location_mapping", {})

    if not api_key:
        return JsonResponse({"error": "No API key in config.json"}, status=400)
    if not location_mapping:
        return JsonResponse({"error": "No location_mapping in config.json"}, status=400)

    stations = services.load_stations(city)
    city_ids = {st["id"] for st in stations}
    relevant = {k: v for k, v in location_mapping.items() if k in city_ids}

    readings = services.fetch_latest_pm25(api_key, relevant)
    results = services.evaluate(stations, readings)
    return JsonResponse({"results": results})
