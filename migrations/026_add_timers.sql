-- Natural-language timers/alarms. Rows exist only for timers whose owner
-- enabled phone push; the scheduler fires the push at fire_at then deletes the
-- row. The live on-screen countdown lives in the browser (localStorage), so
-- pure focus timers with push off never touch this table.
CREATE TABLE IF NOT EXISTS timers (
  id       TEXT PRIMARY KEY,   -- client-generated, matches the localStorage entry
  label    TEXT,
  fire_at  INTEGER NOT NULL,   -- absolute unix epoch seconds
  created  INTEGER
);
