"""
Security and rate limiting middleware for the PM2.5 EWS application.
"""

import time
import hashlib
from collections import defaultdict
from threading import Lock
from functools import wraps

from django.http import JsonResponse
from django.core.cache import cache
from django.conf import settings


class RateLimitMiddleware:
    """
    Rate limiting middleware using a sliding window algorithm.

    Limits requests per IP address to prevent abuse and DDoS attacks.
    Uses Django's cache backend for distributed rate limiting.
    """

    # Default rate limits (requests per window)
    DEFAULT_LIMITS = {
        'default': (100, 60),      # 100 requests per 60 seconds
        'api': (60, 60),           # 60 API requests per minute
        'auth': (10, 60),          # 10 auth attempts per minute
        'write': (20, 60),         # 20 write operations per minute
    }

    # Path patterns for different limit categories
    PATH_CATEGORIES = {
        'auth': ['/accounts/', '/api/settings/'],
        'write': ['/api/suggestion/create', '/api/comment/', '/api/settings/'],
        'api': ['/api/'],
    }

    def __init__(self, get_response):
        self.get_response = get_response
        # Fallback in-memory store if cache is unavailable
        self._local_store = defaultdict(list)
        self._lock = Lock()

    def __call__(self, request):
        # Skip rate limiting for static files and health checks
        path = request.path
        if path.startswith('/static/') or path == '/health/':
            return self.get_response(request)

        # Get client identifier (IP + User-Agent hash for better fingerprinting)
        client_id = self._get_client_id(request)
        category = self._get_category(path)

        # Check rate limit
        is_allowed, retry_after = self._check_rate_limit(client_id, category)

        if not is_allowed:
            return JsonResponse({
                'error': 'Rate limit exceeded. Please slow down.',
                'retry_after': retry_after,
            }, status=429, headers={'Retry-After': str(retry_after)})

        response = self.get_response(request)

        # Add rate limit headers to response
        remaining, limit = self._get_remaining(client_id, category)
        response['X-RateLimit-Limit'] = str(limit)
        response['X-RateLimit-Remaining'] = str(max(0, remaining))

        return response

    def _get_client_id(self, request):
        """Generate a unique client identifier from IP and User-Agent."""
        # Get real IP behind proxies
        x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
        if x_forwarded_for:
            ip = x_forwarded_for.split(',')[0].strip()
        else:
            ip = request.META.get('REMOTE_ADDR', 'unknown')

        # Add user agent for fingerprinting
        user_agent = request.META.get('HTTP_USER_AGENT', '')[:100]

        # Hash for privacy and consistent length
        raw = f"{ip}:{user_agent}"
        return hashlib.sha256(raw.encode()).hexdigest()[:32]

    def _get_category(self, path):
        """Determine the rate limit category for a path."""
        for category, patterns in self.PATH_CATEGORIES.items():
            for pattern in patterns:
                if path.startswith(pattern):
                    return category
        return 'default'

    def _check_rate_limit(self, client_id, category):
        """Check if request is within rate limits using sliding window."""
        limit, window = self.DEFAULT_LIMITS.get(category, self.DEFAULT_LIMITS['default'])
        cache_key = f"ratelimit:{category}:{client_id}"
        now = time.time()

        try:
            # Try to use cache backend
            timestamps = cache.get(cache_key, [])

            # Remove expired timestamps (sliding window)
            cutoff = now - window
            timestamps = [ts for ts in timestamps if ts > cutoff]

            if len(timestamps) >= limit:
                # Calculate retry-after
                oldest = min(timestamps) if timestamps else now
                retry_after = int(oldest + window - now) + 1
                return False, retry_after

            # Add current timestamp
            timestamps.append(now)
            cache.set(cache_key, timestamps, timeout=window + 10)

            return True, 0

        except Exception:
            # Fallback to local memory (less accurate but functional)
            return self._check_local_rate_limit(client_id, category, limit, window, now)

    def _check_local_rate_limit(self, client_id, category, limit, window, now):
        """Fallback local rate limiting when cache is unavailable."""
        key = f"{category}:{client_id}"

        with self._lock:
            cutoff = now - window
            self._local_store[key] = [ts for ts in self._local_store[key] if ts > cutoff]

            if len(self._local_store[key]) >= limit:
                oldest = min(self._local_store[key])
                retry_after = int(oldest + window - now) + 1
                return False, retry_after

            self._local_store[key].append(now)
            return True, 0

    def _get_remaining(self, client_id, category):
        """Get remaining requests for rate limit headers."""
        limit, window = self.DEFAULT_LIMITS.get(category, self.DEFAULT_LIMITS['default'])
        cache_key = f"ratelimit:{category}:{client_id}"

        try:
            timestamps = cache.get(cache_key, [])
            cutoff = time.time() - window
            current_count = len([ts for ts in timestamps if ts > cutoff])
            return limit - current_count, limit
        except Exception:
            return limit, limit


class SecurityHeadersMiddleware:
    """
    Add security headers to all responses.

    Implements OWASP recommended security headers.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)

        # Prevent clickjacking
        response['X-Frame-Options'] = 'DENY'

        # Prevent MIME type sniffing
        response['X-Content-Type-Options'] = 'nosniff'

        # Enable XSS filter (legacy browsers)
        response['X-XSS-Protection'] = '1; mode=block'

        # Referrer policy for privacy
        response['Referrer-Policy'] = 'strict-origin-when-cross-origin'

        # Permissions policy (disable unnecessary features)
        response['Permissions-Policy'] = 'geolocation=(), microphone=(), camera=()'

        # Content Security Policy (adjust as needed for your CDNs)
        if not settings.DEBUG:
            csp = "; ".join([
                "default-src 'self'",
                "script-src 'self' 'unsafe-inline' https://unpkg.com",
                "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
                "font-src 'self' https://fonts.gstatic.com",
                "img-src 'self' data: https: blob:",
                "connect-src 'self' https://api.waqi.info https://ui-avatars.com",
                "frame-ancestors 'none'",
                "base-uri 'self'",
                "form-action 'self'",
            ])
            response['Content-Security-Policy'] = csp

        # HSTS (only in production with HTTPS)
        if not settings.DEBUG and request.is_secure():
            response['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains'

        return response


class RequestSizeLimitMiddleware:
    """
    Limit request body size to prevent large payload attacks.
    """

    # 1MB default limit, 100KB for API endpoints
    DEFAULT_MAX_SIZE = 1 * 1024 * 1024  # 1MB
    API_MAX_SIZE = 100 * 1024  # 100KB

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        content_length = request.META.get('CONTENT_LENGTH')

        if content_length:
            try:
                size = int(content_length)
                max_size = self.API_MAX_SIZE if request.path.startswith('/api/') else self.DEFAULT_MAX_SIZE

                if size > max_size:
                    return JsonResponse({
                        'error': 'Request body too large',
                        'max_size': max_size,
                    }, status=413)
            except (ValueError, TypeError):
                pass

        return self.get_response(request)
