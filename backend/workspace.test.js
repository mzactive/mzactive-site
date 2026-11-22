import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import worker from "./worker.js";

function setup() {
  const db = new DatabaseSync(":memory:");
  const migrations = new URL("./migrations/", import.meta.url);
  const files = readdirSync(migrations).filter((file) => file.endsWith(".sql")).sort((a, b) => parseInt(a) - parseInt(b));
  for (const file of files) db.exec(readFileSync(new URL(file, migrations), "utf8"));
  const env = {
    DATA_COLLECTION_ENABLED: "true",
    ADMIN_EMAILS: "admin@example.test",
    ADMIN_SETUP_KEY: "local-test",
    DB: {
      prepare(sql) {
        const statement = db.prepare(sql);
        let args = [];
        return {
          bind(...values) { args = values.map((value) => value instanceof ArrayBuffer ? new Uint8Array(value) : value); return this; },
          first() { return statement.get(...args); },
          all() { return { results: statement.all(...args) }; },
          run() { return { meta: statement.run(...args) }; },
        };
      },
      batch(statements) {
        db.exec("BEGIN");
        try {
          const result = statements.map((item) => item.run());
          db.exec("COMMIT");
          return result;
        } catch (error) {
          db.exec("ROLLBACK");
          throw error;
        }
      },
    },
  };
  async function call(path, method = "GET", body, token, expected = 200, headers = {}) {
    const requestHeaders = { ...headers };
    if (token) requestHeaders.authorization = "Bearer " + token;
    const binary = body instanceof Uint8Array;
    if (body !== undefined && !binary) requestHeaders["content-type"] = "application/json";
    const request = new Request("https://example.test/api/" + path, {
      method,
      headers: requestHeaders,
      body: body === undefined ? undefined : binary ? body : JSON.stringify(body),
    });
    const response = await worker.fetch(request, env);
    assert.equal(response.status, expected, method + " " + path + " -> " + response.status);
    if (response.headers.get("content-type")?.startsWith("image/")) return new Uint8Array(await response.arrayBuffer());
    return response.json();
  }
  return { db, env, call };
}

const password = "local-test-password";
const attachment = new Uint8Array(readFileSync(new URL("../assets/brand/mzactive-logo.webp", import.meta.url)));

async function fixtures() {
  const ctx = setup();
  const { call } = ctx;
  const coach = await call("auth/register", "POST", { email: "coach@example.test", password, consent: true, provider_type: "coach" }, null, 201);
  const admin = await call("auth/register", "POST", { email: "admin@example.test", password, consent: true }, null, 201, { "x-admin-setup-key": "local-test" });
  const athlete = await call("auth/register", "POST", { email: "athlete@example.test", password, consent: true, account_type: "member" }, null, 201);
  const outsider = await call("auth/register", "POST", { email: "outsider@example.test", password, consent: true, account_type: "member" }, null, 201);
  const profileId = (await call("me/profile", "GET", undefined, coach.token)).profile.id;
  await call("me/profile", "PUT", {
    provider_type: "coach", display_name: "Workspace Coach", specialties: ["Running"], languages: ["English"],
    bio: "A complete professional biography for review.", qualifications: "Certified coach", services: ["Running plans"],
    coaching_mode: "both", whatsapp_number: "+97455555555", whatsapp_public: true, program_durations: [1],
  }, coach.token);
  const queue = await call("admin/applications", "GET", undefined, admin.token);
  await call("admin/providers/" + profileId, "PATCH", { status: "approved", verified: true, review_version: queue.providers[0].updated_at }, admin.token);
  return { ...ctx, coach, admin, athlete, outsider, profileId };
}

test("0017 creates scoped workspace tables and lifecycle columns", () => {
  const { db } = setup();
  const columns = db.prepare("PRAGMA table_info(coach_connections)").all().map((row) => row.name);
  for (const column of ["booking_id", "source", "athlete_accepted_at", "workspace_status", "workspace_created_at"]) {
    assert.ok(columns.includes(column));
  }
  const bookingColumns = db.prepare("PRAGMA table_info(booking_requests)").all().map((row) => row.name);
  assert.ok(bookingColumns.includes("customer_user_id"));
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((row) => row.name);
  assert.ok(tables.includes("coach_workspace_attachments"));
  assert.ok(tables.includes("coach_workspace_progress"));
  db.close();
});

test("confirmed booking plus mutual acceptance activates one private workspace", async () => {
  const { call, admin, athlete, coach, outsider, profileId, db } = await fixtures();
  const booking = await call("bookings", "POST", {
    provider_id: profileId, customer_name: "Athlete One", customer_email: athlete.email, customer_phone: "+97455555555",
    city: "Doha", goal_summary: "Follow a structured running plan", session_type: "training", program_duration_months: 1, consent: true,
  }, athlete.token, 201);
  assert.equal(booking.status, "received_pending_payment");

  const reviewed = await call("admin/bookings/" + booking.request_id, "PATCH", { status: "accepted" }, admin.token);
  assert.equal(reviewed.status, "accepted");
  assert.equal(reviewed.workspace.activated, false);
  assert.equal(reviewed.workspace.reason, "awaiting_athlete_acceptance");

  const connections = (await call("connections", "GET", undefined, athlete.token)).connections;
  assert.equal(connections.length, 1);
  assert.equal(connections[0].source, "booking");
  assert.equal(connections[0].workspace_status, "pending");
  const connectionId = connections[0].id;

  await call("connections/" + connectionId + "/workspace", "GET", undefined, athlete.token, 409);
  const accepted = await call("connections/" + connectionId, "PATCH", { status: "accepted" }, athlete.token);
  assert.equal(accepted.workspace_active, true);

  const athleteWorkspace = (await call("connections/" + connectionId + "/workspace", "GET", undefined, athlete.token)).workspace;
  const coachWorkspace = (await call("connections/" + connectionId + "/workspace", "GET", undefined, coach.token)).workspace;
  assert.equal(athleteWorkspace.status, "active");
  assert.equal(coachWorkspace.status, "active");
  assert.equal(athleteWorkspace.viewing_as, "athlete");
  assert.equal(coachWorkspace.viewing_as, "coach");
  assert.equal(athleteWorkspace.permissions.coach, false);
  assert.equal(coachWorkspace.permissions.coach, true);
  assert.equal(athleteWorkspace.garmin.sync_enabled, false);
  assert.equal(athleteWorkspace.garmin.sync_status, "not_provided");

  await call("connections/" + connectionId + "/workspace", "GET", undefined, admin.token, 403);
  await call("connections/" + connectionId + "/workspace", "GET", undefined, outsider.token, 404);
  db.close();
});

test("workspace stores messages, attachments, progress and Garmin public link with scoped access", async () => {
  const { call, admin, athlete, coach, profileId, db } = await fixtures();
  const booking = await call("bookings", "POST", {
    provider_id: profileId, customer_name: "Athlete One", customer_email: athlete.email, customer_phone: "+97455555555",
    city: "Doha", goal_summary: "Follow a structured running plan", session_type: "training", program_duration_months: 1, consent: true,
  }, athlete.token, 201);
  await call("admin/bookings/" + booking.request_id, "PATCH", { status: "accepted" }, admin.token);
  const connection = (await call("connections", "GET", undefined, athlete.token)).connections[0];
  await call("connections/" + connection.id, "PATCH", { status: "accepted" }, athlete.token);

  await call("me/sports-profile", "PUT", {
    display_name: "Athlete One", city: "Doha", sports: ["running"], goals: "First half marathon",
    garmin_public_url: "https://connect.garmin.com/profile/athlete", share_with_coaches: true,
  }, athlete.token);
  await call("connections/" + connection.id + "/messages", "POST", { body: "See you at the track." }, coach.token, 201);
  const uploaded = await call("connections/" + connection.id + "/attachments", "POST", attachment, coach.token, 201, {
    "content-type": "image/webp", "x-file-name": "plan.webp",
  });
  assert.equal(uploaded.file_name, "plan.webp");
  assert.equal(uploaded.content_type, "image/webp");
  assert.equal(uploaded.byte_size, attachment.byteLength);
  const downloaded = await call("connections/" + connection.id + "/attachments/" + uploaded.id, "GET", undefined, athlete.token);
  assert.deepEqual(downloaded, attachment);

  await call("connections/" + connection.id + "/progress", "POST", {
    metric: "distance_km", value: "8.5", unit: "km", note: "Easy run", recorded_at: "2026-11-20",
  }, athlete.token, 201);
  await call("connections/" + connection.id + "/progress", "POST", {
    metric: "invalid_metric", value: "1", unit: "", note: "", recorded_at: "2026-11-20",
  }, coach.token, 400);

  const { workspace } = await call("connections/" + connection.id + "/workspace", "GET", undefined, coach.token);
  assert.equal(workspace.messages.length, 1);
  assert.equal(workspace.attachments.length, 1);
  assert.equal(workspace.progress.length, 1);
  assert.equal(workspace.garmin.public_url, "https://connect.garmin.com/profile/athlete");
  assert.equal(workspace.garmin.sync_status, "public_profile_link_only");
  assert.equal(workspace.garmin.sync_enabled, false);
  assert.match(workspace.garmin.note, /Official Garmin Connect authorization/i);
  assert.deepEqual(workspace.history.map((item) => item.type).sort(), ["attachment", "message", "progress"]);

  const coachConnection = (await call("connections", "GET", undefined, coach.token)).connections[0];
  assert.equal(coachConnection.workspace_status, "active");
  assert.equal(coachConnection.booking_id, booking.request_id);
  db.close();
});

test("member profile sharing is opt-in and the private photo is owner-only", async () => {
  const { call, admin, athlete, coach, outsider, profileId, db } = await fixtures();
  const booking = await call("bookings", "POST", {
    provider_id: profileId, customer_name: "Athlete One", customer_email: athlete.email, customer_phone: "+97455555555",
    city: "Doha", goal_summary: "Private profile review", session_type: "training", program_duration_months: 1, consent: true,
  }, athlete.token, 201);
  await call("admin/bookings/" + booking.request_id, "PATCH", { status: "accepted" }, admin.token);
  const connection = (await call("connections", "GET", undefined, athlete.token)).connections[0];
  await call("connections/" + connection.id, "PATCH", { status: "accepted" }, athlete.token);

  await call("me/sports-profile", "PUT", {
    display_name: "Secret Athlete", city: "Doha", sports: ["running"], goals: "Private goal",
    garmin_public_url: "https://connect.garmin.com/profile/secret",
  }, athlete.token);
  const privateWorkspace = (await call("connections/" + connection.id + "/workspace", "GET", undefined, coach.token)).workspace;
  assert.equal(privateWorkspace.garmin.share_enabled, false);
  assert.equal(privateWorkspace.garmin.public_url, "");
  assert.equal(privateWorkspace.athlete.name, "MZ Active member");

  await call("me/sports-profile", "PUT", {
    display_name: "Shared Athlete", city: "Doha", sports: ["running"], goals: "Shared goal",
    garmin_public_url: "https://connect.garmin.com/profile/shared", share_with_coaches: true,
  }, athlete.token);
  const saved = (await call("me/sports-profile", "GET", undefined, athlete.token)).profile;
  assert.equal(saved.share_with_coaches, true);
  const sharedWorkspace = (await call("connections/" + connection.id + "/workspace", "GET", undefined, coach.token)).workspace;
  assert.equal(sharedWorkspace.garmin.share_enabled, true);
  assert.equal(sharedWorkspace.garmin.public_url, "https://connect.garmin.com/profile/shared");
  assert.equal(sharedWorkspace.athlete.name, "Shared Athlete");

  const uploaded = await call("me/sports-profile/photo", "PUT", attachment, athlete.token);
  assert.equal(uploaded.updated, true);
  assert.deepEqual(await call("me/sports-profile/photo", "GET", undefined, athlete.token), attachment);
  // Other accounts cannot probe the endpoint: they receive the same not-found
  // response whether or not the member has uploaded a photo.
  await call("me/sports-profile/photo", "GET", undefined, coach.token, 404);
  await call("me/sports-profile/photo", "GET", undefined, outsider.token, 404);
  await call("me/sports-profile/photo", "GET", undefined, admin.token, 403);
  assert.equal((await call("me/sports-profile/photo", "DELETE", undefined, athlete.token)).removed, true);
  await call("me/sports-profile/photo", "GET", undefined, athlete.token, 404);
  db.close();
});
