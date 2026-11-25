const site = 'https://mzactive.com/community.html';
const dayMs = 86_400_000;
const idPattern = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const emailBudget = 60;
const eventAvailable = "p.kind IN ('event','group_session') AND p.status='published' AND p.visibility='public' AND p.cancelled_at IS NULL AND p.starts_at>? AND (p.community_id IS NULL OR EXISTS (SELECT 1 FROM communities c WHERE c.id=p.community_id AND c.status='active' AND c.visibility='public'))";

async function reserveEmail(env, api) {
  return api.rateLimitScoped(env, 'community-event-email-budget', emailBudget, 1440);
}

export async function handleCommunityEventAlerts(request, env, url, api, ctx) {
  const path = url.pathname;
  const announcement = /^\/api\/admin\/community\/events\/([0-9a-f-]{36})\/announce$/i.exec(path);
  const prefix = '/api/community/event-alerts';
  if (request.method !== 'POST' || (!announcement && ![prefix, prefix + '/confirm', prefix + '/unsubscribe'].includes(path))) return null;
  const reply = (body, status) => api.reply(request, env, body, status);
  const now = new Date().toISOString();

  if (announcement) {
    const auth = await api.authenticated(request, env);
    if (auth.response) return auth.response;
    if (!api.isSuperAdmin(auth.user)) return reply({ error: 'forbidden' }, 403);
    if (!api.emailDeliveryConfigured(env)) return reply({ error: 'email_unavailable' }, 503);
    const post = await env.DB.prepare("SELECT p.id,p.title,p.body,p.starts_at,p.location,p.community_id,p.series_id FROM community_posts p WHERE p.id=? AND " + eventAvailable)
      .bind(announcement[1], now).first();
    if (!post) return reply({ error: 'event_unavailable' }, 404);
    const eventKey = post.series_id || post.id;
    const [record, jobs] = await env.DB.batch([
      env.DB.prepare(`INSERT OR IGNORE INTO community_event_announcements(event_key,post_id,title,starts_at,location,community_id,announced_at)
        VALUES(?,?,?,?,?,?,?)`).bind(eventKey, post.id, post.title || post.body.slice(0, 140), post.starts_at, post.location || '', post.community_id, now),
      env.DB.prepare(`INSERT OR IGNORE INTO community_event_deliveries(event_key,subscriber_id,next_attempt_at)
        SELECT a.event_key,s.id,? FROM community_event_announcements a CROSS JOIN community_event_subscribers s
        WHERE a.event_key=? AND s.confirmed_at<=a.announced_at`).bind(now, eventKey),
    ]);
    if (ctx?.waitUntil) ctx.waitUntil(deliverCommunityEventAlerts(env, api).catch(() => {}));
    return reply({ queued: jobs.meta.changes, already_announced: record.meta.changes === 0 }, 202);
  }

  if (!await api.rateLimit(request, env, 'community-event-alerts', 10)) return reply({ error: 'rate_limited' }, 429);
  const body = await api.readJson(request);
  if (path.endsWith('/unsubscribe')) {
    if (typeof body?.token !== 'string' || !idPattern.test(body.token)) return reply({ error: 'invalid_token' }, 400);
    await env.DB.prepare('DELETE FROM community_event_subscribers WHERE id=?').bind(body.token).run();
    return reply({ ok: true });
  }
  if (path.endsWith('/confirm')) {
    if (typeof body?.token !== 'string' || !idPattern.test(body.token)) return reply({ error: 'invalid_token' }, 400);
    const result = await env.DB.prepare(`UPDATE community_event_subscribers SET confirmed_at=COALESCE(confirmed_at,?)
      WHERE confirm_hash=? AND confirm_expires_at>?`).bind(now, await api.sha256(body.token), now).run();
    return result.meta.changes ? reply({ ok: true }) : reply({ error: 'invalid_token' }, 400);
  }

  const auth = await api.authenticated(request, env);
  if (auth.response) return auth.response;
  const email = api.emailValue(auth.user.email);
  const ar = body?.language === 'ar';
  if (!email) return reply({ error: 'email_unavailable' }, 503);
  if (env.DATA_COLLECTION_ENABLED !== 'true' || !api.emailDeliveryConfigured(env)) return reply({ error: 'email_unavailable' }, 503);
  const prior = await env.DB.prepare('SELECT confirmed_at FROM community_event_subscribers WHERE email=?').bind(email).first();
  if (prior?.confirmed_at) return reply({ ok: true }, 202);
  if (!await api.rateLimitScoped(env, 'community-signup:' + email, 2, 15)) return reply({ error: 'rate_limited' }, 429);
  if (!await reserveEmail(env, api)) return reply({ error: 'email_unavailable' }, 503);
  const token = api.randomId();
  const hash = await api.sha256(token);
  const expires = new Date(Date.now() + dayMs).toISOString();
  const result = await env.DB.prepare(`INSERT INTO community_event_subscribers(id,email,language,confirm_hash,confirm_expires_at)
    VALUES(?,?,?,?,?) ON CONFLICT(email) DO UPDATE SET language=excluded.language,
    confirm_hash=excluded.confirm_hash,confirm_expires_at=excluded.confirm_expires_at WHERE confirmed_at IS NULL`)
     .bind(api.randomId(), email, ar ? 'ar' : 'en', hash, expires).run();
  if (!result.meta.changes) return reply({ ok: true }, 202);
  const subject = ar ? 'أكّد اشتراكك في تنبيهات فعاليات MZ Active' : 'Confirm MZ Active event alerts';
  const message = (ar ? 'لتأكيد اشتراكك في تنبيهات فعاليات المجتمع، افتح الرابط خلال ٢٤ ساعة.' : 'Open this link within 24 hours to confirm community event alerts.') +
    '\n\n' + site + '#confirm-event-email=' + token;
  const delivery = await api.sendEmail(env, email, subject, message, 'community-signup/' + token);
  return delivery.ok ? reply({ ok: true }, 202) : reply({ error: 'email_unavailable' }, 503);
}

export async function deliverCommunityEventAlerts(env, api) {
  if (!api.emailDeliveryConfigured(env)) return;
  const now = new Date().toISOString();
  const retryAt = new Date(Date.now() + 5 * 60_000).toISOString();
  const retryCutoff = new Date(Date.now() - 20 * 60 * 60_000).toISOString();
  await env.DB.prepare('DELETE FROM community_event_subscribers WHERE confirmed_at IS NULL AND confirm_expires_at<=?').bind(now).run();
  await env.DB.prepare("UPDATE community_event_deliveries SET state='failed' WHERE state='pending' AND (attempts>=3 OR first_attempt_at<=?) AND next_attempt_at<=?")
    .bind(retryCutoff, now).run();
  const rows = await env.DB.prepare(`SELECT d.event_key,d.subscriber_id,s.email,s.language,a.title,a.starts_at,a.location,a.community_id
    FROM community_event_deliveries d JOIN community_event_subscribers s ON s.id=d.subscriber_id
    JOIN community_event_announcements a ON a.event_key=d.event_key JOIN community_posts p ON p.id=a.post_id
    WHERE d.state='pending' AND d.next_attempt_at<=? AND d.attempts<3 AND ` + eventAvailable + ' ORDER BY d.next_attempt_at LIMIT 8')
    .bind(now, now).all();
  let lastAttempt = 0;
  for (const item of rows.results || []) {
    if (!await reserveEmail(env, api)) break;
    const claim = await env.DB.prepare(`UPDATE community_event_deliveries SET next_attempt_at=?,attempts=attempts+1,first_attempt_at=COALESCE(first_attempt_at,?)
      WHERE event_key=? AND subscriber_id=? AND state='pending' AND next_attempt_at<=?`)
      .bind(retryAt, now, item.event_key, item.subscriber_id, now).run();
    if (!claim.meta.changes) continue;
    const ar = item.language === 'ar';
    const date = new Intl.DateTimeFormat(ar ? 'ar-QA' : 'en-QA', {dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Qatar'})
      .format(new Date(item.starts_at));
    const eventLink = item.community_id ? site + '?community=' + encodeURIComponent(item.community_id) : site + '#upcoming';
    const subject = (ar ? 'فعالية جديدة: ' : 'New community event: ') + item.title.replace(/[\r\n]+/g,' ');
    const message = [item.title, date + (ar ? ' بتوقيت قطر' : ' Qatar time'), item.location, eventLink,
      (ar ? 'إلغاء الاشتراك' : 'Unsubscribe') + ': ' + site + '#unsubscribe-event-email=' + item.subscriber_id].filter(Boolean).join('\n\n');
    const waitMs = 550 - (Date.now() - lastAttempt);
    if (waitMs > 0) await new Promise(resolve => setTimeout(resolve, waitMs));
    lastAttempt = Date.now();
    const delivery = await api.sendEmail(env, item.email, subject, message, 'community-event/' + item.event_key + '/' + item.subscriber_id);
    if (delivery.ok) await env.DB.prepare("UPDATE community_event_deliveries SET state='sent' WHERE event_key=? AND subscriber_id=?")
      .bind(item.event_key, item.subscriber_id).run();
  }
}
