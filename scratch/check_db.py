import sys
sys.path.append('.')
from helpers import db
with db() as con:
    subs = [dict(r) for r in con.execute("SELECT * FROM push_subscriptions")]
    print(f"Total subscriptions: {len(subs)}")
    for s in subs:
        print(s)
