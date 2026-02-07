"""
Account views: settings page, profile updates, account deletion.
"""

from django.contrib import auth
from django.http import JsonResponse
from django.shortcuts import render, redirect
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from ..models import Suggestion, SuggestionVote, Comment
from .utils import (
    MAX_NAME_LENGTH, VALID_NAME_PATTERN,
    sanitize_text, validate_json_body, contains_profanity
)


def settings_page(request):
    """Render the settings page. Requires authentication."""
    if not request.user.is_authenticated:
        return redirect("/accounts/google/login/")
    return render(request, "dashboard/settings.html")


@csrf_exempt
@require_http_methods(["POST"])
def api_update_profile(request):
    """Update user's first and last name."""
    if not request.user.is_authenticated:
        return JsonResponse({"error": "Login required"}, status=401)

    data, error = validate_json_body(request)
    if error:
        return error

    first_name = sanitize_text(data.get("first_name", ""), MAX_NAME_LENGTH)
    last_name = sanitize_text(data.get("last_name", ""), MAX_NAME_LENGTH)

    if not first_name:
        return JsonResponse({"error": "First name is required"}, status=400)
    if len(first_name) > MAX_NAME_LENGTH:
        return JsonResponse({"error": f"First name must be at most {MAX_NAME_LENGTH} characters"}, status=400)
    if len(last_name) > MAX_NAME_LENGTH:
        return JsonResponse({"error": f"Last name must be at most {MAX_NAME_LENGTH} characters"}, status=400)

    if not VALID_NAME_PATTERN.match(first_name):
        return JsonResponse({"error": "First name contains invalid characters"}, status=400)
    if last_name and not VALID_NAME_PATTERN.match(last_name):
        return JsonResponse({"error": "Last name contains invalid characters"}, status=400)

    if contains_profanity(first_name) or contains_profanity(last_name):
        return JsonResponse({"error": "Please use appropriate names"}, status=400)

    request.user.first_name = first_name
    request.user.last_name = last_name
    request.user.save(update_fields=['first_name', 'last_name'])

    return JsonResponse({
        "ok": True,
        "first_name": request.user.first_name,
        "last_name": request.user.last_name,
        "full_name": request.user.get_full_name(),
    })


@csrf_exempt
@require_http_methods(["DELETE"])
def api_delete_account(request):
    """Delete user account and all associated data."""
    if not request.user.is_authenticated:
        return JsonResponse({"error": "Login required"}, status=401)

    user = request.user

    # Delete all user's content
    Suggestion.objects.filter(author=user).delete()
    Comment.objects.filter(author=user).delete()
    SuggestionVote.objects.filter(user=user).delete()

    # Log out and delete
    auth.logout(request)
    user.delete()

    return JsonResponse({"ok": True})
