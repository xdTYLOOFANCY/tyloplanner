import sys
sys.path.append('.')
from scheduler import send_agenda
from datetime import datetime

today = datetime.now().strftime("%Y-%m-%d")
print(f"Running send_agenda for {today}...")
try:
    send_agenda(today)
    print("send_agenda executed successfully.")
except Exception as e:
    import traceback
    traceback.print_exc()
