from django.contrib import auth
from django.contrib.auth.models import User
from django.http import JsonResponse
from django.shortcuts import render, redirect
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST

from . import services


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
    results = services.evaluate(stations, readings)
    return JsonResponse({"results": results})


@csrf_exempt
def api_fetch(request, city=None):
    if not request.user.is_authenticated:
        return JsonResponse({"error": "Login required to fetch live data", "auth_required": True}, status=401)

    profile = request.user.profile
    if not profile.can_fetch():
        return JsonResponse({
            "error": f"Rate limited. Try again in {profile.minutes_until_fetch()} minutes.",
            "rate_limited": True,
            "seconds_remaining": profile.seconds_until_fetch(),
        }, status=429)

    config = services.load_config()
    api_key = config.get("api_key", "")

    if not api_key:
        return JsonResponse({"error": "No PurpleAir API key configured"}, status=400)

    if city:
        stations = services.load_stations(city)
    else:
        stations = services.load_all_stations()
    readings = services.fetch_latest_pm25(api_key, stations)
    results = services.evaluate(stations, readings)

    profile.last_fetch_time = timezone.now()
    profile.save(update_fields=["last_fetch_time"])

    return JsonResponse({"results": results})


def api_auth_status(request):
    if request.user.is_authenticated:
        profile = request.user.profile
        return JsonResponse({
            "authenticated": True,
            "username": request.user.username,
            "can_fetch": profile.can_fetch(),
            "seconds_remaining": profile.seconds_until_fetch(),
        })
    return JsonResponse({"authenticated": False})


def login_view(request):
    if request.user.is_authenticated:
        return redirect("/")
    error = ""
    if request.method == "POST":
        username = request.POST.get("username", "").strip()
        password = request.POST.get("password", "")
        user = auth.authenticate(request, username=username, password=password)
        if user is not None:
            auth.login(request, user)
            return redirect(request.GET.get("next", "/"))
        error = "Invalid username or password."
    return render(request, "dashboard/login.html", {"error": error})


def signup_view(request):
    if request.user.is_authenticated:
        return redirect("/")
    error = ""
    if request.method == "POST":
        username = request.POST.get("username", "").strip()
        email = request.POST.get("email", "").strip()
        password = request.POST.get("password", "")
        confirm = request.POST.get("confirm", "")
        if not username or not password:
            error = "Username and password are required."
        elif len(password) < 6:
            error = "Password must be at least 6 characters."
        elif password != confirm:
            error = "Passwords do not match."
        elif User.objects.filter(username=username).exists():
            error = "Username already taken."
        else:
            user = User.objects.create_user(username=username, email=email, password=password)
            auth.login(request, user)
            return redirect("/")
    return render(request, "dashboard/signup.html", {"error": error})


def logout_view(request):
    auth.logout(request)
    return redirect("/")
