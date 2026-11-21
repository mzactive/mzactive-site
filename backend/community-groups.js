// Community groups, membership, chat, events and moderation.
// This module is additive: legacy /api/community/posts continues to work.
const REPORT_REASONS = ["spam", "harassment", "unsafe", "misinformation", "other"];
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const OCCURRENCE_COUNT = 8;
const MAX_CHAT_MESSAGE_LENGTH = 2000;

function nameKey(value, api) {
  return api.text(value, 120).trim().replace(/\s+/g, " ").toLocaleLowerCase("en");
}

function sportValue(value, community, api) {
  const sport = api.text(value, 40).toLowerCase();
  if (api.sports.includes(sport)) return sport;
  return api.text(community?.sport, 40) || "other";
}

async function loadCommunity(env, id, userId = "") {
  return env.DB.prepare(`SELECT c.*,
    (SELECT COUNT(*) FROM community_group_members m WHERE m.community_id=c.id AND m.status='active') AS member_count,
    (SELECT role FROM community_group_members m WHERE m.community_id=c.id AND m.user_id=?) AS viewer_role,
    (SELECT status FROM community_group_members m WHERE m.community_id=c.id AND m.user_id=?) AS viewer_status
    FROM communities c WHERE c.id=?`).bind(userId, userId, id).first();
}

function accessFor(community, user) {
  const isAdmin = user?.role === "admin";
  const isMember = community?.viewer_status === "active";
  const isOwner = community?.viewer_role === "owner";
  const canManage = isAdmin || isOwner || community?.viewer_role === "moderator";
  return {
    isAdmin, isMember, isOwner, canManage,
    canPost: isMember || isAdmin,
    visible: Boolean(community) && community.status === "active" &&
      (isAdmin || community.visibility === "public" || isMember),
  };
}

async function requireManagement(env, api, request, user) {
  if (!user) return api.reply(request, env, { error: "unauthorized" }, 401);
  const [view, community] = await Promise.all([
    api.hasManagementPermission(env, user, "management.view"),
    api.hasManagementPermission(env, user, "management.community"),
  ]);
  if (!view || !community) return api.reply(request, env, { error: "forbidden" }, 403);
  return null;
}

function activeAccess(community, user) {
  const access = accessFor(community, user);
  return access.visible ? access : null;
}

function publicCommunity(row, access) {
  return {
    id: row.id, name: row.name, sport: row.sport, description: row.description,
    location: row.location, visibility: row.visibility, rules: row.rules,
    owner_user_id: row.owner_user_id, member_count: Number(row.member_count || 0),
    status: row.status, created_at: row.created_at, updated_at: row.updated_at,
    has_cover: Boolean(row.cover_bytes),
    viewer: {
      member: access.isMember, owner: access.isOwner, can_manage: access.canManage,
      can_post: access.canPost, membership_status: row.viewer_status || "", role: row.viewer_role || "",
    },
  };
}

async function audit(env, communityId, actorId, action, entityType = "", entityId = "", details = {}) {
  if (!communityId) return;
  await env.DB.prepare(`INSERT INTO community_audit(id,community_id,actor_user_id,action,entity_type,entity_id,details_json,created_at)
    VALUES(?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(), communityId, actorId, action, entityType, entityId, JSON.stringify(details), new Date().toISOString()).run();
}

async function notifyUser(env, api, communityId, userId, settingsKey, type, title, body, entityType, entityId) {
  if (!userId) return;
  const pref = communityId
    ? await env.DB.prepare("SELECT muted,activity_enabled,event_reminders FROM community_message_reads WHERE community_id=? AND user_id=?")
      .bind(communityId, userId).first()
    : null;
  if (pref?.muted) return;
  if (settingsKey === "activity" && pref && !pref.activity_enabled) return;
  if (settingsKey === "events" && pref && !pref.event_reminders) return;
  await api.createNotification(env, userId, type, title, body, entityType, entityId);
}

async function notifyMembers(env, api, communityId, excludeUserId, settingsKey, type, title, body, entityType, entityId) {
  const rows = await env.DB.prepare("SELECT user_id FROM community_group_members WHERE community_id=? AND status='active' AND user_id<>? LIMIT 200")
    .bind(communityId, excludeUserId || "").all();
  for (const row of rows.results || []) {
    await notifyUser(env, api, communityId, row.user_id, settingsKey, type, title, body, entityType, entityId);
  }
}

async function notifyModerators(env, api, communityId, ownerUserId, title, body, entityType, entityId) {
  const rows = await env.DB.prepare("SELECT user_id FROM community_group_members WHERE community_id=? AND status='active' AND role IN ('owner','moderator') LIMIT 20")
    .bind(communityId).all();
  const ids = [...new Set([...(rows.results || []).map((row) => row.user_id), ownerUserId].filter(Boolean))];
  for (const id of ids) await notifyUser(env, api, communityId, id, "activity", "community_review", title, body, entityType, entityId);
}

async function createPostRecord(env, api, user, community, body) {
  const kind = ["post", "event", "group_session"].includes(body?.kind) ? body.kind : "post";
  const content = api.text(body?.body, 4000);
  const timed = kind === "event" || kind === "group_session";
  if (!content) return { error: "post_body_required", status: 400 };
  const title = api.text(body?.title, 140) || (timed ? content.slice(0, 80) : "");
  const startsInput = api.text(body?.starts_at, 40);
  if (timed && (!startsInput || !Number.isFinite(Date.parse(startsInput)))) return { error: "start_time_required", status: 400 };
  const startIso = timed ? new Date(startsInput).toISOString() : null;
  if (timed && Date.parse(startIso) < Date.now() - 3600000) return { error: "event_in_past", status: 400 };
  const location = api.text(body?.location, 120), onlineDetails = api.text(body?.online_details, 300);
  if (timed && !location && !onlineDetails) return { error: "event_location_required", status: 400 };
  const capacity = body?.capacity === undefined || body?.capacity === null || body?.capacity === ""
    ? null : api.clampInt(body.capacity, 1, 10000);
  const repeat = timed && body?.repeat_weekly === true;
  const seriesId = repeat ? api.randomId() : null;
  const starts = repeat
    ? Array.from({ length: OCCURRENCE_COUNT }, (_, index) => new Date(Date.parse(startIso) + index * WEEK_MS).toISOString())
    : [startIso];
  let status = await api.canPublishImmediately(env, user) ? "published" : "pending";
  if (community) {
    const membership = await env.DB.prepare("SELECT role FROM community_group_members WHERE community_id=? AND user_id=? AND status='active'")
      .bind(community.id, user.id).first();
    if (["owner", "moderator"].includes(membership?.role)) status = "published";
  }
  const now = api.now();
  const publishedAt = status === "published" ? now : null;
  const sport = sportValue(body?.sport, community, api);
  const language = body?.language === "ar" ? "ar" : "en";
  const visibility = community?.visibility === "private" ? "private" : "public";
  const communityId = community?.id || null;
  const organizer = api.text(body?.organizer_profile_id, 36) || null;
  let createdId = "", inserted = 0;
  for (const startsAt of starts) {
    const id = api.randomId();
    const result = await env.DB.prepare(`INSERT OR IGNORE INTO community_posts
      (id,author_user_id,community_id,kind,title,body,sport,language,starts_at,starts_at_local,timezone,location,capacity,status,visibility,series_id,recurrence,organizer_profile_id,online_details,created_at,updated_at,published_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(id, user.id, communityId, kind, title, content, sport, language, startsAt,
        api.text(body?.starts_at_local, 40), api.text(body?.timezone, 40) || "Asia/Qatar",
        location, capacity, status, visibility, seriesId, repeat ? "weekly" : "none",
        organizer, onlineDetails, now, now, publishedAt).run();
    if (result.meta?.changes) {
      inserted += 1;
      if (!createdId) createdId = id;
    } else if (seriesId) {
      const existing = await env.DB.prepare("SELECT id FROM community_posts WHERE series_id=? AND starts_at=?").bind(seriesId, startsAt).first();
      if (existing && !createdId) createdId = existing.id;
    } else {
      const existing = await env.DB.prepare("SELECT id FROM community_posts WHERE author_user_id=? AND starts_at=? AND body=? ORDER BY created_at DESC LIMIT 1")
        .bind(user.id, startsAt, content).first();
      if (existing) createdId = existing.id;
    }
  }
  if (communityId) await audit(env, communityId, user.id, repeat ? "event_series_created" : "post_created", "community_post", createdId, { kind, status, occurrences: inserted });
  if (communityId && status === "published") {
    await notifyMembers(env, api, communityId, user.id, timed ? "events" : "activity",
      timed ? "community_event" : "community_post", timed ? "New community event" : "New community post",
      title || content.slice(0, 120), "community_post", createdId);
  }
  return { id: createdId, status, kind, occurrences: inserted, series_id: seriesId || "" };
}

async function postForCommunity(env, communityId, postId) {
  return env.DB.prepare("SELECT * FROM community_posts WHERE id=? AND community_id=?").bind(postId, communityId).first();
}

async function requirePostAccess(env, api, request, communityId, postId, options = {}) {
  const auth = await api.authenticated(request, env);
  if (auth.response) return { response: auth.response };
  const community = await loadCommunity(env, communityId, auth.user.id);
  if (!community) return { response: api.reply(request, env, { error: "community_not_found" }, 404) };
  const access = accessFor(community, auth.user);
  if (!access.visible) return { response: api.reply(request, env, { error: "community_forbidden" }, 403) };
  const post = await postForCommunity(env, communityId, postId);
  if (!post) return { response: api.reply(request, env, { error: "post_not_found" }, 404) };
  const allowed = options.manage ? access.canManage : access.isMember || access.canManage;
  if (!allowed) return { response: api.reply(request, env, { error: "forbidden" }, 403) };
  return { auth, community, access, post };
}

async function communityList(env, api, request, url, user) {
  const scope = url.searchParams.get("scope") === "mine" ? "mine" : "discover";
  const query = api.text(url.searchParams.get("q"), 100);
  const sport = api.text(url.searchParams.get("sport"), 40).toLowerCase();
  const location = api.text(url.searchParams.get("location"), 80);
  const limit = Math.min(60, Math.max(1, Number(url.searchParams.get("limit")) || 24));
  const where = scope === "mine"
    ? "EXISTS(SELECT 1 FROM community_group_members m WHERE m.community_id=c.id AND m.user_id=? AND m.status='active')"
    : "c.status='active' AND c.visibility='public'";
  const bindings = scope === "mine" ? [user?.id || "", user?.id || "", user?.id || ""] : [user?.id || "", user?.id || ""];
  const rows = await env.DB.prepare(`SELECT c.*,
      (SELECT COUNT(*) FROM community_group_members m WHERE m.community_id=c.id AND m.status='active') AS member_count,
      (SELECT role FROM community_group_members m WHERE m.community_id=c.id AND m.user_id=?) AS viewer_role,
      (SELECT status FROM community_group_members m WHERE m.community_id=c.id AND m.user_id=?) AS viewer_status
    FROM communities c WHERE ${where}
    AND (?='' OR c.name LIKE ? OR c.sport LIKE ? OR c.description LIKE ?)
    AND (?='' OR c.sport=?)
    AND (?='' OR c.location LIKE ?)
    ORDER BY c.created_at DESC LIMIT ?`)
    .bind(...bindings, query, `%${query}%`, `%${query}%`, `%${query}%`, sport, sport, location, `%${location}%`, limit).all();
  const communities = (rows.results || []).map((row) => publicCommunity(row, accessFor(row, user)));
  return api.reply(request, env, { communities, scope, has_more: communities.length === limit });
}

async function communityDetail(env, api, request, community, user) {
  const access = accessFor(community, user);
  if (!access.visible) return api.reply(request, env, { error: "community_forbidden" }, 403);
  const [members, moderators] = await Promise.all([
    env.DB.prepare(`SELECT m.user_id,m.role,m.joined_at,COALESCE(NULLIF(msp.display_name,''),NULLIF(pp.display_name,''),'Member') AS display_name
      FROM community_group_members m JOIN users u ON u.id=m.user_id
      LEFT JOIN member_sports_profiles msp ON msp.user_id=m.user_id
      LEFT JOIN provider_profiles pp ON pp.user_id=m.user_id
      WHERE m.community_id=? AND m.status='active' ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'moderator' THEN 1 ELSE 2 END,m.joined_at LIMIT 100`).bind(community.id).all(),
    env.DB.prepare("SELECT user_id FROM community_group_members WHERE community_id=? AND role IN ('owner','moderator') AND status='active'").bind(community.id).all(),
  ]);
  const prefs = user ? await env.DB.prepare("SELECT muted,activity_enabled,event_reminders,last_read_at FROM community_message_reads WHERE community_id=? AND user_id=?")
    .bind(community.id, user.id).first() : null;
  return api.reply(request, env, {
    community: publicCommunity(community, access),
    members: (members.results || []).map((row) => ({ user_id: row.user_id, role: row.role, joined_at: row.joined_at, display_name: row.display_name })),
    moderators: (moderators.results || []).map((row) => row.user_id),
    notifications: {
      muted: Boolean(prefs?.muted), activity_enabled: prefs?.activity_enabled !== 0,
      event_reminders: prefs?.event_reminders !== 0, last_read_at: prefs?.last_read_at || "",
    },
  });
}

export async function handleCommunityGroupsApi(request, env, url, api) {
  const path = url.pathname, method = request.method;
  const user = await api.currentUser(request, env);

  // These routes are intercepted before the legacy admin dispatcher, so apply
  // the same management.view + management.community gate here.
  if (path.startsWith("/api/admin/communities") || path.startsWith("/api/admin/community/")) {
    const guard = await requireManagement(env, api, request, user);
    if (guard) return guard;
  }

  if (path === "/api/communities" && method === "GET") return communityList(env, api, request, url, user);
  if (path === "/api/community/upcoming" && method === "GET") {
    const now = api.now();
    const end = new Date(Date.parse(now) + 7 * 24 * 3600000).toISOString();
    const rows = await env.DB.prepare(`${api.postSelect}
      WHERE p.status='published' AND p.kind IN ('event','group_session') AND p.cancelled_at IS NULL
      AND p.visibility='public' AND p.starts_at>=? AND p.starts_at<=?
      AND (p.community_id IS NULL OR EXISTS(SELECT 1 FROM communities c WHERE c.id=p.community_id AND c.status='active' AND c.visibility='public'))
      ORDER BY p.starts_at LIMIT 50`).bind(now, end).all();
    return api.reply(request, env, { events: await api.enrichPosts(env, rows.results || [], user?.id || "") });
  }

  if (path === "/api/communities" && method === "POST") {
    const auth = await api.authenticated(request, env);
    if (auth.response) return auth.response;
    if (!await api.rateLimitScoped(env, `community-create:${auth.user.id}`, 3, 1440)) return api.reply(request, env, { error: "rate_limited" }, 429);
    const body = await api.readJson(request);
    const name = api.text(body?.name, 120), key = nameKey(name, api);
    const description = api.text(body?.description, 4000), chosenSport = sportValue(body?.sport, null, api);
    const rules = api.text(body?.rules, 4000), location = api.text(body?.location, 120);
    const visibility = body?.visibility === "private" ? "private" : "public";
    if (key.length < 3 || description.length < 10) return api.reply(request, env, { error: "invalid_community" }, 400);
    if (await env.DB.prepare("SELECT id FROM communities WHERE name_key=?").bind(key).first()) return api.reply(request, env, { error: "community_name_taken" }, 409);
    const id = api.randomId(), now = api.now();
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO communities(id,name,name_key,sport,description,location,visibility,rules,owner_user_id,status,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?,?,?,'active',?,?)`).bind(id, name, key, chosenSport, description, location, visibility, rules, auth.user.id, now, now),
      env.DB.prepare(`INSERT INTO community_group_members(community_id,user_id,role,status,joined_at,updated_at)
        VALUES(?,?,'owner','active',?,?)`).bind(id, auth.user.id, now, now),
      env.DB.prepare(`INSERT INTO community_audit(id,community_id,actor_user_id,action,entity_type,entity_id,created_at)
        VALUES(?,?,?,'community_created','community',?,?)`).bind(api.randomId(), id, auth.user.id, id, now),
    ]);
    const created = await loadCommunity(env, id, auth.user.id);
    return api.reply(request, env, { community: publicCommunity(created, accessFor(created, auth.user)) }, 201);
  }

  let match = /^\/api\/communities\/([\w-]{36})$/.exec(path);
  if (match) {
    const community = await loadCommunity(env, match[1], user?.id);
    if (!community) return api.reply(request, env, { error: "community_not_found" }, 404);
    if (method === "GET") return communityDetail(env, api, request, community, user);
    if (method === "PATCH") {
      const auth = await api.authenticated(request, env);
      if (auth.response) return auth.response;
      if (!activeAccess(community, auth.user)?.canManage) return api.reply(request, env, { error: "forbidden" }, 403);
      const body = await api.readJson(request);
      const name = api.text(body?.name, 120), key = nameKey(name, api);
      if (key.length < 3) return api.reply(request, env, { error: "invalid_community" }, 400);
      const duplicate = await env.DB.prepare("SELECT id FROM communities WHERE name_key=? AND id<>?").bind(key, community.id).first();
      if (duplicate) return api.reply(request, env, { error: "community_name_taken" }, 409);
      const description = api.text(body?.description, 4000);
      if (description.length < 10) return api.reply(request, env, { error: "invalid_community" }, 400);
      const now = api.now();
      await env.DB.prepare(`UPDATE communities SET name=?,name_key=?,sport=?,description=?,location=?,visibility=?,rules=?,updated_at=? WHERE id=?`)
        .bind(name, key, sportValue(body?.sport, community, api), description, api.text(body?.location, 120),
          body?.visibility === "private" ? "private" : "public", api.text(body?.rules, 4000), now, community.id).run();
      await audit(env, community.id, auth.user.id, "community_updated", "community", community.id, { visibility: body?.visibility });
      return api.reply(request, env, { updated: true });
    }
  }

  match = /^\/api\/communities\/([\w-]{36})\/cover$/.exec(path);
  if (match) {
    const community = await loadCommunity(env, match[1], user?.id);
    if (!community) return api.reply(request, env, { error: "community_not_found" }, 404);
    if (!accessFor(community, user).visible) return api.reply(request, env, { error: "community_forbidden" }, 403);
    if (method === "GET") {
      if (!community.cover_bytes) return api.reply(request, env, { error: "photo_not_found" }, 404);
      return api.binaryReply(request, env, community.cover_bytes, community.cover_content_type, "private, no-store");
    }
    if (method === "PUT") {
      const auth = await api.authenticated(request, env);
      if (auth.response) return auth.response;
      if (!activeAccess(community, auth.user)?.canManage) return api.reply(request, env, { error: "forbidden" }, 403);
      const image = await api.readImageBody(request);
      if (image.error) return api.reply(request, env, { error: image.error }, image.status);
      await env.DB.prepare("UPDATE communities SET cover_bytes=?,cover_content_type=?,updated_at=? WHERE id=?")
        .bind(image.bytes, image.contentType, api.now(), community.id).run();
      await audit(env, community.id, auth.user.id, "cover_updated", "community", community.id);
      return api.reply(request, env, { cover_uploaded: true });
    }
  }

  match = /^\/api\/communities\/([\w-]{36})\/join$/.exec(path);
  if (match && ["POST", "DELETE"].includes(method)) {
    const auth = await api.authenticated(request, env);
    if (auth.response) return auth.response;
    const community = await loadCommunity(env, match[1], auth.user.id);
    if (!community || community.status !== "active") return api.reply(request, env, { error: "community_unavailable" }, 404);
    const now = api.now();
    if (method === "DELETE") {
      if (community.viewer_role === "owner") return api.reply(request, env, { error: "owner_cannot_leave" }, 409);
      await env.DB.prepare("DELETE FROM community_group_members WHERE community_id=? AND user_id=?").bind(community.id, auth.user.id).run();
      await audit(env, community.id, auth.user.id, "member_left", "member", auth.user.id);
      return api.reply(request, env, { joined: false, membership_status: "" });
    }
    if (!await api.rateLimit(request, env, `community-join:${community.id}`, 20)) return api.reply(request, env, { error: "rate_limited" }, 429);
    if (community.viewer_status === "active") return api.reply(request, env, { joined: true, membership_status: "active" });
    const status = community.visibility === "private" ? "pending" : "active";
    if (community.viewer_status === "pending" && status === "pending") return api.reply(request, env, { joined: false, membership_status: "pending" });
    await env.DB.prepare(`INSERT INTO community_group_members(community_id,user_id,role,status,joined_at,updated_at)
      VALUES(?,?,'member',?,?,?) ON CONFLICT(community_id,user_id) DO UPDATE SET status=excluded.status,updated_at=excluded.updated_at`)
      .bind(community.id, auth.user.id, status, now, now).run();
    await audit(env, community.id, auth.user.id, status === "pending" ? "join_requested" : "member_joined", "member", auth.user.id);
    if (status === "pending") await notifyModerators(env, api, community.id, community.owner_user_id,
      "Community join request", `${auth.user.email} asked to join ${community.name}.`, "community", community.id);
    return api.reply(request, env, { joined: status === "active", membership_status: status }, 201);
  }

  match = /^\/api\/communities\/([\w-]{36})\/members$/.exec(path);
  if (match && method === "GET") {
    const community = await loadCommunity(env, match[1], user?.id);
    if (!community || !accessFor(community, user).visible) return api.reply(request, env, { error: "community_forbidden" }, 403);
    const rows = await env.DB.prepare(`SELECT m.user_id,m.role,m.joined_at,COALESCE(NULLIF(msp.display_name,''),NULLIF(pp.display_name,''),'Member') AS display_name
      FROM community_group_members m JOIN users u ON u.id=m.user_id
      LEFT JOIN member_sports_profiles msp ON msp.user_id=m.user_id
      LEFT JOIN provider_profiles pp ON pp.user_id=m.user_id
      WHERE m.community_id=? AND m.status='active' ORDER BY m.joined_at LIMIT 100`).bind(community.id).all();
    return api.reply(request, env, { members: rows.results || [], member_count: Number(community.member_count || 0) });
  }

  match = /^\/api\/communities\/([\w-]{36})\/members\/([\w-]{36})\/moderator$/.exec(path);
  if (match && method === "POST") {
    const auth = await api.authenticated(request, env);
    if (auth.response) return auth.response;
    const community = await loadCommunity(env, match[1], auth.user.id);
    if (!community || community.viewer_role !== "owner" || !activeAccess(community, auth.user)) return api.reply(request, env, { error: "forbidden" }, 403);
    const body = await api.readJson(request);
    const role = body?.role === "moderator" ? "moderator" : "member";
    await env.DB.prepare("UPDATE community_group_members SET role=?,updated_at=? WHERE community_id=? AND user_id=? AND status='active' AND role<>'owner'")
      .bind(role, api.now(), community.id, match[2]).run();
    await audit(env, community.id, auth.user.id, role === "moderator" ? "moderator_added" : "moderator_removed", "member", match[2]);
    return api.reply(request, env, { updated: true, role });
  }

  match = /^\/api\/communities\/([\w-]{36})\/members\/([\w-]{36})$/.exec(path);
  if (match && method === "PATCH") {
    const auth = await api.authenticated(request, env);
    if (auth.response) return auth.response;
    const community = await loadCommunity(env, match[1], auth.user.id);
    if (!community || !activeAccess(community, auth.user)?.canManage) return api.reply(request, env, { error: "forbidden" }, 403);
    const body = await api.readJson(request), decision = body?.status;
    if (!["active", "rejected"].includes(decision)) return api.reply(request, env, { error: "invalid_decision" }, 400);
    const now = api.now();
    if (decision === "rejected") await env.DB.prepare("DELETE FROM community_group_members WHERE community_id=? AND user_id=? AND status='pending'").bind(community.id, match[2]).run();
    else await env.DB.prepare("UPDATE community_group_members SET status='active',updated_at=? WHERE community_id=? AND user_id=? AND status='pending'").bind(now, community.id, match[2]).run();
    await audit(env, community.id, auth.user.id, decision === "active" ? "join_approved" : "join_rejected", "member", match[2]);
    await notifyUser(env, api, community.id, match[2], "activity", "community_membership", decision === "active" ? "Community request approved" : "Community request declined",
      community.name, "community", community.id);
    return api.reply(request, env, { updated: true, status: decision });
  }

  match = /^\/api\/communities\/([\w-]{36})\/notifications$/.exec(path);
  if (match && ["GET", "PATCH"].includes(method)) {
    const auth = await api.authenticated(request, env);
    if (auth.response) return auth.response;
    const community = await loadCommunity(env, match[1], auth.user.id);
    if (!community || !activeAccess(community, auth.user)?.isMember) return api.reply(request, env, { error: "forbidden" }, 403);
    if (method === "PATCH") {
      const body = await api.readJson(request), now = api.now();
      const markRead = body?.mark_read === true ? now : null;
      const muted = typeof body?.muted === "boolean" ? Number(body.muted) : null;
      const activity = typeof body?.activity_enabled === "boolean" ? Number(body.activity_enabled) : null;
      const events = typeof body?.event_reminders === "boolean" ? Number(body.event_reminders) : null;
      await env.DB.prepare(`INSERT OR IGNORE INTO community_message_reads
        (community_id,user_id,last_read_at,muted,activity_enabled,event_reminders,updated_at)
        VALUES(?,?,NULL,0,1,1,?)`).bind(community.id, auth.user.id, now).run();
      await env.DB.prepare(`UPDATE community_message_reads SET
        last_read_at=COALESCE(?,last_read_at),
        muted=CASE WHEN ? IS NULL THEN muted ELSE ? END,
        activity_enabled=CASE WHEN ? IS NULL THEN activity_enabled ELSE ? END,
        event_reminders=CASE WHEN ? IS NULL THEN event_reminders ELSE ? END,updated_at=?
        WHERE community_id=? AND user_id=?`)
        .bind(markRead, muted, muted, activity, activity, events, events, now, community.id, auth.user.id).run();
    }
    const prefs = await env.DB.prepare("SELECT muted,activity_enabled,event_reminders,last_read_at FROM community_message_reads WHERE community_id=? AND user_id=?").bind(community.id, auth.user.id).first();
    const unread = await env.DB.prepare("SELECT COUNT(*) AS count FROM community_messages WHERE community_id=? AND status='published' AND created_at>? AND sender_user_id<>?")
      .bind(community.id, prefs?.last_read_at || "", auth.user.id).first();
    return api.reply(request, env, {
      notifications: {
        muted: Boolean(prefs?.muted), activity_enabled: prefs?.activity_enabled !== 0,
        event_reminders: prefs?.event_reminders !== 0, last_read_at: prefs?.last_read_at || "",
        unread_messages: Number(unread?.count || 0),
      },
    });
  }

  match = /^\/api\/communities\/([\w-]{36})\/posts$/.exec(path);
  if (match && ["GET", "POST"].includes(method)) {
    const community = await loadCommunity(env, match[1], user?.id);
    if (!community) return api.reply(request, env, { error: "community_not_found" }, 404);
    const access = accessFor(community, user);
    if (!access.visible) return api.reply(request, env, { error: "community_forbidden" }, 403);
    if (method === "GET") {
      const limit = Math.min(60, Math.max(1, Number(url.searchParams.get("limit")) || 24));
      const rows = await env.DB.prepare(`${api.postSelect} WHERE p.community_id=? AND (?=1 OR p.status='published')
        ORDER BY COALESCE(p.published_at,p.created_at) DESC LIMIT ?`).bind(community.id, access.canManage ? 1 : 0, limit).all();
      return api.reply(request, env, { posts: await api.enrichPosts(env, rows.results || [], user?.id || "") });
    }
    const auth = await api.authenticated(request, env);
    if (auth.response) return auth.response;
    const memberAccess = activeAccess(community, auth.user);
    if (!memberAccess?.canPost) return api.reply(request, env, { error: "membership_required" }, 403);
    if (!await api.rateLimit(request, env, `community-post:${community.id}`, 20)) return api.reply(request, env, { error: "rate_limited" }, 429);
    const body = await api.readJson(request);
    if (["event", "group_session"].includes(body?.kind) && !memberAccess.canManage) {
      return api.reply(request, env, { error: "moderator_required" }, 403);
    }
    const result = await createPostRecord(env, api, auth.user, community, body || {});
    return result.error ? api.reply(request, env, { error: result.error }, result.status) : api.reply(request, env, result, 201);
  }

  match = /^\/api\/communities\/([\w-]{36})\/posts\/([\w-]{36})\/rsvp$/.exec(path);
  if (match && ["POST", "DELETE"].includes(method)) {
    const auth = await api.authenticated(request, env);
    if (auth.response) return auth.response;
    const community = await loadCommunity(env, match[1], auth.user.id);
    if (!community || !activeAccess(community, auth.user)?.isMember) return api.reply(request, env, { error: "membership_required" }, 403);
    const post = await postForCommunity(env, community.id, match[2]);
    if (!post || !["event", "group_session"].includes(post.kind) || post.status !== "published" || post.cancelled_at) {
      return api.reply(request, env, { error: "event_not_found" }, 404);
    }
    if (method === "POST") {
      const body = await api.readJson(request), response = body?.response === "interested" ? "interested" : "going";
      const previous = await env.DB.prepare("SELECT response FROM community_rsvps WHERE post_id=? AND user_id=?")
        .bind(post.id, auth.user.id).first();
      if (response === "going" && previous?.response !== "going" && post.capacity != null) {
        const count = await env.DB.prepare("SELECT COUNT(*) AS count FROM community_rsvps WHERE post_id=? AND response='going'").bind(post.id).first();
        if (Number(count?.count || 0) >= Number(post.capacity)) return api.reply(request, env, { error: "event_full" }, 409);
      }
      await env.DB.prepare(`INSERT INTO community_rsvps(post_id,user_id,response,created_at) VALUES(?,?,?,?)
        ON CONFLICT(post_id,user_id) DO UPDATE SET response=excluded.response`)
        .bind(post.id, auth.user.id, response, api.now()).run();
      if (response === "going" && post.author_user_id !== auth.user.id) {
        await notifyUser(env, api, community.id, post.author_user_id, "events", "event_rsvp",
          "New event RSVP", `${post.title || post.body || "A member"} – going`, "community_post", post.id);
      }
      return api.reply(request, env, { rsvp: response });
    }
    await env.DB.prepare("DELETE FROM community_rsvps WHERE post_id=? AND user_id=?").bind(post.id, auth.user.id).run();
    return api.reply(request, env, { rsvp: "" });
  }

  match = /^\/api\/communities\/([\w-]{36})\/posts\/([\w-]{36})$/.exec(path);
  if (match && ["GET", "PATCH", "DELETE"].includes(method)) {
    const auth = await api.authenticated(request, env);
    if (auth.response) return auth.response;
    const state = await requirePostAccess(env, api, request, match[1], match[2]);
    if (state.response) return state.response;
    const post = state.post;
    if (method === "GET") return api.reply(request, env, { post: (await api.enrichPosts(env, [post], auth.user.id))[0] });
    const author = post.author_user_id === auth.user.id;
    if (!author && !state.access.canManage) return api.reply(request, env, { error: "forbidden" }, 403);
    if (method === "DELETE") {
      await env.DB.prepare("UPDATE community_posts SET status='hidden',cancelled_at=COALESCE(cancelled_at,?),updated_at=? WHERE id=?")
        .bind(api.now(), api.now(), post.id).run();
      await audit(env, state.community.id, auth.user.id, "post_hidden", "community_post", post.id);
      if (["event", "group_session"].includes(post.kind)) {
        await notifyMembers(env, api, state.community.id, auth.user.id, "events", "event_cancelled",
          "Community event cancelled", post.title || post.body.slice(0, 120), "community_post", post.id);
      }
      return api.reply(request, env, { hidden: true });
    }
    const body = await api.readJson(request);
    const content = api.text(body?.body, 4000);
    if (!content) return api.reply(request, env, { error: "post_body_required" }, 400);
    const series = body?.scope === "series" && post.series_id
      ? (await env.DB.prepare("SELECT id FROM community_posts WHERE series_id=?").bind(post.series_id).all()).results || []
      : [post];
    for (const item of series) {
      if (body?.cancel === true) {
        await env.DB.prepare("UPDATE community_posts SET cancelled_at=?,updated_at=? WHERE id=?").bind(api.now(), api.now(), item.id).run();
        await audit(env, state.community.id, auth.user.id, "event_cancelled", "community_post", item.id);
        await notifyMembers(env, api, state.community.id, auth.user.id, "events", "event_cancelled",
          "Community event cancelled", item.title || item.body.slice(0, 120), "community_post", item.id);
        continue;
      }
      await env.DB.prepare(`UPDATE community_posts SET body=?,title=?,sport=?,language=?,cancelled_at=?,edited_at=?,updated_at=? WHERE id=?`)
        .bind(content, api.text(body?.title, 140) || item.title, sportValue(body?.sport, state.community, api),
          body?.language === "ar" ? "ar" : item.language,
          body?.cancelled === true ? api.now() : item.cancelled_at, api.now(), api.now(), item.id).run();
    }
    await audit(env, state.community.id, auth.user.id, "post_updated", "community_post", post.id, { scope: body?.scope || "single" });
    return api.reply(request, env, { updated: true, count: series.length });
  }

  match = /^\/api\/communities\/([\w-]{36})\/posts\/([\w-]{36})\/comments\/([\w-]{36})$/.exec(path);
  if (match && ["GET", "DELETE"].includes(method)) {
    const auth = await api.authenticated(request, env);
    if (auth.response) return auth.response;
    const state = await requirePostAccess(env, api, request, match[1], match[2]);
    if (state.response) return state.response;
    const comment = await env.DB.prepare("SELECT * FROM community_comments WHERE id=? AND post_id=?").bind(match[3], state.post.id).first();
    if (!comment) return api.reply(request, env, { error: "comment_not_found" }, 404);
    if (method === "GET") return api.reply(request, env, { comment });
    if (comment.user_id !== auth.user.id && !state.access.canManage) return api.reply(request, env, { error: "forbidden" }, 403);
    await env.DB.prepare("UPDATE community_comments SET status='hidden',updated_at=? WHERE id=?").bind(api.now(), comment.id).run();
    await audit(env, state.community.id, auth.user.id, "comment_hidden", "community_comment", comment.id);
    return api.reply(request, env, { hidden: true });
  }

  match = /^\/api\/communities\/([\w-]{36})\/events$/.exec(path);
  if (match && method === "GET") {
    const community = await loadCommunity(env, match[1], user?.id);
    if (!community || !accessFor(community, user).visible) return api.reply(request, env, { error: "community_forbidden" }, 403);
    const rows = await env.DB.prepare(`${api.postSelect} WHERE p.community_id=? AND p.kind IN ('event','group_session')
      AND p.status='published' AND p.cancelled_at IS NULL AND p.starts_at>=? ORDER BY p.starts_at LIMIT 60`)
      .bind(community.id, api.now()).all();
    return api.reply(request, env, { events: await api.enrichPosts(env, rows.results || [], user?.id || "") });
  }

  match = /^\/api\/communities\/([\w-]{36})\/events\/series\/([\w-]{36})\/cancel$/.exec(path);
  if (match && method === "POST") {
    const auth = await api.authenticated(request, env);
    if (auth.response) return auth.response;
    const community = await loadCommunity(env, match[1], auth.user.id);
    if (!community) return api.reply(request, env, { error: "community_not_found" }, 404);
    const access = activeAccess(community, auth.user);
    if (!access) return api.reply(request, env, { error: "community_unavailable" }, 404);
    const rows = await env.DB.prepare("SELECT id,author_user_id,title,body FROM community_posts WHERE series_id=? AND community_id=?").bind(match[2], community.id).all();
    if (!(rows.results || []).length) return api.reply(request, env, { error: "series_not_found" }, 404);
    if (!access.canManage && !(rows.results || []).every((row) => row.author_user_id === auth.user.id)) return api.reply(request, env, { error: "forbidden" }, 403);
    const now = api.now();
    await env.DB.prepare("UPDATE community_posts SET cancelled_at=?,updated_at=? WHERE series_id=? AND community_id=? AND cancelled_at IS NULL")
      .bind(now, now, match[2], community.id).run();
    await audit(env, community.id, auth.user.id, "series_cancelled", "community_post", match[2]);
    await notifyMembers(env, api, community.id, auth.user.id, "events", "event_cancelled",
      "Recurring event cancelled", rows.results[0]?.title || rows.results[0]?.body?.slice(0, 120) || community.name,
      "community_post", match[2]);
    return api.reply(request, env, { cancelled: true });
  }

  match = /^\/api\/communities\/([\w-]{36})\/messages$/.exec(path);
  if (match && ["GET", "POST"].includes(method)) {
    const auth = await api.authenticated(request, env);
    if (auth.response) return auth.response;
    const community = await loadCommunity(env, match[1], auth.user.id);
    if (!community || !activeAccess(community, auth.user)?.isMember) return api.reply(request, env, { error: "membership_required" }, 403);
    if (method === "GET") {
      const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit")) || 30));
      const since = api.text(url.searchParams.get("since"), 40);
      const before = api.text(url.searchParams.get("before"), 40);
      const rows = since
        ? await env.DB.prepare(`SELECT m.*,COALESCE(NULLIF(msp.display_name,''),NULLIF(pp.display_name,''),'Member') AS sender_name
            FROM community_messages m JOIN users u ON u.id=m.sender_user_id
            LEFT JOIN member_sports_profiles msp ON msp.user_id=m.sender_user_id
            LEFT JOIN provider_profiles pp ON pp.user_id=m.sender_user_id
            WHERE m.community_id=? AND m.status='published' AND m.created_at>? ORDER BY m.created_at ASC LIMIT ?`).bind(community.id, since, limit).all()
        : await env.DB.prepare(`SELECT m.*,COALESCE(NULLIF(msp.display_name,''),NULLIF(pp.display_name,''),'Member') AS sender_name
            FROM community_messages m JOIN users u ON u.id=m.sender_user_id
            LEFT JOIN member_sports_profiles msp ON msp.user_id=m.sender_user_id
            LEFT JOIN provider_profiles pp ON pp.user_id=m.sender_user_id
            WHERE m.community_id=? AND m.status='published' AND (?='' OR m.created_at<?)
            ORDER BY m.created_at DESC LIMIT ?`).bind(community.id, before, before || "9999-12-31", limit).all();
      const messages = (rows.results || []).map((row) => ({
        id: row.id, sender_user_id: row.sender_user_id, sender_name: row.sender_name,
        body: row.body, has_photo: Boolean(row.photo_bytes), created_at: row.created_at, edited_at: row.edited_at || "",
      })).sort((a, b) => a.created_at.localeCompare(b.created_at));
      return api.reply(request, env, { messages, next_cursor: messages[0]?.created_at || "", server_time: api.now() });
    }
    if (!await api.rateLimit(request, env, `community-chat:${community.id}`, 30)) return api.reply(request, env, { error: "rate_limited" }, 429);
    const body = await api.readJson(request);
    const message = api.text(body?.body, MAX_CHAT_MESSAGE_LENGTH);
    if (!message) return api.reply(request, env, { error: "message_required" }, 400);
    const id = api.randomId(), now = api.now();
    await env.DB.prepare("INSERT INTO community_messages(id,community_id,sender_user_id,body,created_at) VALUES(?,?,?,?,?)")
      .bind(id, community.id, auth.user.id, message, now).run();
    await notifyMembers(env, api, community.id, auth.user.id, "activity", "community_message",
      "New community message", `${community.name}: ${message.slice(0, 120)}`, "community_message", id);
    return api.reply(request, env, { id, created_at: now }, 201);
  }

  match = /^\/api\/communities\/([\w-]{36})\/messages\/photo$/.exec(path);
  if (match && method === "POST") {
    const auth = await api.authenticated(request, env);
    if (auth.response) return auth.response;
    const community = await loadCommunity(env, match[1], auth.user.id);
    if (!community || !activeAccess(community, auth.user)?.isMember) return api.reply(request, env, { error: "membership_required" }, 403);
    if (!await api.rateLimit(request, env, `community-chat:${community.id}`, 30)) return api.reply(request, env, { error: "rate_limited" }, 429);
    const image = await api.readImageBody(request);
    if (image.error) return api.reply(request, env, { error: image.error }, image.status);
    const id = api.randomId(), now = api.now();
    await env.DB.prepare("INSERT INTO community_messages(id,community_id,sender_user_id,body,photo_bytes,photo_content_type,created_at) VALUES(?,?,?,'',?,?,?)")
      .bind(id, community.id, auth.user.id, image.bytes, image.contentType, now).run();
    await notifyMembers(env, api, community.id, auth.user.id, "activity", "community_message",
      "New community photo", `${community.name}: photo`, "community_message", id);
    return api.reply(request, env, { id, created_at: now, has_photo: true }, 201);
  }

  match = /^\/api\/communities\/([\w-]{36})\/messages\/([\w-]{36})(?:\/(photo))?$/.exec(path);
  if (match && ["GET", "PUT", "DELETE"].includes(method)) {
    const auth = await api.authenticated(request, env);
    if (auth.response) return auth.response;
    const community = await loadCommunity(env, match[1], auth.user.id);
    if (!community || !activeAccess(community, auth.user)?.isMember) return api.reply(request, env, { error: "membership_required" }, 403);
    const message = await env.DB.prepare("SELECT * FROM community_messages WHERE id=? AND community_id=?").bind(match[2], community.id).first();
    if (!message) return api.reply(request, env, { error: "message_not_found" }, 404);
    const canModify = message.sender_user_id === auth.user.id || accessFor(community, auth.user).canManage;
    if (match[3] === "photo" && method === "GET") {
      if (message.status !== "published" && !accessFor(community, auth.user).canManage) return api.reply(request, env, { error: "message_not_found" }, 404);
      if (!message.photo_bytes) return api.reply(request, env, { error: "photo_not_found" }, 404);
      return api.binaryReply(request, env, message.photo_bytes, message.photo_content_type, "private, no-store");
    }
    if (match[3] === "photo" && method === "PUT") {
      if (!canModify) return api.reply(request, env, { error: "forbidden" }, 403);
      const image = await api.readImageBody(request);
      if (image.error) return api.reply(request, env, { error: image.error }, image.status);
      await env.DB.prepare("UPDATE community_messages SET photo_bytes=?,photo_content_type=?,edited_at=? WHERE id=?")
        .bind(image.bytes, image.contentType, api.now(), message.id).run();
      return api.reply(request, env, { photo_uploaded: true });
    }
    if (method === "DELETE") {
      if (!canModify) return api.reply(request, env, { error: "forbidden" }, 403);
      await env.DB.prepare("UPDATE community_messages SET status='hidden',edited_at=? WHERE id=?").bind(api.now(), message.id).run();
      await audit(env, community.id, auth.user.id, "message_hidden", "community_message", message.id);
      return api.reply(request, env, { hidden: true });
    }
  }

  if (path === "/api/community/reports" && method === "POST") {
    const auth = await api.authenticated(request, env);
    if (auth.response) return auth.response;
    if (!await api.rateLimitScoped(env, `community-report:${auth.user.id}`, 10, 60)) return api.reply(request, env, { error: "rate_limited" }, 429);
    const body = await api.readJson(request);
    const communityId = api.text(body?.community_id, 36), entityType = api.text(body?.entity_type, 20), entityId = api.text(body?.entity_id, 36);
    const reason = api.text(body?.reason, 20);
    if (!REPORT_REASONS.includes(reason) || !["community", "post", "comment", "message"].includes(entityType)) return api.reply(request, env, { error: "invalid_report" }, 400);
    const community = await loadCommunity(env, communityId, auth.user.id);
    if (!community || !accessFor(community, auth.user).visible) return api.reply(request, env, { error: "community_forbidden" }, 403);
    const exists = entityType === "community" ? entityId === communityId
      : entityType === "post" ? Boolean(await env.DB.prepare("SELECT id FROM community_posts WHERE id=? AND community_id=?").bind(entityId, communityId).first())
        : entityType === "comment" ? Boolean(await env.DB.prepare("SELECT c.id FROM community_comments c JOIN community_posts p ON p.id=c.post_id WHERE c.id=? AND p.community_id=?").bind(entityId, communityId).first())
          : Boolean(await env.DB.prepare("SELECT id FROM community_messages WHERE id=? AND community_id=?").bind(entityId, communityId).first());
    if (!exists) return api.reply(request, env, { error: "entity_not_found" }, 404);
    if (await env.DB.prepare("SELECT id FROM community_reports WHERE reporter_user_id=? AND entity_type=? AND entity_id=?").bind(auth.user.id, entityType, entityId).first()) {
      return api.reply(request, env, { error: "already_reported" }, 409);
    }
    const id = api.randomId(), now = api.now();
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO community_reports(id,community_id,reporter_user_id,entity_type,entity_id,reason,details,status,created_at)
        VALUES(?,?,?,?,?,?,?,'open',?)`).bind(id, communityId, auth.user.id, entityType, entityId, reason, api.text(body?.details, 1000), now),
      env.DB.prepare(`INSERT INTO community_audit(id,community_id,actor_user_id,action,entity_type,entity_id,created_at)
        VALUES(?,?,?,'content_reported',?,?,?)`).bind(api.randomId(), communityId, auth.user.id, entityType, entityId, now),
    ]);
    await notifyModerators(env, api, communityId, community.owner_user_id, "Community report", `A ${entityType} was reported for ${reason}.`, entityType, entityId);
    return api.reply(request, env, { id, status: "open" }, 201);
  }

  if (path === "/api/me/community" && method === "GET") {
    if (!user) return api.reply(request, env, { error: "unauthorized" }, 401);
    const rows = await env.DB.prepare(`SELECT c.id,c.name,c.sport,c.visibility,c.status,m.role,m.joined_at,
      (SELECT COUNT(*) FROM community_group_members x WHERE x.community_id=c.id AND x.status='active') AS member_count
      FROM community_group_members m JOIN communities c ON c.id=m.community_id
      WHERE m.user_id=? AND m.status='active' ORDER BY m.joined_at DESC LIMIT 100`).bind(user.id).all();
    const profile = await api.coachProfileForUser(env, user.id);
    return api.reply(request, env, {
      user_id: user.id,
      communities: rows.results || [],
      can_create_event: Boolean(profile && profile.status === "approved" && profile.provider_type === "coach"),
      coach_profile_id: profile?.id || "",
    });
  }

  if (path === "/api/me/community/events" && method === "GET") {
    if (!user) return api.reply(request, env, { error: "unauthorized" }, 401);
    const rows = await env.DB.prepare(`${api.postSelect} WHERE p.author_user_id=? AND p.kind IN ('event','group_session')
      ORDER BY p.starts_at DESC LIMIT 100`).bind(user.id).all();
    return api.reply(request, env, { events: await api.enrichPosts(env, rows.results || [], user.id) });
  }

  if (path === "/api/me/community/posts" && method === "POST") {
    const auth = await api.authenticated(request, env);
    if (auth.response) return auth.response;
    const body = await api.readJson(request);
    const community = await loadCommunity(env, api.text(body?.community_id, 36), auth.user.id);
    if (!community || !activeAccess(community, auth.user)?.canPost) return api.reply(request, env, { error: "membership_required" }, 403);
    const result = await createPostRecord(env, api, auth.user, community, body || {});
    return result.error ? api.reply(request, env, { error: result.error }, result.status) : api.reply(request, env, result, 201);
  }

  if (path === "/api/me/community/events" && method === "POST") {
    const auth = await api.authenticated(request, env);
    if (auth.response) return auth.response;
    const profile = await api.coachProfileForUser(env, auth.user.id);
    if (!profile || profile.status !== "approved" || profile.provider_type !== "coach") return api.reply(request, env, { error: "approved_coach_required" }, 403);
    const body = await api.readJson(request);
    const communityId = api.text(body?.community_id, 36);
    const community = communityId ? await loadCommunity(env, communityId, auth.user.id) : null;
    if (communityId && (!community || !activeAccess(community, auth.user)?.canPost)) return api.reply(request, env, { error: "membership_required" }, 403);
    if (!await api.rateLimit(request, env, "coach-event-create", 20)) return api.reply(request, env, { error: "rate_limited" }, 429);
    const result = await createPostRecord(env, api, auth.user, community, { ...body, kind: body?.kind || "group_session", organizer_profile_id: profile.id });
    return result.error ? api.reply(request, env, { error: result.error }, result.status) : api.reply(request, env, result, 201);
  }

  match = /^\/api\/me\/community\/events\/([\w-]{36})$/.exec(path);
  if (match && ["PATCH", "DELETE"].includes(method)) {
    const auth = await api.authenticated(request, env);
    if (auth.response) return auth.response;
    const post = await env.DB.prepare("SELECT * FROM community_posts WHERE id=? AND author_user_id=?").bind(match[1], auth.user.id).first();
    if (!post || !["event", "group_session"].includes(post.kind)) return api.reply(request, env, { error: "event_not_found" }, 404);
    if (post.community_id) {
      const community = await loadCommunity(env, post.community_id, auth.user.id);
      if (!community || !activeAccess(community, auth.user)) return api.reply(request, env, { error: "community_unavailable" }, 404);
    }
    const now = api.now();
    if (method === "DELETE") await env.DB.prepare("UPDATE community_posts SET cancelled_at=?,updated_at=? WHERE id=?").bind(now, now, post.id).run();
    else {
      const body = await api.readJson(request);
      await env.DB.prepare("UPDATE community_posts SET cancelled_at=?,updated_at=? WHERE id=?")
        .bind(body?.cancelled === false ? null : now, now, post.id).run();
    }
    if (post.community_id) await audit(env, post.community_id, auth.user.id, method === "DELETE" ? "event_cancelled" : "event_updated", "community_post", post.id);
    return api.reply(request, env, { updated: true });
  }

  match = /^\/api\/providers\/([\w-]{36})\/community$/.exec(path);
  if (match && method === "GET") {
    const profile = await env.DB.prepare("SELECT id,user_id,status FROM provider_profiles WHERE id=? AND status='approved'").bind(match[1]).first();
    if (!profile) return api.reply(request, env, { error: "provider_unavailable" }, 404);
    const now = api.now();
    const [events, posts] = await Promise.all([
      env.DB.prepare(`${api.postSelect} WHERE p.author_user_id=? AND p.kind IN ('event','group_session') AND p.status='published'
        AND p.visibility='public' AND p.cancelled_at IS NULL AND p.starts_at>=?
        AND (p.community_id IS NULL OR EXISTS(SELECT 1 FROM communities c WHERE c.id=p.community_id AND c.status='active' AND c.visibility='public'))
        ORDER BY p.starts_at LIMIT 20`).bind(profile.user_id, now).all(),
      env.DB.prepare(`${api.postSelect} WHERE p.author_user_id=? AND p.status='published' AND p.visibility='public'
        AND EXISTS(SELECT 1 FROM communities c WHERE c.id=p.community_id AND c.status='active' AND c.visibility='public')
        ORDER BY COALESCE(p.published_at,p.created_at) DESC LIMIT 12`).bind(profile.user_id).all(),
    ]);
    return api.reply(request, env, {
      events: await api.enrichPosts(env, events.results || [], user?.id || ""),
      posts: await api.enrichPosts(env, posts.results || [], user?.id || ""),
    });
  }

  if (path === "/api/admin/communities" && method === "GET") {
    const q = api.text(url.searchParams.get("q"), 100);
    const requested = api.text(url.searchParams.get("status"), 20);
    const status = ["active", "suspended", "removed"].includes(requested) ? requested : "";
    const rows = await env.DB.prepare(`SELECT c.*,
      (SELECT COUNT(*) FROM community_group_members m WHERE m.community_id=c.id AND m.status='active') AS member_count,
      (SELECT COUNT(*) FROM community_reports r WHERE r.community_id=c.id AND r.status='open') AS open_reports
      FROM communities c WHERE (?='' OR c.name LIKE ? OR c.sport LIKE ? OR c.location LIKE ?)
      AND (?='' OR c.status=?) ORDER BY c.created_at DESC LIMIT 100`)
      .bind(q, `%${q}%`, `%${q}%`, `%${q}%`, status, status).all();
    return api.reply(request, env, { communities: rows.results || [] });
  }

  match = /^\/api\/admin\/communities\/([\w-]{36})$/.exec(path);
  if (match && method === "PATCH") {
    const auth = await api.authenticated(request, env);
    if (auth.response) return auth.response;
    const body = await api.readJson(request), status = body?.status;
    if (!["active", "suspended", "removed"].includes(status)) return api.reply(request, env, { error: "invalid_status" }, 400);
    if (status === "removed" && auth.user.role !== "admin") return api.reply(request, env, { error: "admin_required" }, 403);
    const community = await loadCommunity(env, match[1], auth.user.id);
    if (!community) return api.reply(request, env, { error: "community_not_found" }, 404);
    await env.DB.prepare("UPDATE communities SET status=?,updated_at=? WHERE id=?").bind(status, api.now(), community.id).run();
    const action = status === "active" ? "community_restored" : status === "removed" ? "community_removed" : "community_suspended";
    await audit(env, community.id, auth.user.id, action, "community", community.id, { reason: api.text(body?.reason, 500) });
    return api.reply(request, env, { updated: true, status });
  }

  match = /^\/api\/admin\/communities\/([\w-]{36})\/audit$/.exec(path);
  if (match && method === "GET") {
    const rows = await env.DB.prepare("SELECT * FROM community_audit WHERE community_id=? ORDER BY created_at DESC LIMIT 100").bind(match[1]).all();
    return api.reply(request, env, { audit: rows.results || [] });
  }

  if (path === "/api/admin/community/reports" && method === "GET") {
    const status = ["open", "reviewed", "dismissed", "actioned"].includes(url.searchParams.get("status")) ? url.searchParams.get("status") : "";
    const rows = await env.DB.prepare(`SELECT r.*,c.name AS community_name,u.email AS reporter_email
      FROM community_reports r JOIN communities c ON c.id=r.community_id JOIN users u ON u.id=r.reporter_user_id
      WHERE (?='' OR r.status=?) ORDER BY r.created_at DESC LIMIT 100`).bind(status, status).all();
    return api.reply(request, env, { reports: rows.results || [] });
  }

  match = /^\/api\/admin\/community\/reports\/([\w-]{36})$/.exec(path);
  if (match && method === "PATCH") {
    const auth = await api.authenticated(request, env);
    if (auth.response) return auth.response;
    const body = await api.readJson(request), status = body?.status;
    if (!["reviewed", "dismissed", "actioned"].includes(status)) return api.reply(request, env, { error: "invalid_status" }, 400);
    const report = await env.DB.prepare("SELECT * FROM community_reports WHERE id=?").bind(match[1]).first();
    if (!report) return api.reply(request, env, { error: "report_not_found" }, 404);
    const now = api.now();
    if (status === "actioned") {
      if (report.entity_type === "post") await env.DB.prepare("UPDATE community_posts SET status='hidden',updated_at=? WHERE id=?").bind(now, report.entity_id).run();
      if (report.entity_type === "comment") await env.DB.prepare("UPDATE community_comments SET status='hidden',updated_at=? WHERE id=?").bind(now, report.entity_id).run();
      if (report.entity_type === "message") await env.DB.prepare("UPDATE community_messages SET status='hidden',edited_at=? WHERE id=?").bind(now, report.entity_id).run();
      if (report.entity_type === "community") await env.DB.prepare("UPDATE communities SET status='suspended',updated_at=? WHERE id=?").bind(now, report.entity_id).run();
    }
    await env.DB.batch([
      env.DB.prepare("UPDATE community_reports SET status=?,reviewed_by=?,reviewed_at=? WHERE id=?").bind(status, auth.user.id, now, report.id),
      env.DB.prepare(`INSERT INTO community_audit(id,community_id,actor_user_id,action,entity_type,entity_id,details_json,created_at)
        VALUES(?,?,?,'report_reviewed','community_report',?,?,?)`).bind(api.randomId(), report.community_id, auth.user.id, report.id, JSON.stringify({ status }), now),
    ]);
    return api.reply(request, env, { updated: true, status });
  }

  match = /^\/api\/admin\/community\/messages\/([\w-]{36})$/.exec(path);
  if (match && method === "DELETE") {
    const auth = await api.authenticated(request, env);
    if (auth.response) return auth.response;
    const message = await env.DB.prepare("SELECT * FROM community_messages WHERE id=?").bind(match[1]).first();
    if (!message) return api.reply(request, env, { error: "message_not_found" }, 404);
    await env.DB.prepare("UPDATE community_messages SET status='hidden',edited_at=? WHERE id=?").bind(api.now(), message.id).run();
    await audit(env, message.community_id, auth.user.id, "message_hidden", "community_message", message.id);
    return api.reply(request, env, { hidden: true });
  }

  return null;
}
