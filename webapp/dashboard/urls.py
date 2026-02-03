from django.urls import path
from . import views

urlpatterns = [
    path("", views.index, name="index"),
    path("api/stations/", views.api_stations),
    path("api/demo/", views.api_demo),
    path("api/live/", views.api_live),
    path("api/refresh/", views.api_refresh),
    path("api/auth-status/", views.api_auth_status),
    path("accounts/logout/", views.logout_view, name="logout"),
]
