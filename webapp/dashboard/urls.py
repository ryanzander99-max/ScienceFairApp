from django.urls import path
from . import views

urlpatterns = [
    path("", views.index, name="index"),
    path("api/stations/", views.api_stations),
    path("api/demo/", views.api_demo),
    path("api/fetch/", views.api_fetch),
    path("api/auth-status/", views.api_auth_status),
    path("accounts/login/", views.login_view, name="login"),
    path("accounts/signup/", views.signup_view, name="signup"),
    path("accounts/logout/", views.logout_view, name="logout"),
]
