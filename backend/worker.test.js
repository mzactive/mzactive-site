import test from "node:test";
import assert from "node:assert/strict";
import worker, { cleanList, clampInt, clampNullableInt, cleanProfilePhotoUrl, emailValue, hashPassword, normalizeWhatsApp, cleanSocialLinks, profilePhotoType, readJson, verifyPassword } from "./worker.js";

test("normalizes valid email and rejects malformed or unbounded values", () => {
  assert.equal(emailValue("  Runner@Example.com "), "runner@example.com");
  assert.equal(emailValue("not-an-email"), "");
  assert.equal(emailValue("x".repeat(300) + "@example.com"), "");
});

test("validates explicitly international WhatsApp numbers", () => {
  assert.equal(normalizeWhatsApp("+974 6629 7954"), "97466297954");
  assert.equal(normalizeWhatsApp("+1 (202) 555-0101"), "12025550101");
  assert.equal(normalizeWhatsApp("66297954"), null);
  assert.equal(normalizeWhatsApp(""), "");
});

test("accepts only safe HTTPS social profile links and caps the list", () => {
  assert.deepEqual(cleanSocialLinks(["https://instagram.com/runner", "https://strava.com/athletes/1"]), ["https://instagram.com/runner", "https://strava.com/athletes/1"]);
  assert.deepEqual(cleanSocialLinks(""), []);
  assert.equal(cleanSocialLinks(["javascript:alert(1)"]), null);
  assert.equal(cleanSocialLinks(["http://example.com"]), null);
  assert.equal(cleanSocialLinks(["https://example.com", "https://two.example", "https://three.example", "https://four.example", "https://five.example", "https://six.example"]), null);
});

test("accepts a public HTTPS profile photo link but rejects unsafe links", () => {
  assert.equal(cleanProfilePhotoUrl("https://images.example.com/coach.jpg"), "https://images.example.com/coach.jpg");
  assert.equal(cleanProfilePhotoUrl(""), "");
  assert.equal(cleanProfilePhotoUrl("http://images.example.com/coach.jpg"), null);
  assert.equal(cleanProfilePhotoUrl("javascript:alert(1)"), null);
});

test("recognizes only supported profile photo formats", () => {
  assert.equal(profilePhotoType(Uint8Array.from([0xff, 0xd8, 0xff, 0x00]).buffer), "image/jpeg");
  assert.equal(profilePhotoType(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).buffer), "image/png");
  assert.equal(profilePhotoType(Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]).buffer), "image/webp");
  assert.equal(profilePhotoType(Uint8Array.from([1, 2, 3]).buffer), "");
});

test("bounds profile list and numeric fields", () => {
  assert.deepEqual(cleanList([" Running ", "<script>", "other"], 2, 20), ["Running", "<script>"]);
  assert.equal(clampInt(100, 0, 60), 60);
  assert.equal(clampInt("4", 0, 60), 0);
  assert.equal(clampNullableInt(150000, 0, 100000), 100000);
  assert.equal(clampNullableInt(null, 0, 100000), null);
});

test("password hashes use a random salt and verify only the matching secret", async () => {
  const first = await hashPassword("a sufficiently long password");
  const second = await hashPassword("a sufficiently long password");
  assert.notEqual(first, second);
  assert.match(first, /^pbkdf2-sha256\$100000\$/);
  assert.equal(await verifyPassword("a sufficiently long password", first), true);
  assert.equal(await verifyPassword("incorrect password", first), false);
});

test("body parser rejects invalid and oversized JSON", async () => {
  assert.deepEqual(await readJson(new Request("https://api.example.test", { method: "POST", body: "{\"ok\":true}" })), { ok: true });
  assert.equal(await readJson(new Request("https://api.example.test", { method: "POST", body: "not json" })), null);
  assert.equal(await readJson(new Request("https://api.example.test", { method: "POST", body: "x".repeat(17_000) })), null);
});

test("intake remains closed by default and rejects unapproved browser origins", async () => {
  const noDatabase = { DB: { prepare() { throw new Error("Disabled intake must not touch D1"); } } };
  const closed = await worker.fetch(new Request("https://api.example.test/api/auth/register", { method: "POST", body: "{}" }), noDatabase);
  assert.equal(closed.status, 503);
  assert.equal((await closed.json()).error, "intake_paused");
  const blocked = await worker.fetch(new Request("https://api.example.test/health", { headers: { Origin: "https://evil.example" } }), noDatabase);
  assert.equal(blocked.status, 403);
});

test("health reports closed intake without accessing storage", async () => {
  const noDatabase = { DB: { prepare() { throw new Error("Health check must not touch D1"); } } };
  const response = await worker.fetch(new Request("https://api.example.test/health"), noDatabase);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, intake_enabled: false });
});

test("Admin queue rejects a caller without an authenticated session", async () => {
  const noDatabase = { DB: { prepare() { throw new Error("Unauthenticated Admin calls must not query D1"); } } };
  const response = await worker.fetch(new Request("https://api.example.test/api/admin/applications"), noDatabase);
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "unauthorized" });
});

test("pending profile photos are served only through the authenticated Admin route", async () => {
  const photoBytes = Uint8Array.from([0xff, 0xd8, 0xff, 0x00]);
  const makeEnv = (role) => ({ DB: { prepare(sql) { return { bind() { return this; }, async first() {
    if (sql.includes("JOIN users")) return { id: "admin-id", email: "admin@example.com", role };
    if (sql.includes("profile_photo_bytes")) return { profile_photo_bytes: photoBytes, profile_photo_content_type: "image/jpeg" };
    return null;
  } }; } } });
  const url = "https://api.example.test/api/admin/providers/12345678-1234-1234-1234-123456789012/photo";
  const request = () => new Request(url, { headers: { Authorization: `Bearer ${"a".repeat(40)}` } });

  const allowed = await worker.fetch(request(), makeEnv("admin"));
  assert.equal(allowed.status, 200);
  assert.equal(allowed.headers.get("content-type"), "image/jpeg");
  assert.equal(allowed.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(new Uint8Array(await allowed.arrayBuffer()), photoBytes);

  const denied = await worker.fetch(request(), makeEnv("provider"));
  assert.equal(denied.status, 403);
  assert.deepEqual(await denied.json(), { error: "forbidden" });
});
