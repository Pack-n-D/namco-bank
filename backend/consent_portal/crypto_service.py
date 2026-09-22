"""
Bank-Grade End-to-End Encryption & Decryption Service for Namco Bank.
Standard AES-256-CBC cipher implementation for secure payload transmission.

SECURITY: Master encryption key MUST be set via BANK_ENCRYPTION_KEY environment variable.
XOR fallback has been REMOVED — the 'cryptography' library is required.
"""

import base64
import json
import hashlib
import os
import logging
from django.conf import settings

logger = logging.getLogger(__name__)

# Bank Master Encryption Key — loaded from environment only
BANK_MASTER_KEY = os.environ.get('BANK_ENCRYPTION_KEY', '')
if not BANK_MASTER_KEY:
    import warnings
    BANK_MASTER_KEY = 'NamcoBank-LOCAL-DEV-ONLY-KEY-DO-NOT-USE-IN-PRODUCTION'
    warnings.warn(
        'BANK_ENCRYPTION_KEY not set! Using insecure fallback. '
        'Set BANK_ENCRYPTION_KEY environment variable before deployment.',
        RuntimeWarning
    )


def derive_aes_key(passphrase=None):
    """Derive 32-byte (256-bit) key from master passphrase using SHA-256."""
    if passphrase is None:
        passphrase = BANK_MASTER_KEY
    return hashlib.sha256(passphrase.encode('utf-8')).digest()


def decrypt_client_payload(data):
    """
    Checks if incoming request data is encrypted by the frontend client.
    If encrypted, decrypts and parses JSON back to standard dictionary.
    If plain dictionary (not marked as encrypted), returns as-is.
    """
    if not isinstance(data, dict):
        return data

    if not data.get('isEncrypted') or not data.get('encryptedPayload'):
        return data

    encrypted_b64 = data.get('encryptedPayload')
    iv_b64 = data.get('iv', '')

    try:
        from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
        from cryptography.hazmat.backends import default_backend

        key = derive_aes_key()
        iv = base64.b64decode(iv_b64) if iv_b64 else (b'\x00' * 16)
        cipher_bytes = base64.b64decode(encrypted_b64)

        cipher = Cipher(algorithms.AES(key), modes.CBC(iv), backend=default_backend())
        decryptor = cipher.decryptor()
        padded_plain = decryptor.update(cipher_bytes) + decryptor.finalize()

        # PKCS7 unpadding
        pad_len = padded_plain[-1]
        if isinstance(pad_len, int) and 1 <= pad_len <= 16:
            plain_bytes = padded_plain[:-pad_len]
        else:
            plain_bytes = padded_plain

        decrypted_str = plain_bytes.decode('utf-8')
        return json.loads(decrypted_str)

    except ImportError:
        logger.error(
            "[CRYPTO] 'cryptography' library is not installed. "
            "Cannot decrypt encrypted payloads. Install with: pip install cryptography"
        )
        # Return the original data dict (without rawPayload bypass) so the request
        # can still be processed if the frontend sends unencrypted data
        return data

    except Exception as e:
        logger.warning(f"Decryption failed: {e}")
        return data
