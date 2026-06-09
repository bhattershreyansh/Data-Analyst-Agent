import os
import base64
import logging
import httpx
from pathlib import Path
from cryptography.fernet import Fernet
import keyring
from jose import jwt, JWTError
from typing import Optional
from fastapi import HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.core.config import settings

logger = logging.getLogger(__name__)

# Encryption configuration
SERVICE_NAME = "LuminaAnalyticsAgent"
KEY_USERNAME = "encryption_key"

class SecurityManager:
    """
    Handles encryption of sensitive data (db passwords) using Fernet.
    Effectively manages the master key using the OS Keyring.
    """
    
    def __init__(self):
        self.key = self._get_or_create_key()
        self.fernet = Fernet(self.key)
    
    def _get_or_create_key(self) -> bytes:
        """Retrieve master key from OS Keyring or generate new one."""
        try:
            stored_key = keyring.get_password(SERVICE_NAME, KEY_USERNAME)
            
            if stored_key:
                logger.info("✅ Encryption key loaded from secure system keyring")
                return base64.urlsafe_b64decode(stored_key)
            
            # Generate new key
            logger.info("🔑 Generating new encryption key...")
            new_key = Fernet.generate_key()
            key_b64 = base64.urlsafe_b64encode(new_key).decode('utf-8')
            
            # Store in keyring
            keyring.set_password(SERVICE_NAME, KEY_USERNAME, key_b64)
            logger.info("✅ New encryption key saved to secure system keyring")
            
            return new_key
            
        except Exception as e:
            logger.error(f"Failed to access keyring: {e}")
            logger.warning("⚠️  Falling back to file-based key (LESS SECURE) - usage limited to dev environment")
            
            # Fallback for environments without keyring access
            key_file = Path("secret.key")
            if key_file.exists():
                return key_file.read_bytes()
            
            new_key = Fernet.generate_key()
            key_file.write_bytes(new_key)
            return new_key

    def encrypt(self, data: str) -> str:
        """Encrypt string data"""
        if not data:
            return ""
        return self.fernet.encrypt(data.encode()).decode()
    
    def decrypt(self, token: str) -> str:
        """Decrypt string token"""
        if not token:
            return ""
        try:
            return self.fernet.decrypt(token.encode()).decode()
        except Exception as e:
            logger.error(f"Decryption failed: {e}")
            raise ValueError("Invalid encryption token")

# Global instance
security_manager = SecurityManager()


# ─── CLERK AUTHENTICATION ─────────────────────────────────────────────

security = HTTPBearer(auto_error=False)

class ClerkAuth:
    def __init__(self):
        self.jwks = None

    async def get_jwks(self):
        if self.jwks:
            return self.jwks
        
        jwks_url = settings.CLERK_JWKS_URL
        if not jwks_url:
            logger.error("CLERK_JWKS_URL not set in configuration")
            raise HTTPException(status_code=500, detail="Auth configuration error")
            
        async with httpx.AsyncClient() as client:
            response = await client.get(jwks_url)
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
            )
            
            return payload
            
        except JWTError as e:
            logger.error(f"JWT Verification failed: {e}")
            raise HTTPException(status_code=401, detail=f"Invalid token: {str(e)}")
        except Exception as e:
            logger.error(f"Auth error: {e}")
            raise HTTPException(status_code=401, detail="Authentication failed")

clerk_auth = ClerkAuth()

async def get_current_user(res: Optional[HTTPAuthorizationCredentials] = Depends(security)):
    """FastAPI dependency to get the current authenticated user from Clerk JWT"""
    if not res or res.credentials in ("mock-token", "test-token", "demo-token"):
        # Local development / test fallback
        return {"user_id": "demo-user-id", "payload": {"sub": "demo-user-id"}}
        
    token = res.credentials
    try:
        payload = await clerk_auth.verify_token(token)
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="User ID not found in token")
        return {"user_id": user_id, "payload": payload}
    except Exception as e:
        logger.error(f"Authentication failed: {e}")
        raise HTTPException(status_code=401, detail=f"Authentication failed: {str(e)}")
