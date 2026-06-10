# Integrations

## Calendar

### Export — subscribe from your calendar app

Your planner events and exams are published as an iCal feed. Copy the secret
feed URL from **Settings → Calendar export**, then:

- **Google Calendar:** *Other calendars → + → From URL*. Google's servers
  must be able to reach your instance, so this needs a public address.
- **Apple Calendar:** *File → New Calendar Subscription*.
- **Outlook:** *Add calendar → Subscribe from web*.
- Not publicly reachable? Use *Download .ics* and import the file instead.

### Import — one-off

**Settings → Calendar import**: upload an `.ics` file, or paste any iCal URL
(e.g. Google Calendar's "secret address in iCal format" from its settings
page). Imported events show with an orange marker in the planner and can be
removed in one click with *Remove all imported events*.

Limitations: recurring events are imported as their first occurrence only,
and times are taken as written (timezones are not converted).

### Auto-sync — keep timetables up to date

**Settings → Calendar auto-sync**: paste one or more iCal URLs (one per
line — university timetable, shared family calendar, …) and choose an
interval. A background worker re-imports them automatically, deduplicating
against what's already there. *Sync now* forces an immediate run.

## Notifications (ntfy)

Free push notifications to your phone, no account needed:

1. Install the **ntfy** app ([Android](https://play.google.com/store/apps/details?id=io.heckel.ntfy) / [iOS](https://apps.apple.com/us/app/ntfy/id1625396347)) or keep https://ntfy.sh open in a browser.
2. In the app, **subscribe to a topic** with a long random name, e.g.
   `tylo-k2x9vqp4-reminders`. The topic name is the only secret — anyone who
   knows it can read your notifications, so make it unguessable.
3. In TyloPlanner, **Settings → Notifications**: enter the topic, save, and
   *Send test notification*.

What you'll receive:

- **Morning agenda** (default 07:30): today's planner events plus alerts for
  exams that are 7, 3 or 1 day(s) away (thresholds configurable).
- **Evening habit nudge** (default 20:00): any habits not yet checked off.
- Nothing scheduled and nothing due? No notification — it stays quiet.

Self-hosting ntfy? Set your own server URL in the same settings card.

## Strava

Sync your runs, rides and gym sessions automatically:

1. Create a (free) API application at <https://www.strava.com/settings/api>.
   Set **Authorization Callback Domain** to the host of your `APP_URL` —
   `localhost` for local use, or your domain.
2. Put `STRAVA_CLIENT_ID` and `STRAVA_CLIENT_SECRET` in `.env` and run
   `docker compose up -d --build`.
3. **Settings → Strava → Connect Strava**, approve access, done. The first
   sync runs automatically.

Details: activities map to TyloPlanner types (Run/TrailRun → run,
Ride/VirtualRide/Gravel/MTB → bike, WeightTraining/Workout/Crossfit → gym;
other sports are skipped). Synced workouts are tagged with a `strava` badge,
deduplicated by activity ID, and re-syncable any time with the ⟳ button (up
to your last 1000 activities). *Disconnect* removes the stored tokens.
