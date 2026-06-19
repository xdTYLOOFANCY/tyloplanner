import sys
sys.path.append('.')
from helpers import webpush_send
import logging

logging.basicConfig(level=logging.DEBUG)

print("Attempting to send webpush...")
ok = webpush_send("TyloPlanner Test", "Hello world from python script!")
print("Result of webpush_send:", ok)
