"""
Google OAuth (server-side Authorization Code flow) for "Continue with Google".

Flow implemented here (matches routes/google_auth.py):
  1. Frontend navigates the browser to GET /api/auth/google/login.
  2. This backend redirects to Google's consent screen, with a signed
     `state` value (a short-lived JWT, reusing security.py's existing
     token machinery -- no new session storage needed).
  3. Google redirects back to GOOGLE_REDIRECT_URI
     (GET /api/auth/google/callback?code=...&state=...).
  4. This backend exchanges the code for an access token directly with
     Google's token endpoint (server-to-server, using GOOGLE_CLIENT_SECRET,
     which never touches the browser), then fetches the verified profile
     from Google's own userinfo endpoint using that access token.

Because the email/name always come from Google's server in step 4 (never
from anything the frontend sent us), this satisfies "don't trust user
information sent directly from the frontend" without needing a separate
ID-token-signature-verification library.
"""
from __future__ import annotations

import os
from datetime import timedelta
from typing import Optional

import httpx

from security import create_access_token, decode_access_token

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "").strip()
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "").strip()
GOOGLE_REDIRECT_URI = os.getenv("GOOGLE_REDIRECT_URI", "http://127.0.0.1:8000/api/auth/google/callback").strip()

GOOGLE_AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_ENDPOINT = "https://openidconnect.googleapis.com/v1/userinfo"

STATE_PURPOSE = "google_oauth_state"


class GoogleOAuthNotConfigured(Exception):
    pass


class GoogleOAuthError(Exception):
    pass


def is_configured() -> bool:
    return bool(GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET)


def build_authorize_url() -> str:
    if not is_configured():
        raise GoogleOAuthNotConfigured(
            "Google sign-in isn't configured on this server yet. Set GOOGLE_CLIENT_ID and "
            "GOOGLE_CLIENT_SECRET in backend/.env (see .env.example)."
        )
    # Reuse the existing JWT signer for a short-lived, tamper-proof state
    # token instead of standing up server-side session storage just for
    # this. verify_state() below checks it on the way back.
    state = create_access_token({"purpose": STATE_PURPOSE}, expires_delta=timedelta(minutes=10))
    params = {
        "client_id": GOOGLE_CLIENT_ID,
        "redirect_uri": GOOGLE_REDIRECT_URI,
        "response_type": "code",
        "scope": "openid email profile",
        "state": state,
        "access_type": "online",
        "prompt": "select_account",
    }
    return str(httpx.URL(GOOGLE_AUTH_ENDPOINT, params=params))


def verify_state(state: Optional[str]) -> bool:
    if not state:
        return False
    payload = decode_access_token(state)
    return bool(payload and payload.get("purpose") == STATE_PURPOSE)


def exchange_code_for_profile(code: str) -> dict:
    """Exchanges an authorization `code` for Google tokens, then fetches
    the verified profile from Google's own server. Returns
    {"email", "name", "google_id"}. Raises GoogleOAuthError on any
    failure (network, bad code, unverified email, etc.) -- callers should
    catch this and show/redirect with a friendly message rather than
    letting it propagate as a 500."""
    if not is_configured():
        raise GoogleOAuthNotConfigured("Google sign-in isn't configured on this server yet.")

    try:
        token_resp = httpx.post(
            GOOGLE_TOKEN_ENDPOINT,
            data={
                "code": code,
                "client_id": GOOGLE_CLIENT_ID,
                "client_secret": GOOGLE_CLIENT_SECRET,
                "redirect_uri": GOOGLE_REDIRECT_URI,
                "grant_type": "authorization_code",
            },
            timeout=15,
        )
        token_resp.raise_for_status()
        access_token = token_resp.json().get("access_token")
        if not access_token:
            raise GoogleOAuthError("Google did not return an access token for this sign-in attempt.")

        userinfo_resp = httpx.get(
            GOOGLE_USERINFO_ENDPOINT,
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=15,
        )
        userinfo_resp.raise_for_status()
        userinfo = userinfo_resp.json()
    except httpx.HTTPStatusError as e:
        raise GoogleOAuthError(
            f"Google rejected the sign-in request (HTTP {e.response.status_code}). "
            "The authorization code may have expired -- please try again."
        ) from e
    except httpx.RequestError as e:
        raise GoogleOAuthError(f"Could not reach Google's servers: {e}") from e

    email = userinfo.get("email")
    if not email or not userinfo.get("email_verified"):
        raise GoogleOAuthError("Google did not return a verified email address for this account.")

    return {
        "email": email.lower(),
        "name": userinfo.get("name") or email.split("@")[0],
        "google_id": userinfo.get("sub"),
    }
