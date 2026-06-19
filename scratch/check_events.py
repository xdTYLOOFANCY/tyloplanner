import sys
sys.path.append('.')
from helpers import db
with db() as con:
    rows = con.execute("SELECT * FROM events").fetchall()
    print(f"Total events: {len(rows)}")
    for r in rows:
        print(dict(r))
