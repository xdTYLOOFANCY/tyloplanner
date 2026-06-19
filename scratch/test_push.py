import sys
sys.path.append('.')
from helpers import vapid_keys
from pywebpush import webpush
from py_vapid import Vapid

try:
    priv_key_pem, pub_key_b64 = vapid_keys()
    print("VAPID private key length:", len(priv_key_pem))
    print("VAPID public key:", pub_key_b64)
    vapid_key = Vapid.from_pem(priv_key_pem.encode('utf-8'))
    print("Vapid.from_pem succeeded.")
    
    # Let's try calling webpush with the Vapid object to see if it causes an error
    # We will use dummy subscription
    sub_info = {
        "endpoint": "https://fcm.googleapis.com/fcm/send/abc",
        "keys": {
            "p256dh": "BLcDw5WYc_16c5Q...",
            "auth": "1234567890"
        }
    }
    
    print("Trying with Vapid object:")
    try:
        webpush(
            subscription_info=sub_info,
            data="{}",
            vapid_private_key=vapid_key,
            vapid_claims={"sub": "mailto:admin@tyloplanner.local"}
        )
    except Exception as e:
        print("Vapid object failed with:", type(e), e)
        
    print("Trying with PEM string:")
    try:
        webpush(
            subscription_info=sub_info,
            data="{}",
            vapid_private_key=priv_key_pem,
            vapid_claims={"sub": "mailto:admin@tyloplanner.local"}
        )
    except Exception as e:
        print("PEM string failed with:", type(e), e)

except Exception as e:
    print("Outer error:", e)
