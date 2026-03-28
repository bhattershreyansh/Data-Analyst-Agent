import os
import httpx
import logging
from jose import jwt, JWTError
from fastapi import Request, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from typing import Optional
from dotenv import load_dotenv

# Load environment variables (look in current and parent directory)
load_dotenv()
if not os.getenv("CLERK_JWKS_URL"):
    load_dotenv("../.env")

logger = logging.getLogger(__name__)

# Clerk configuration
CLERK_JWKS_URL = os.getenv("CLERK_JWKS_URL")
# If not provided, we can infer it if we had the instance id, but let's assume the user provides it or we'll need it.
# Usually CLERK_JWKS_URL is https://<YOUR_CLERK_FRONTEND_API>/.well-known/jwks.json

security = HTTPBearer()

class ClerkAuth:
    def __init__(self):
        self.jwks = None

    async def get_jwks(self):
        if self.jwks:
            return self.jwks
        
        if not CLERK_JWKS_URL:
            logger.error("CLERK_JWKS_URL not set in environment")
            raise HTTPException(status_code=500, detail="Auth configuration error")
            
        async with httpx.AsyncClient() as client:
            response = await client.get(CLERK_JWKS_URL)
            if response.status_code != 200:
                logger.error(f"Failed to fetch JWKS from Clerk: {response.text}")
                raise HTTPException(status_code=500, detail="Failed to fetch auth keys")
            self.jwks = response.json()
            return self.jwks

    async def verify_token(self, token: str):
        try:
            jwks = await self.get_jwks()
            
            # Unverified header to find the key id (kid)
            unverified_header = jwt.get_unverified_header(token)
            kid = unverified_header.get("kid")
            
            if not kid:
                raise HTTPException(status_code=401, detail="Invalid token header")
                
            # Find the correct key in JWKS
            rsa_key = {}
            for key in jwks.get("keys", []):
                if key.get("kid") == kid:
                    rsa_key = {
                        "kty": key.get("kty"),
                        "kid": key.get("kid"),
                        "use": key.get("use"),
                        "n": key.get("n"),
                        "e": key.get("e")
                    }
                    break
            
            if not rsa_key:
                raise HTTPException(status_code=401, detail="Invalid auth key")
                
            # Verify and decode
            payload = jwt.decode(
                token,
                rsa_key,
                algorithms=["RS256"],
                # audiences usually includes the frontend origin or a specific audience if set in Clerk
            )
            
            return payload
            
        except JWTError as e:
            logger.error(f"JWT Verification failed: {e}")
            raise HTTPException(status_code=401, detail=f"Invalid token: {str(e)}")
        except Exception as e:
            logger.error(f"Auth error: {e}")
            raise HTTPException(status_code=401, detail="Authentication failed")

clerk_auth = ClerkAuth()

async def get_current_user(res: HTTPAuthorizationCredentials = Depends(security)):
    """
    FastAPI dependency to get the current authenticated user from Clerk JWT
    """
    token = res.credentials
    payload = await clerk_auth.verify_token(token)
    
    # Extract user_id (usually 'sub' claim in JWT)
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="User ID not found in token")
        
    return {"user_id": user_id, "payload": payload}
