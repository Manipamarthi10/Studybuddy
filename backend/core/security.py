"""
JWT authentication helpers.
Supabase handles user signup/login — we just validate the JWT they send.
"""

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError
from core.config import settings
import logging

logger = logging.getLogger(__name__)
bearer = HTTPBearer()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer),
) -> dict:
    """
    Validate Supabase JWT and return user payload.
    The token is issued by Supabase after login — just pass it in Authorization header.
    """
    token = credentials.credentials
    try:
        # Supabase uses HS256 with your project JWT secret
        payload = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=["HS256"],
            options={"verify_aud": False},
        )
        user_id: str = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token")
        return {"user_id": user_id, "email": payload.get("email", "")}
    except JWTError as e:
        logger.warning(f"JWT validation failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
        )


def sanitize_prompt(text: str) -> str:
    """
    Basic prompt injection protection.
    Strip common injection patterns before sending to LLM.
    """
    injection_patterns = [
        "ignore previous instructions",
        "ignore all instructions",
        "you are now",
        "disregard your",
        "forget your instructions",
        "act as",
        "jailbreak",
        "system prompt",
    ]
    lowered = text.lower()
    for pattern in injection_patterns:
        if pattern in lowered:
            raise HTTPException(
                status_code=400,
                detail="Query contains disallowed content.",
            )
    return text.strip()
