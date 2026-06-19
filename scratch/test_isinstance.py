import sys
sys.path.append('.')
from helpers import vapid_keys
from pywebpush import webpush
from py_vapid import Vapid
import os

priv_key_pem, _ = vapid_keys()
vapid_key = Vapid.from_pem(priv_key_pem.encode('utf-8'))

print("isinstance(vapid_key, Vapid):", isinstance(vapid_key, Vapid))
# Let's check pywebpush's internal Vapid01
import pywebpush
from py_vapid import Vapid01
print("isinstance(vapid_key, Vapid01):", isinstance(vapid_key, Vapid01))

# Let's see what happens if we pass vapid_key to webpush with verbose=True
import logging
logging.basicConfig(level=logging.DEBUG)

sub_info = {
    "endpoint": "https://fcm.googleapis.com/fcm/send/abc",
    "keys": {
        "p256dh": "BLcDw5WYc_16c5Q...",
        "auth": "1234567890"
    }
}

try:
    webpush(
        subscription_info=sub_info,
        data="{}",
        vapid_private_key=vapid_key,
        vapid_claims={"sub": "mailto:admin@tyloplanner.local"},
        verbose=True
    )
except Exception as e:
    print("Error during webpush call:", type(e), e)
