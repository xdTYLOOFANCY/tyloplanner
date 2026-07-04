# TyloPlanner Authentication Overhaul Handoff

This document summarizes the recent changes made to the `TyloPlanner` application to transition from environment-variable-based authentication to a dynamic, database-driven authentication system with OAuth support and a first-time setup wizard.

## 1. Key Architectural Changes
* **Source of Truth:** Authentication credentials (`admin_username`, `password_hash`) and status flags (`auth_setup_complete`) have been moved from `.env` to the SQLite `kv` table in `data/tyloplanner.db`.
* **Automatic Migration:** When the application starts, it checks for existing `.env` variables (`AUTH_USERNAME`, `AUTH_PASSWORD`). If found, it automatically migrates them into the database and marks the setup as complete, ensuring zero downtime for existing instances.
* **Global App Guard:** The `@guard()` decorator (and by extension the `before_request` handler) now strictly enforces that the application cannot be accessed until `auth_setup_complete` is true in the database. Unconfigured instances are forced to `/setup`.

## 2. New Features
* **First-Time Setup Wizard (`/setup`):** A modern, tabbed UI allowing new administrators to either set a traditional username/password or configure OAuth (GitHub/Google) to secure their instance.
* **OAuth Integration:** Full backend integration for GitHub and Google OAuth. The app exchanges authorization codes for access tokens and verifies the linked user IDs directly with the provider APIs. 
* **Dynamic Login Screen:** The login screen now asynchronously queries the backend to determine which OAuth providers are configured and dynamically renders the appropriate login buttons.
* **Settings Management:** The **Security** tab in Settings now includes an **OAuth Configuration** panel for linking and unlinking providers on the fly. It also intelligently adapts to allow users to set a traditional password if they initially chose only OAuth.

## 3. Files Modified & Created

### Backend Changes
* **[helpers.py](file:///Users/brambiemans/Documents/GitHub/tyloplanner/helpers.py)**
  * Added `is_auth_setup_complete()` to check the `kv_store`.
  * Added `get_oauth_providers()` to list configured integrations.
  * Updated `update_auth_enabled()` to factor in OAuth.
  * Added the automatic migration logic from `.env` to `kv_store`.
* **[blueprints/auth.py](file:///Users/brambiemans/Documents/GitHub/tyloplanner/blueprints/auth.py)**
  * Updated the `guard()` decorator to enforce setup completion.
  * Implemented `/setup` (GET) and `/api/setup` (POST) routes.
  * Implemented all `/api/oauth/*` endpoints (init, callback, status, unlink).
  * Updated `/api/settings/password` to allow setting a password if none exists.
* **[blueprints/api.py](file:///Users/brambiemans/Documents/GitHub/tyloplanner/blueprints/api.py)**
  * Updated the `/api/init` and `/api/settings` responses to include a `has_password` boolean to drive the Settings UI logic.

### Frontend Changes
* **[static/setup.html](file:///Users/brambiemans/Documents/GitHub/tyloplanner/static/setup.html)** & **[static/js/setup.js](file:///Users/brambiemans/Documents/GitHub/tyloplanner/static/js/setup.js)** `[NEW]`
  * Created the multi-tab onboarding wizard UI and API consumption logic.
* **[static/login.html](file:///Users/brambiemans/Documents/GitHub/tyloplanner/static/login.html)** & **[static/js/login.js](file:///Users/brambiemans/Documents/GitHub/tyloplanner/static/js/login.js)**
  * Injected an `#oauthContainer` div.
  * Added logic to fetch `/api/auth/providers` and render "Sign in with GitHub/Google" buttons if configured.
* **[static/js/settings.js](file:///Users/brambiemans/Documents/GitHub/tyloplanner/static/js/settings.js)**
  * Added the OAuth configuration UI and management functions (`loadOauthConfig`, `linkOauthSetup`, `unlinkOauth`).
  * Updated `renderSecurity()` to hide 2FA and show a simplified "Set Password" form if the user doesn't currently have a password.

## 4. Next Steps & Maintenance
* **OAuth Apps:** To use OAuth, you will need to create OAuth applications on GitHub and/or Google, pointing the redirect URIs to `http(s)://<your-domain>/api/oauth/<provider>/callback`.
* **Failsafe:** The `unlink` logic specifically prevents users from unlinking their last authentication method to ensure they don't lock themselves out of the application. 
