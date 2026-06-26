import subprocess
import time
import sqlite3
from playwright.sync_api import sync_playwright
import os

# Create DB and user
if not os.path.exists("instance"):
    os.makedirs("instance")
conn = sqlite3.connect("instance/tylo.db")
# Just to be safe, maybe app.py auto-migrates.

proc = subprocess.Popen(["python3", "app.py"], env=dict(os.environ, FLASK_APP="app.py", FLASK_ENV="development"))
time.sleep(3)

try:
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.on("console", lambda msg: print(f"CONSOLE: {msg.text}"))
        
        print("Navigating to app...")
        page.goto("http://localhost:5000", wait_until="networkidle")
        
        html = page.content()
        if "id=\"loginForm\"" in html:
            print("Logging in...")
            # create user in db manually if needed, or register
            page.fill("#username", "testuser")
            page.fill("#password", "testpass")
            page.click("text=Register")
            page.wait_for_timeout(1000)
            page.fill("#username", "testuser")
            page.fill("#password", "testpass")
            page.click("button[onclick='submitAuth()']")
            page.wait_for_timeout(2000)
            
        print("Checking if buttons work...")
        
        # Click customize button
        try:
            page.click("#customizeBtn", timeout=2000)
            print("Customize button clicked successfully!")
        except Exception as e:
            print("Failed to click Customize button:", e)

        # Check top element at center
        top_el = page.evaluate("""() => {
            let el = document.elementFromPoint(window.innerWidth/2, window.innerHeight/2);
            return el ? el.outerHTML : null;
        }""")
        print("Top element at center:", top_el[:200] if top_el else None)

        browser.close()
finally:
    proc.terminate()
