PRAGMA foreign_keys = ON;

-- Named, least-privilege management permissions. Administrators inherit every
-- permission from the protected admin role; no other account receives access
-- unless an administrator explicitly grants a row below.
CREATE TABLE IF NOT EXISTS management_permissions (
  code TEXT PRIMARY KEY,
  label_en TEXT NOT NULL,
  label_ar TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_management_permissions (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permission_code TEXT NOT NULL REFERENCES management_permissions(code) ON DELETE CASCADE,
  granted_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  granted_at TEXT NOT NULL,
  PRIMARY KEY (user_id, permission_code)
);

CREATE INDEX IF NOT EXISTS user_management_permissions_code
  ON user_management_permissions(permission_code, user_id);

INSERT OR IGNORE INTO management_permissions(code, label_en, label_ar) VALUES
  ('management.view', 'Management dashboard', 'لوحة الإدارة'),
  ('management.coaches', 'Coaches and professionals', 'المدربون والمختصون'),
  ('management.bookings', 'Booking requests', 'طلبات الحجز'),
  ('management.community', 'Community moderation', 'إشراف المجتمع'),
  ('management.articles', 'Article moderation', 'مراجعة المقالات'),
  ('management.ai', 'MZ AI Brain', 'دماغ MZ الذكي'),
  ('management.audit', 'Security audit', 'سجل الأمان');
