-- Study tracker: free-text note on study sessions ("what was studied").
ALTER TABLE study_sessions ADD COLUMN note TEXT DEFAULT '';
