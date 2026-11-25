// Private activity log: independent of public community posts and public media.
export async function handleActivityLog(request, env, url, api) {
  const path = url.pathname, method = request.method;
  const collection = path === "/api/me/activities";
  const coaches = path === "/api/me/activity-coaches";
  const item = /^\/api\/me\/activities\/([\w-]{36})$/.exec(path);
  if (!collection && !coaches && !item) return null;
  const auth = await api.authenticated(request, env);
  if (auth.response) return auth.response;
  const userId = auth.user.id;
  // Do not grant administrators an implicit bypass of an athlete's consent.
  const respond = (body, status = 200) => {
    const response = api.reply(request, env, body, status);
    response.headers.set("cache-control", "private, no-store");
    return response;
  };
  const allowedConnection = async id => {
    if (!id) return null;
    return env.DB.prepare(`SELECT c.id FROM coach_connections c
      JOIN provider_profiles p ON p.user_id=c.coach_user_id
      WHERE c.id=? AND c.athlete_user_id=? AND c.status='accepted'
      AND p.status='approved' AND p.provider_type='coach'`).bind(id, userId).first();
  };
  if (coaches && method === "GET") {
    const rows = await env.DB.prepare(`SELECT c.id,p.display_name FROM coach_connections c
      JOIN provider_profiles p ON p.user_id=c.coach_user_id
      WHERE c.athlete_user_id=? AND c.status='accepted' AND p.status='approved'
      AND p.provider_type='coach' ORDER BY p.display_name LIMIT 100`).bind(userId).all();
    return respond({ coaches: rows.results || [] });
  }
  if (collection && method === "GET") {
    const rows = await env.DB.prepare(`SELECT a.id,a.sport,a.activity_date,a.distance_km,a.duration_minutes,a.notes,
      a.created_at,a.updated_at,CASE WHEN a.owner_user_id=? THEN a.shared_connection_id ELSE NULL END AS shared_connection_id,
      CASE WHEN a.owner_user_id=? THEN 1 ELSE 0 END AS is_owner
      FROM athlete_activity_logs a WHERE a.owner_user_id=? OR EXISTS(
        SELECT 1 FROM coach_connections c JOIN provider_profiles p ON p.user_id=c.coach_user_id
        WHERE c.id=a.shared_connection_id AND c.athlete_user_id=a.owner_user_id
        AND c.coach_user_id=? AND c.status='accepted' AND p.status='approved' AND p.provider_type='coach')
      ORDER BY a.activity_date DESC,a.created_at DESC LIMIT 100`).bind(userId,userId,userId,userId).all();
    return respond({ activities: rows.results || [] });
  }
  if (collection && method === "POST") {
    const body = await api.readJson(request);
    const sport = api.text(body?.sport,40), date = api.text(body?.activity_date,10);
    const duration = body?.duration_minutes, distance = body?.distance_km ?? null;
    const notes = api.text(body?.notes,2000);
    if (!api.sports.includes(sport) || !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
        !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0,10) !== date ||
        !Number.isFinite(duration) || duration <= 0 || duration > 1440 ||
        (distance !== null && (!Number.isFinite(distance) || distance <= 0 || distance > 1000)) ||
        (body?.notes && !notes)) return respond({ error: "invalid_activity" },400);
    const connectionId = body?.shared_connection_id || null;
    if (connectionId !== null && (typeof connectionId !== "string" || !await allowedConnection(connectionId))) return respond({error:"coach_connection_required"},403);
    const id = api.randomId(), now = new Date().toISOString();
    await env.DB.prepare(`INSERT INTO athlete_activity_logs
      (id,owner_user_id,shared_connection_id,sport,activity_date,distance_km,duration_minutes,notes,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?)`).bind(id,userId,connectionId,sport,date,distance,duration,notes,now,now).run();
    return respond({id},201);
  }
  if (item && ["PATCH","DELETE"].includes(method)) {
    const owned = await env.DB.prepare("SELECT id FROM athlete_activity_logs WHERE id=? AND owner_user_id=?").bind(item[1],userId).first();
    if (!owned) return respond({error:"activity_not_found"},404);
    if (method === "DELETE") {
      await env.DB.prepare("DELETE FROM athlete_activity_logs WHERE id=? AND owner_user_id=?").bind(item[1],userId).run();
      return respond({deleted:true});
    }
    const body = await api.readJson(request);
    if (!body || !Object.hasOwn(body,"shared_connection_id")) return respond({error:"invalid_activity"},400);
    const connectionId = body.shared_connection_id;
    if (connectionId !== null && (typeof connectionId !== "string" || !await allowedConnection(connectionId))) return respond({error:"coach_connection_required"},403);
    await env.DB.prepare("UPDATE athlete_activity_logs SET shared_connection_id=?,updated_at=? WHERE id=? AND owner_user_id=?")
      .bind(connectionId,new Date().toISOString(),item[1],userId).run();
    return respond({updated:true});
  }
  return respond({error:"method_not_allowed"},405);
}
