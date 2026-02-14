
from agent.security import security_manager
import logging

# Configure dummy logging
logging.basicConfig(level=logging.INFO)

def test_encryption():
    print("🔒 Testing Security Manager...")
    
    original_password = "SuperSecretPassword123!"
    print(f"Original: {original_password}")
    
    # Encrypt
    encrypted = security_manager.encrypt(original_password)
    print(f"Encrypted: {encrypted}")
    
    if original_password == encrypted:
        print("❌ Error: Encryption failed (Plain text matched)")
        return
        
    if "SuperSecret" in encrypted:
        print("❌ Error: Encryption weak (Partial match)")
        return

    # Decrypt
    decrypted = security_manager.decrypt(encrypted)
    print(f"Decrypted: {decrypted}")
    
    if original_password == decrypted:
        print("✅ SUCCESS: Password encrypted and decrypted correctly!")
    else:
        print("❌ FAILURE: Decrypted password does not match original")

if __name__ == "__main__":
    test_encryption()
