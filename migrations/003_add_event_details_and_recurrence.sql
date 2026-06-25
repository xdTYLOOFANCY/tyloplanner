ALTER TABLE events ADD COLUMN description TEXT;
ALTER TABLE events ADD COLUMN location TEXT;
ALTER TABLE events ADD COLUMN recurrence TEXT DEFAULT 'none';
ALTER TABLE events ADD COLUMN recurrence_until TEXT;
