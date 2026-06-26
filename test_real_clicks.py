import subprocess
import time
import sqlite3
from playwright.sync_api import sync_playwright
import os

proc = subprocess.Popen(["python3", "app.py"])
time.sleep(3)

try:
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.on("console", lambda msg: print(f"CONSOLE: {msg.type}: {msg.text}"))
        page.on("pageerror", lambda exc: print(f"PAGEERROR: {exc}"))
        
        print("Navigating to app...")
        page.goto("http://localhost:5000", wait_until="networkidle")
        
        html = page.content()
        if "id=\"loginForm\"" in html:
            print("Logging in...")
            # Toggle to register
            page.evaluate("showRegister()")
            page.fill("#username", "testuser2")
            page.fill("#password", "testpass")
            page.click("button[onclick='submitAuth()']")
            page.wait_for_timeout(1000)
            
            # Switch back to login if it didn't auto login
            if "id=\"loginForm\"" in page.content():
                page.evaluate("showLogin()")
                page.fill("#username", "testuser2")
                page.fill("#password", "testpass")
                page.click("button[onclick='submitAuth()']")
                page.wait_for_timeout(2000)
            
        print("Checking if buttons work...")
        
        # Take a snapshot of the center element
        top_el = page.evaluate("""() => {
            let el = document.elementFromPoint(window.innerWidth/2, window.innerHeight/2);
            return el ? el.tagName + '#' + el.id + '.' + el.className : null;
        }""")
        print("Top element at center:", top_el)
        
        # Look for the customize button
        try:
            page.click("#customizeBtn", timeout=2000)
            print("Customize button clicked successfully!")
        except Exception as e:
            print("Failed to click Customize button:", e)

        browser.close()
finally:
    proc.terminate()
