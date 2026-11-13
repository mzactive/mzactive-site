-- Store WhatsApp-first requests for manual Fawran follow-up; no gateway or payment data.
CREATE TABLE booking_requests_new (
  id TEXT PRIMARY KEY,
  provider_id TEXT REFERENCES provider_profiles(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL,
  customer_email TEXT,
  customer_phone TEXT NOT NULL,
  city TEXT NOT NULL,
  preferred_date TEXT,
  goal_summary TEXT NOT NULL,
  consent_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'reviewing', 'accepted', 'declined', 'cancelled')),
  created_at TEXT NOT NULL,
  payment_status TEXT NOT NULL DEFAULT 'pending_payment' CHECK (payment_status IN ('pending_payment', 'confirmed', 'cancelled')),
  session_type TEXT NOT NULL CHECK (session_type IN ('race', 'training')),
  distance TEXT,
  target_pace TEXT
);

INSERT INTO booking_requests_new(id,provider_id,customer_name,customer_email,customer_phone,city,preferred_date,goal_summary,consent_at,status,created_at,payment_status,session_type,distance,target_pace)
SELECT id,provider_id,customer_name,customer_email,COALESCE(customer_phone,''),city,preferred_date,goal_summary,consent_at,status,created_at,
       CASE WHEN status IN ('declined','cancelled') THEN 'cancelled' ELSE 'pending_payment' END,
       'training',NULL,NULL
FROM booking_requests;

DROP TABLE booking_requests;
ALTER TABLE booking_requests_new RENAME TO booking_requests;
CREATE INDEX booking_review_queue ON booking_requests(status, created_at);
