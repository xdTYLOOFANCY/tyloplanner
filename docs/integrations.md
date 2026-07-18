# Integrations

## Calendar

Everything below lives in one place: the **⚙️ Calendars** popup in the Planner
header (which also holds the per-calendar show/hide toggles and colors). The
application time zone stays in **Settings → Time zone**.

### Export — subscribe from your calendar app

Your planner events and exams are published as an iCal feed. Copy the secret
feed URL from **⚙️ Calendars → Export & subscribe**, then:

- All timed events are automatically converted to UTC and exported with the `Z` suffix, ensuring consistent timezone rendering across all devices. All-day events remain date-only.
- Event metadata including `LOCATION`, `DESCRIPTION`, and recurrence rules (`RRULE` with `UNTIL` limits) are fully exported using standard ICS attributes.
- **Google Calendar:** *Other calendars → + → From URL*. Google's servers
  must be able to reach your instance, so this needs a public address.
- **Apple Calendar:** *File → New Calendar Subscription*.
- **Outlook:** *Add calendar → Subscribe from web*.
- Not publicly reachable? Use *Download .ics* and import the file instead.

### Import — one-off

**⚙️ Calendars → Import & sync**: upload an `.ics` file, or paste any iCal URL
(e.g. Google Calendar's "secret address in iCal format" from its settings
page). Imported events show with an orange marker in the planner and can be
removed in one click with *Remove all imported events*.

Limitations: recurring events are imported as their first occurrence only. Times are automatically converted to your server's local timezone (UTC times ending in Z and events with specific TZID values are offset accordingly). Event locations and descriptions are also parsed and synced.

### Deadlines and Calendar Synchronization

Exams and deadlines added in the **Exams & grades** tab are automatically synchronized to the planner calendar as all-day events of type "Deadline" (and vice versa). Deleting, creating, or updating a deadline in either the exams list or as a calendar event will automatically keep both tables synchronized in real-time.

### Auto-sync — keep timetables up to date

**⚙️ Calendars → Import & sync**: paste one or more iCal URLs (one per
line — university timetable, shared family calendar, …) and choose an
interval. A background worker re-imports them automatically, deduplicating
against what's already there. *Sync now* forces an immediate run.

## Notifications (ntfy & Web Push)

TyloPlanner supports pushing morning agendas (including overdue/upcoming tasks), evening habit nudges, and exam/event reminders directly to your devices using either native browser Web Push or ntfy.

### Native Web Push Notifications

You can receive push notifications directly in your browser without any external apps:

1. **Requirements:** To use Web Push notifications, your browser must support the Web Push API, and the site must be accessed over a secure context (HTTPS or `localhost`). If accessed over plain HTTP on a local network, Web Push is unavailable, and the settings panel will display a warning recommending `ntfy`.
2. **Setup:** Go to **Settings → Notifications**, click **Enable Web Push**, and grant the browser notification permission when prompted.
3. **How it works:** The server programmatically generates a VAPID public/private key pair on startup and registers browser subscriptions in a `push_subscriptions` database table.

### ntfy Notifications

Free push notifications to your phone, no account needed:

1. Install the **ntfy** app ([Android](https://play.google.com/store/apps/details?id=io.heckel.ntfy) / [iOS](https://apps.apple.com/us/app/ntfy/id1625396347)) or keep <https://ntfy.sh> open in a browser.
2. In the app, **subscribe to a topic** with a long random name, e.g. `tylo-k2x9vqp4-reminders`. The topic name is the only secret — anyone who knows it can read your notifications, so make it unguessable.
3. In TyloPlanner, **Settings → Notifications**: enter the topic, save, and *Send test notification*.
4. **Self-hosting ntfy:** You can optionally set your own server URL in the same settings card.

### What is Sent

- **Morning agenda** (default 07:30): Today's planner events, alerts for exams that are 7, 3, or 1 day(s) away (thresholds configurable), plus a summary of overdue tasks and tasks due in the next 24 hours.
- **Evening habit nudge** (default 20:00): A reminder for any habits not yet checked off.
- **Event reminders:** Alerts pushed before calendar events (if reminders are configured).
- If nothing is scheduled and no habits are open, the notifications stay quiet.

## Strava

Sync your runs, rides, swims and gym sessions automatically:

Everything happens in the web UI — no server access needed:

1. Create a (free) API application at <https://www.strava.com/settings/api>.
   Set **Authorization Callback Domain** to the value shown in
   **Settings → Strava** (the host of your instance).
2. In **Settings → Strava**, paste the **Client ID** and **Client Secret**
   and hit *Save keys*.
3. Click **Connect Strava**, approve access, done. The first sync runs
   automatically.

(Alternatively, keys can still be set via `STRAVA_CLIENT_ID` /
`STRAVA_CLIENT_SECRET` in `.env`; env values override keys saved in the UI.)

Details: activities map to TyloPlanner types (Run/TrailRun → run,
Ride/VirtualRide/Gravel/MTB → bike, Swim/OpenWaterSwim → swim,
WeightTraining/Workout/Crossfit → gym; other sports are skipped). Synced workouts are tagged with a `strava` badge,
deduplicated by activity ID, and re-syncable any time with the ⟳ button (up
to your last 1000 activities). *Disconnect* removes the stored tokens.
