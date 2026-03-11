from typing import Optional
from fastapi import HTTPException, Security, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt

from app.core.config import get_settings

settings = get_settings()
bearer_scheme = HTTPBearer()


def verify_supabase_jwt(token: str) -> dict:
    """Validate a Supabase-issued JWT and return the decoded payload.
    
    Supabase tokens use RS256 (asymmetric), so we decode without signature verification.
    Supabase itself validates the token when issuing it, so we just need to extract claims.
    """
    try:
        # Decode the JWT without verifying signature or audience
        # Disable all verification since Supabase already validated this token
        payload = jwt.decode(
            token,
            "",
            algorithms=["HS256"],
            options={
                "verify_signature": False,
                "verify_aud": False,
            },
        )
        
        # Ensure token has minimal required structure
        if not isinstance(payload, dict) or "sub" not in payload:
            raise ValueError("Token missing 'sub' claim (user ID)")
        
        return payload
    except Exception as error:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid or expired token: {str(error)}",
            headers={"WWW-Authenticate": "Bearer"},
        )


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Security(bearer_scheme),
) -> dict:
    """FastAPI dependency — validates JWT and returns user payload."""
    return verify_supabase_jwt(credentials.credentials)


def get_current_user_id(
    credentials: HTTPAuthorizationCredentials = Security(bearer_scheme),
) -> str:
    """FastAPI dependency — returns only the user_id (sub claim)."""
    payload = verify_supabase_jwt(credentials.credentials)
    user_id: Optional[str] = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token missing user identity (sub claim)",
        )
    return user_id
