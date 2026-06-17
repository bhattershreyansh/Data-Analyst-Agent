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


import bcrypt
from datetime import datetime, timedelta

def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        plain_bytes = plain_password.encode('utf-8')
        if len(plain_bytes) > 72:
            plain_bytes = plain_bytes[:72]
        hashed_bytes = hashed_password.encode('utf-8')
        return bcrypt.checkpw(plain_bytes, hashed_bytes)
    except Exception as e:
        logger.error(f"Password verification error: {e}")
        return False

def get_password_hash(password: str) -> str:
    plain_bytes = password.encode('utf-8')
    if len(plain_bytes) > 72:
        plain_bytes = plain_bytes[:72]
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(plain_bytes, salt).decode('utf-8')

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)
    return encoded_jwt

security = HTTPBearer(auto_error=False)

async def get_current_user(res: Optional[HTTPAuthorizationCredentials] = Depends(security)):
    """FastAPI dependency to get the current authenticated user from custom JWT"""
    demo_mode = os.environ.get("DEMO_MODE", "false").lower() == "true"
    if demo_mode and (not res or res.credentials in ("mock-token", "test-token", "demo-token")):
        # Local development / test fallback — only allowed when DEMO_MODE=true
        return {"user_id": "demo-user-id"}
        
    token = res.credentials
    try:
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="User ID not found in token")
        return {"user_id": user_id, "payload": payload}
    except JWTError as e:
        logger.error(f"JWT Verification failed: {e}")
        raise HTTPException(status_code=401, detail="Could not validate credentials")
    except Exception as e:
        logger.error(f"Authentication failed: {e}")
        raise HTTPException(status_code=401, detail="Authentication failed")
