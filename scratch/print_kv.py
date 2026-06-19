import sys
sys.path.append('.')
from helpers import db
with db() as con:
    rows = con.execute("SELECT * FROM kv").fetchall()
    for r in rows:
        print(f"{r['key']}: {r['value']}")
