CREATE TABLE IF NOT EXISTS ai_chat_usage (
  usage_date TEXT PRIMARY KEY,
  request_count INTEGER NOT NULL CHECK (request_count >= 0)
);
