from django.urls import path
from . import views

urlpatterns = [
    path("", views.index, name="index"),
    path("api/stations/<str:city>/", views.api_stations),
    path("api/demo/<str:city>/", views.api_demo),
    path("api/fetch/<str:city>/", views.api_fetch),
]
