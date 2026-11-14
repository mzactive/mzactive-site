import test from "node:test";
import assert from "node:assert/strict";
import worker, { cleanList, clampInt, clampNullableInt, cleanProfilePhotoUrl, emailValue, hashPassword, normalizeWhatsApp, cleanSocialLinks, profilePhotoType, readJson, verifyPassword } from "./worker.js";

test("normalizes valid email and rejects malformed or unbounded values", () => {
  assert.equal(emailValue("  Runner@Example.com "), "runner@example.com");
  assert.equal(emailValue("not-an-email"), "");
  assert.equal(emailValue("x".repeat(300) + "@example.com"), "");
});

test("accepts Qatar local and international WhatsApp numbers", () => {
  assert.equal(normalizeWhatsApp("+974 6629 7954"), "97466297954");
  assert.equal(normalizeWhatsApp("66297954"), "97466297954");
  assert.equal(normalizeWhatsApp("+1 (202) 555-0101"), "12025550101");
  assert.equal(normalizeWhatsApp("123"), null);
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

test("provider photo upload is visible to Admin while remaining private before approval", async () => {
  const providerToken = "p".repeat(40), adminToken = "a".repeat(40);
  const tokenHash = async (token) => {
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)));
    return btoa(String.fromCharCode(...digest)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
  };
  const sessions = new Map([[await tokenHash(providerToken), { id: "provider-id", email: "provider@example.com", role: "provider" }], [await tokenHash(adminToken), { id: "admin-id", email: "admin@example.com", role: "admin" }]]);
  let storedPhoto = null;
  const env = { DATA_COLLECTION_ENABLED: "true", DB: { prepare(sql) { let params = []; return {
    bind(...values) { params = values; return this; },
    async first() {
      if (sql.includes("SELECT u.id")) return sessions.get(params[0]) || null;
      if (sql.includes("profile_photo_bytes") && sql.includes("status='pending'")) return storedPhoto;
      if (sql.includes("status='approved'")) return null;
      return null;
    },
    async run() {
      if (sql.startsWith("UPDATE provider_profiles SET profile_photo_bytes=")) storedPhoto = { profile_photo_bytes: params[0], profile_photo_content_type: params[1] };
      return { meta: { changes: 1 } };
    },
  }; } } };
  const id = "12345678-1234-1234-1234-123456789012";
  const photo = Uint8Array.from([0xff, 0xd8, 0xff, 0x00]);
  const uploaded = await worker.fetch(new Request("https://api.example.test/api/me/profile/photo", {
    method: "PUT", headers: { Authorization: `Bearer ${providerToken}`, "content-type": "image/jpeg" }, body: photo,
  }), env);
  assert.equal(uploaded.status, 200);
  assert.equal((await uploaded.json()).photo_uploaded, true);

  const adminView = await worker.fetch(new Request(`https://api.example.test/api/admin/providers/${id}/photo`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  }), env);
  assert.equal(adminView.status, 200);
  assert.deepEqual(new Uint8Array(await adminView.arrayBuffer()), photo);

  const publicView = await worker.fetch(new Request(`https://api.example.test/api/providers/${id}/photo`), env);
  assert.equal(publicView.status, 404);
});

test("profile edits accept optional details and normalize Qatar WhatsApp numbers", async () => {
  const token = "p".repeat(40);
  let saved = null;
  const env = { DATA_COLLECTION_ENABLED: "true", DB: { prepare(sql) { let params = []; return {
    bind(...values) { params = values; return this; },
    async first() { return sql.includes("SELECT u.id") ? { id: "provider-id", email: "provider@example.com", role: "provider" } : null; },
    async run() { if (sql.includes("SET provider_type=?")) saved = params; return { meta: { changes: 1 } }; },
  }; } } };
  const response = await worker.fetch(new Request("https://api.example.test/api/me/profile", {
    method: "PUT", headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ provider_type: "coach", display_name: "", city: "", bio: "", whatsapp_number: "66297954", whatsapp_public: true, social_links: ["javascript:alert(1)"] }),
  }), env);
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).warnings, ["social_links_skipped"]);
  assert.equal(saved[1], ""); // preserve the existing display name
  assert.equal(saved[10], "97466297954");
  assert.equal(saved[11], 1);
  assert.equal(saved[12], "[]"); // unsafe links are skipped, not rendered
});

test("AI chat is bounded, uses the assistant binding, and does not persist chat text", async () => {
  const queries = [];
  let inputSeen;
  const env = {
    DB: { prepare(sql) { queries.push(sql); return { bind() { return this; }, async first() { return { request_count: 1 }; }, async run() { return { meta: { changes: 0 } }; } }; } },
    AI: { async run(model, input) { inputSeen = { model, input }; return { response: "Use the coach directory to find a profile." }; } },
  };
  const response = await worker.fetch(new Request("https://api.example.test/api/assistant/chat", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "How do I find a coach?", history: [{ role: "user", content: "Hello" }] }),
  }), env);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { answer: "Use the coach directory to find a profile." });
  assert.equal(inputSeen.model, "@cf/meta/llama-3.1-8b-instruct");
  assert.equal(inputSeen.input.max_tokens, 180);
  assert.equal(inputSeen.input.messages.at(-1).content, "How do I find a coach?");
  assert.ok(queries.some((sql) => sql.includes("ai_chat_usage")));
  assert.ok(queries.every((sql) => !sql.includes("Hello") && !sql.includes("How do I find a coach?")));
});

test("AI chat stops at the shared daily cap", async () => {
  let modelCalled = false;
  const env = { DB: { prepare(sql) { return { bind() { return this; }, async first() { return sql.includes("ai_chat_usage") ? null : { request_count: 1 }; }, async run() { return { meta: { changes: 0 } }; } }; } }, AI: { async run() { modelCalled = true; return { response: "not expected" }; } } };
  const response = await worker.fetch(new Request("https://api.example.test/api/assistant/chat", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: "Where do I find a coach?" }),
  }), env);
  assert.equal(response.status, 429);
  assert.deepEqual(await response.json(), { error: "daily_limit_reached" });
  assert.equal(modelCalled, false);
});
