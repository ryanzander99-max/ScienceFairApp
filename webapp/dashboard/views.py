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

    if not api_key:
        return JsonResponse({"error": "No PurpleAir API key configured"}, status=400)

    stations = services.load_stations(city)
    readings = services.fetch_latest_pm25(api_key, stations)
    results = services.evaluate(stations, readings)
    return JsonResponse({"results": results})
