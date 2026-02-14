
from cryptography.fernet import Fernet
import keyring
import base64
import os
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

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
        """
        Retrieve master key from OS Keyring or generate new one.
        """
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
            
            # Fallback for environments without keyring access (e.g. some containers)
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
