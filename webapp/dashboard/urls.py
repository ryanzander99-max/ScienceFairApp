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
    # Feedback board
    path("api/suggestions/", views.api_suggestions),
    path("api/suggestions/create/", views.api_suggestion_create),
    path("api/suggestions/<int:suggestion_id>/", views.api_suggestion_detail),
    path("api/suggestions/<int:suggestion_id>/vote/", views.api_suggestion_vote),
    path("api/suggestions/<int:suggestion_id>/comments/", views.api_comment_create),
    path("api/suggestions/<int:suggestion_id>/delete/", views.api_suggestion_delete),
]
