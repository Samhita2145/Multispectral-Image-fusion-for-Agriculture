import os
import secrets
from typing import Optional
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, Query
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from database.database import get_db
from models.user import User
from security import create_access_token, hash_password
from services import google_oauth_service as goog

router = APIRouter(prefix="/api/auth/google", tags=["auth"])

# Where to send the browser back to after a Google sign-in attempt
# (success or failure). Must be the origin the static frontend is served
# from -- see README / .env.example.
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://127.0.0.1:5500").rstrip("/")


def _login_redirect_with_error(message: str) -> RedirectResponse:
    query = urlencode({"google_error": message})
    return RedirectResponse(url=f"{FRONTEND_URL}/login.html?{query}")


@router.get(
    "/login",
    summary="Start Google sign-in",
    description="Redirects the browser to Google's OAuth consent screen. Linked from the "
    "'Continue with Google' button on the login page.",
)
def google_login():
    try:
        url = goog.build_authorize_url()
    except goog.GoogleOAuthNotConfigured as e:
        return _login_redirect_with_error(str(e))
    return RedirectResponse(url=url)


@router.get(
    "/callback",
    summary="Google OAuth callback (Google redirects here)",
    description="Exchanges the authorization code for a verified Google profile, finds-or-creates the "
    "matching user, issues this app's normal JWT, and redirects to the frontend with it.",
)
def google_callback(
    code: Optional[str] = Query(None),
    state: Optional[str] = Query(None),
    error: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    if error:
        # e.g. the user clicked "Cancel" on Google's consent screen (error=access_denied)
        return _login_redirect_with_error("Google sign-in was cancelled.")

    if not code or not goog.verify_state(state):
        return _login_redirect_with_error("Your Google sign-in request expired or was invalid. Please try again.")

    try:
        profile = goog.exchange_code_for_profile(code)
    except (goog.GoogleOAuthNotConfigured, goog.GoogleOAuthError) as e:
        return _login_redirect_with_error(str(e))

    # Match an existing user by google_id first, then by email (so a user
    # who originally registered with email/password and later clicks
    # "Continue with Google" with the same address links to their existing
    # account instead of getting a duplicate one).
    user = db.query(User).filter(User.google_id == profile["google_id"]).first()
    if not user:
        user = db.query(User).filter(User.email == profile["email"]).first()

    if user:
        if not user.google_id:
            user.google_id = profile["google_id"]
            db.commit()
    else:
        user = User(
            name=profile["name"],
            email=profile["email"],
            # Google-authenticated accounts still need *some* password_hash
            # to satisfy the existing NOT NULL column -- this is a random,
            # unusable value; nobody can log in with it via
            # /api/auth/login, only via Google.
            password_hash=hash_password(secrets.token_hex(32)),
            auth_provider="google",
            google_id=profile["google_id"],
        )
        db.add(user)
        db.commit()
        db.refresh(user)

    token = create_access_token({"sub": str(user.id)})
    return RedirectResponse(url=f"{FRONTEND_URL}/google-callback.html#token={token}")
