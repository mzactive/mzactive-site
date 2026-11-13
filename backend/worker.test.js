import test from "node:test";
import assert from "node:assert/strict";
import worker, { cleanList, clampInt, clampNullableInt, cleanProfilePhotoUrl, emailValue, hashPassword, normalizeWhatsApp, cleanSocialLinks, readJson, verifyPassword } from "./worker.js";

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
