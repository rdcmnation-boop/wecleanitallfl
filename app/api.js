// Data layer. Two interchangeable backends with the same methods:
//   LIVE  — Supabase (Auth + Postgres with Row Level Security) over its REST API. No outside scripts needed.
//   DEMO  — everything in this browser's storage, for trying the app before Supabase is connected.
(function () {
  "use strict";
  const CFG = window.WCIA_CONFIG || {};
  const LIVE = !!(CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY);

  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } }
  };

  class ApiError extends Error { constructor(code, msg) { super(msg || code); this.code = code; } }

  // ────────────────────────── LIVE (Supabase REST) ──────────────────────────
  function liveBackend() {
    const URL_ = CFG.SUPABASE_URL.replace(/\/$/, "");
    const KEY = CFG.SUPABASE_ANON_KEY;
    const SKEY = "wcia_session";
    let session = store.get(SKEY, null);
    let refreshing = null;

    function saveSession(s) {
      if (s && s.access_token) {
        session = {
          access_token: s.access_token, refresh_token: s.refresh_token,
          expires_at: s.expires_at || Math.floor(Date.now() / 1000) + (Number(s.expires_in) || 3600),
          user: s.user || (session && session.user) || null
        };
        store.set(SKEY, session);
      } else { session = null; store.del(SKEY); }
    }

    async function raw(path, opts) {
      const r = await fetch(URL_ + path, opts);
      const text = await r.text();
      let body = null; try { body = text ? JSON.parse(text) : null; } catch (e) { body = text; }
      if (!r.ok) {
        const msg = (body && (body.msg || body.message || body.error_description || body.error)) || ("HTTP " + r.status);
        throw new ApiError(String(msg).split(" ")[0].toLowerCase().replace(/[^a-z_]/g, "") || "error", String(msg));
      }
      return body;
    }

    async function token() {
      if (!session) return null;
      if (session.expires_at - 60 > Date.now() / 1000) return session.access_token;
      if (!refreshing) {
        refreshing = raw("/auth/v1/token?grant_type=refresh_token", {
          method: "POST", headers: { apikey: KEY, "Content-Type": "application/json" },
          body: JSON.stringify({ refresh_token: session.refresh_token })
        }).then(saveSession).catch(() => saveSession(null)).finally(() => { refreshing = null; });
      }
      await refreshing;
      return session ? session.access_token : null;
    }

    async function rest(path, method, body, extra) {
      const t = await token();
      const headers = Object.assign({ apikey: KEY, "Content-Type": "application/json" }, t ? { Authorization: "Bearer " + t } : {}, extra || {});
      return raw("/rest/v1" + path, { method: method || "GET", headers, body: body === undefined ? undefined : JSON.stringify(body) });
    }
    const rpc = (fn, args) => rest("/rpc/" + fn, "POST", args || {});
    const redirect = encodeURIComponent(CFG.APP_URL || location.href.split("#")[0]);

    // Email confirmation / password recovery links land here with tokens in the URL hash.
    let recovery = false;
    (function readHash() {
      const h = new URLSearchParams(location.hash.replace(/^#/, ""));
      if (h.get("access_token") && h.get("refresh_token")) {
        saveSession({ access_token: h.get("access_token"), refresh_token: h.get("refresh_token"), expires_in: h.get("expires_in") });
        recovery = h.get("type") === "recovery";
        history.replaceState(null, "", location.pathname + location.search);
      }
    })();

    return {
      mode: "live",
      recovery: () => recovery,
      hasSession: () => !!session,
      async signUp({ email, password, role, full_name, phone, language, kind, company_name }) {
        const r = await raw("/auth/v1/signup?redirect_to=" + redirect, {
          method: "POST", headers: { apikey: KEY, "Content-Type": "application/json" },
          body: JSON.stringify({ email, password, data: { role, full_name, phone, language, kind, company_name } })
        });
        if (r && r.access_token) { saveSession(r); return { confirmed: true }; }
        return { confirmed: false };
      },
      async signIn({ email, password }) {
        const r = await raw("/auth/v1/token?grant_type=password", {
          method: "POST", headers: { apikey: KEY, "Content-Type": "application/json" }, body: JSON.stringify({ email, password })
        });
        saveSession(r);
      },
      async resetPassword(email) {
        await raw("/auth/v1/recover?redirect_to=" + redirect, {
          method: "POST", headers: { apikey: KEY, "Content-Type": "application/json" }, body: JSON.stringify({ email })
        });
      },
      async setPassword(password) {
        const t = await token();
        await raw("/auth/v1/user", { method: "PUT", headers: { apikey: KEY, Authorization: "Bearer " + t, "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
        recovery = false;
      },
      async signOut() {
        const t = await token().catch(() => null);
        if (t) await raw("/auth/v1/logout", { method: "POST", headers: { apikey: KEY, Authorization: "Bearer " + t } }).catch(() => {});
        saveSession(null);
      },
      async me() {
        if (!(await token())) return null;
        const [profiles, isAdmin, isAdminAccount] = await Promise.all([rest("/profiles?select=*&limit=1"), rpc("is_admin"), rpc("is_admin_account")]);
        const profile = profiles && profiles[0];
        if (!profile) return null;
        let worker = null;
        if (profile.role === "worker") { const w = await rest("/workers?select=*&id=eq." + profile.id); worker = w && w[0]; }
        return { profile, worker, isAdmin: !!isAdmin, adminNeedsMfa: !!isAdminAccount && !isAdmin };
      },
      // 2-step verification (authenticator app) — required for owner powers.
      async mfaStatus() {
        const t = await token();
        const u = await raw("/auth/v1/user", { headers: { apikey: KEY, Authorization: "Bearer " + t } });
        const factors = (u && u.factors) || [];
        return { verified: factors.filter((f) => f.factor_type === "totp" && f.status === "verified"), unverified: factors.filter((f) => f.status !== "verified") };
      },
      async mfaEnroll() {
        const t = await token(); const h = { apikey: KEY, Authorization: "Bearer " + t, "Content-Type": "application/json" };
        const st = await this.mfaStatus();
        for (const f of st.unverified) await raw("/auth/v1/factors/" + f.id, { method: "DELETE", headers: h }).catch(() => {});
        const r = await raw("/auth/v1/factors", { method: "POST", headers: h, body: JSON.stringify({ factor_type: "totp", friendly_name: "We Clean It All " + new Date().toISOString().slice(0, 10) + " " + Math.random().toString(36).slice(2, 6), issuer: "We Clean It All" }) });
        let qr = (r.totp && r.totp.qr_code) || "";
        if (qr && !qr.startsWith("data:")) qr = "data:image/svg+xml;utf-8," + encodeURIComponent(qr);
        return { factorId: r.id, qr, secret: r.totp && r.totp.secret };
      },
      async mfaVerify(factorId, code) {
        const t = await token(); const h = { apikey: KEY, Authorization: "Bearer " + t, "Content-Type": "application/json" };
        const ch = await raw("/auth/v1/factors/" + factorId + "/challenge", { method: "POST", headers: h, body: "{}" });
        const r = await raw("/auth/v1/factors/" + factorId + "/verify", { method: "POST", headers: h, body: JSON.stringify({ challenge_id: ch.id, code: String(code).replace(/\D/g, "") }) });
        saveSession(r);
      },
      saveProfile: (id, p) => rest("/profiles?id=eq." + id, "PATCH", p, { Prefer: "return=minimal" }),
      saveWorker: (id, w) => rest("/workers?id=eq." + id, "PATCH", w, { Prefer: "return=minimal" }),
      listWorkers: (zip, service) => rpc("list_workers", { p_zip: zip || null, p_service: service || null }),
      async createBooking(b) { const r = await rest("/bookings?select=id,code,status", "POST", b, { Prefer: "return=representation" }); return r[0]; },
      myBookings: () => rpc("my_bookings"),
      cancelBooking: (id) => rpc("cancel_booking", { p_booking: id }),
      reviewBooking: (id, rating, comment) => rpc("review_booking", { p_booking: id, p_rating: rating, p_comment: comment || "" }),
      myOffers: () => rpc("my_offers"),
      acceptOffer: (id) => rpc("accept_offer", { p_offer: id }),
      declineOffer: (id) => rpc("decline_offer", { p_offer: id }),
      myJobs: () => rpc("my_jobs"),
      startJob: (id) => rpc("start_job", { p_booking: id }),
      completeJob: (id) => rpc("complete_job", { p_booking: id }),
      notifications: () => rest("/notifications?select=id,template,payload,created_at,read_at&channel=eq.inapp&order=created_at.desc&limit=30"),
      markRead: () => rpc("mark_notifications_read"),
      adminStats: () => rpc("admin_stats"),
      adminWorkers: () => rpc("admin_workers"),
      adminBookings: () => rpc("admin_bookings"),
      adminSetWorkerStatus: (id, s) => rpc("admin_set_worker_status", { p_worker: id, p_status: s }),
      adminAssign: (b, w) => rpc("admin_assign", { p_booking: b, p_worker: w }),
      adminRedispatch: (b) => rpc("admin_redispatch", { p_booking: b }),
      async aiBriefing(lang) {
        try {
          const t = await token();
          if (!t) return null;
          const r = await fetch(URL_ + "/functions/v1/ai-ceo?lang=" + lang, { method: "POST", headers: { apikey: KEY, Authorization: "Bearer " + t } });
          if (!r.ok) return null;
          const j = await r.json();
          return j.configured && j.items && j.items.length ? j.items : null;
        } catch (e) { return null; }
      },
      // Private documents bucket (storage.sql)
      async uploadDoc(uid, file) {
        const t = await token();
        const safe = file.name.replace(/[^\w.\-]+/g, "_").slice(-80);
        const r = await fetch(URL_ + "/storage/v1/object/worker-docs/" + uid + "/" + Date.now() + "_" + safe, {
          method: "POST", headers: { apikey: KEY, Authorization: "Bearer " + t, "Content-Type": file.type || "application/octet-stream", "x-upsert": "false" }, body: file
        });
        if (!r.ok) throw new ApiError("upload_failed");
      },
      async listDocs(uid) {
        const t = await token();
        const r = await fetch(URL_ + "/storage/v1/object/list/worker-docs", {
          method: "POST", headers: { apikey: KEY, Authorization: "Bearer " + t, "Content-Type": "application/json" },
          body: JSON.stringify({ prefix: uid + "/", limit: 50, sortBy: { column: "created_at", order: "desc" } })
        });
        if (!r.ok) return [];
        return (await r.json()).filter((f) => f.name && f.id).map((f) => ({ name: f.name.replace(/^\d+_/, ""), path: uid + "/" + f.name }));
      },
      async docUrl(path) {
        const t = await token();
        const r = await fetch(URL_ + "/storage/v1/object/sign/worker-docs/" + path, {
          method: "POST", headers: { apikey: KEY, Authorization: "Bearer " + t, "Content-Type": "application/json" }, body: JSON.stringify({ expiresIn: 600 })
        });
        if (!r.ok) return null;
        const j = await r.json();
        return URL_ + "/storage/v1" + (j.signedURL || j.signedUrl);
      }
    };
  }

  // ────────────────────────── DEMO (this browser only) ──────────────────────────
  function demoBackend() {
    const DBK = "wcia_demo_db", SK = "wcia_demo_session";
    const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : "x" + Math.random().toString(16).slice(2) + Date.now().toString(16));
    const now = () => new Date().toISOString();
    const days = (n) => new Date(Date.now() + n * 864e5).toISOString();

    function seed() {
      const db = { users: [], profiles: [], workers: [], bookings: [], offers: [], reviews: [], notes: [], admins: [], seq: 1001, docs: {} };
      const add = (email, role, full_name, phone, language, w) => {
        const id = uuid();
        db.users.push({ id, email, password: "demo1234" });
        db.profiles.push({ id, role, full_name, phone, email, language, created_at: now() });
        if (role === "worker") db.workers.push(Object.assign({
          id, kind: "individual", company_name: "", bio: "", zips: [], services: [], languages: ["es"], years_experience: 0, team_size: 1,
          has_transport: true, has_equipment: true, has_insurance: false, rate_type: "hourly", hourly_rate: 30, whatsapp_opt_in: true,
          available: true, status: "approved", rating_avg: 0, rating_count: 0, jobs_done: 0, created_at: now(), approved_at: now()
        }, w || {}));
        return id;
      };
      const owner = add("owner@demo.wcia", "customer", "Rolando (Dueño)", "9543209303", "es");
      db.admins.push(owner);
      add("maria@demo.wcia", "worker", "Maria Perez", "9545550111", "es", { zips: ["33308", "33304", "33305", "33306"], services: ["standard", "deep", "move", "airbnb"], languages: ["es", "en"], years_experience: 7, has_insurance: true, rating_avg: 4.9, rating_count: 38, jobs_done: 112, bio: "Detallista. Traigo mis productos." });
      add("brillo@demo.wcia", "worker", "Luis Diaz", "9545550122", "es", { kind: "company", company_name: "Brillo Total LLC", team_size: 6, zips: ["33309", "33311", "33308", "33301"], services: ["standard", "deep", "office", "restaurant", "building", "post_construction", "bank"], languages: ["es", "en"], years_experience: 12, has_insurance: true, rating_avg: 4.7, rating_count: 61, jobs_done: 240, bio: "Equipo para oficinas y restaurantes, horario nocturno." });
      add("tasha@demo.wcia", "worker", "Tasha Brown", "9545550133", "en", { zips: ["33130", "33131", "33132", "33129"], services: ["standard", "airbnb", "windows"], languages: ["en"], years_experience: 3, rating_avg: 4.6, rating_count: 9, jobs_done: 14 });
      add("rosa@demo.wcia", "worker", "Rosa Jean", "9545550144", "ht", { zips: ["33301", "33312"], services: ["standard", "deep", "carpet"], languages: ["ht", "en", "es"], years_experience: 5, available: false, status: "pending", approved_at: null, rating_avg: 0, rating_count: 0, jobs_done: 0 });
      const cust = add("cliente@demo.wcia", "customer", "Ana Gomez", "9545550101", "es");
      const b = { id: uuid(), code: "WC-" + db.seq++, customer_id: cust, segment: "residential", service: "deep", property_type: "Apartamento", bedrooms: 2, bathrooms: 2, sqft: null, frequency: "once", zip: "33308", city: "Fort Lauderdale", address: "123 Las Olas Blvd, Apt 4", urgency: "scheduled", scheduled_at: days(2), hours_est: 4, budget: 120, notes: "Hay un perro amigable.", preferred_worker_id: null, status: "requested", worker_id: null, created_at: now() };
      db.bookings.push(b);
      store.set(DBK, db);
      dispatch(db, b);
      store.set(DBK, db);
      return db;
    }
    const load = () => store.get(DBK, null) || seed();
    const save = (db) => store.set(DBK, db);
    let uid = store.get(SK, null);
    const P = (db, id) => db.profiles.find((p) => p.id === id);
    const W = (db, id) => db.workers.find((w) => w.id === id);
    const isAdmin = (db) => db.admins.includes(uid);
    const need = (cond, code) => { if (!cond) throw new ApiError(code || "not_allowed"); };
    const note = (db, user, template, payload) => {
      db.notes.push({ id: db.notes.length + 1, user_id: user, channel: "inapp", template, payload: payload || {}, created_at: now(), read_at: null });
      const w = W(db, user);
      if (w && w.whatsapp_opt_in) db.notes.push({ id: db.notes.length + 1, user_id: user, channel: "whatsapp", template, payload: payload || {}, status: "queued", created_at: now() });
    };
    const near = (zips, zip) => zips.some((z) => z.slice(0, 4) === zip.slice(0, 4));

    function rank(db, b, limit) {
      const cust = P(db, b.customer_id) || {};
      return db.workers
        .filter((w) => w.status === "approved" && w.available && w.services.includes(b.service) &&
          (w.zips.includes(b.zip) || near(w.zips, b.zip) || w.id === b.preferred_worker_id) && w.id !== b.customer_id)
        .map((w) => ({
          w, score: (w.zips.includes(b.zip) ? 40 : near(w.zips, b.zip) ? 15 : 0) + Math.min(w.years_experience, 10) * 2 +
            (w.rating_count > 0 ? w.rating_avg * 6 : 15) +
            (db.bookings.some((o) => o.customer_id === b.customer_id && o.worker_id === w.id && o.status === "completed") ? 15 : 0) +
            (w.languages.includes(cust.language) ? 10 : 0) +
            (b.budget == null || w.rate_type === "fixed" || w.hourly_rate == null || w.hourly_rate * (b.hours_est || 3) <= b.budget * 1.1 ? 10 : 0) +
            (w.has_insurance ? 5 : 0) + (w.id === b.preferred_worker_id ? 100 : 0)
        }))
        .sort((a, c) => c.score - a.score || c.w.rating_count - a.w.rating_count).slice(0, limit);
    }
    function dispatch(db, b) {
      if (!["requested", "offered"].includes(b.status)) return 0;
      let n = 0;
      rank(db, b, b.urgency === "asap" ? 8 : 5).forEach(({ w, score }) => {
        if (db.offers.some((o) => o.booking_id === b.id && o.worker_id === w.id)) return;
        db.offers.push({ id: uuid(), booking_id: b.id, worker_id: w.id, score: Math.round(score * 10) / 10, status: "sent", sent_at: now() });
        note(db, w.id, "job_offer", { booking_id: b.id, code: b.code, service: b.service, zip: b.zip, city: b.city, budget: b.budget });
        n++;
      });
      if (n && b.status === "requested") b.status = "offered";
      return n;
    }
    const tick = () => new Promise((r) => setTimeout(r, 120));

    return {
      mode: "demo",
      recovery: () => false,
      hasSession: () => !!uid,
      async demoLogin(kind) {
        const db = load();
        const email = { customer: "cliente@demo.wcia", worker: "maria@demo.wcia", owner: "owner@demo.wcia" }[kind];
        uid = db.users.find((u) => u.email === email).id; store.set(SK, uid);
      },
      async demoReset() { store.del(DBK); store.del(SK); uid = null; },
      async signUp({ email, password, role, full_name, phone, language, kind, company_name }) {
        await tick(); const db = load();
        need(!db.users.some((u) => u.email.toLowerCase() === email.toLowerCase()), "user_already_exists");
        const id = uuid();
        db.users.push({ id, email, password });
        db.profiles.push({ id, role: role === "worker" ? "worker" : "customer", full_name, phone, email, language, created_at: now() });
        if (role === "worker") db.workers.push({ id, kind: kind === "company" ? "company" : "individual", company_name: company_name || "", bio: "", zips: [], services: [], languages: [language || "es"], years_experience: 0, team_size: 1, has_transport: false, has_equipment: false, has_insurance: false, rate_type: "hourly", hourly_rate: null, whatsapp_opt_in: true, available: false, status: "pending", rating_avg: 0, rating_count: 0, jobs_done: 0, created_at: now() });
        save(db); uid = id; store.set(SK, uid);
        return { confirmed: true };
      },
      async signIn({ email, password }) {
        await tick(); const db = load();
        const u = db.users.find((x) => x.email.toLowerCase() === email.toLowerCase() && x.password === password);
        need(u, "invalid_credentials"); uid = u.id; store.set(SK, uid);
      },
      async resetPassword() { await tick(); },
      async setPassword() { await tick(); },
      async signOut() { uid = null; store.del(SK); },
      async me() {
        const db = load(); const profile = uid && P(db, uid);
        if (!profile) { uid = null; store.del(SK); return null; }
        return { profile: Object.assign({}, profile), worker: W(db, uid) ? Object.assign({}, W(db, uid)) : null, isAdmin: isAdmin(db), adminNeedsMfa: false };
      },
      async saveProfile(id, p) { const db = load(); need(id === uid); Object.assign(P(db, id), { full_name: p.full_name, phone: p.phone, language: p.language }); save(db); },
      async saveWorker(id, w) {
        const db = load(); need(id === uid); const cur = W(db, id);
        const allowed = ["kind", "company_name", "bio", "zips", "services", "languages", "years_experience", "team_size", "has_transport", "has_equipment", "has_insurance", "rate_type", "hourly_rate", "whatsapp_opt_in", "available"];
        allowed.forEach((k) => { if (k in w) cur[k] = w[k]; });
        cur.zips = [...new Set((cur.zips || []).filter((z) => /^\d{5}$/.test(z)))].slice(0, 60);
        if (cur.status !== "approved") cur.available = false;
        save(db);
      },
      async listWorkers(zip, service) {
        await tick(); const db = load();
        return db.workers.filter((w) => w.status === "approved" && (!service || w.services.includes(service)) && (!zip || w.zips.includes(zip) || near(w.zips, zip)))
          .map((w) => { const p = P(db, w.id); const parts = p.full_name.split(" "); return Object.assign({}, w, { display_name: parts[0] + (parts[1] ? " " + parts[1][0] + "." : ""), covers_zip: !!zip && w.zips.includes(zip), zips: undefined }); })
          .sort((a, b) => (b.covers_zip - a.covers_zip) || (b.available - a.available) || (b.rating_avg - a.rating_avg));
      },
      async createBooking(b) {
        await tick(); const db = load(); const me = P(db, uid);
        need(me && me.role === "customer", "not_allowed");
        need(/^\d{5}$/.test(b.zip), "check_violation");
        need(b.urgency !== "scheduled" || b.scheduled_at, "scheduled_at required");
        need(db.bookings.filter((x) => x.customer_id === uid && ["requested", "offered", "assigned", "in_progress"].includes(x.status)).length < 5, "too_many_open");
        const row = Object.assign({}, b, { id: uuid(), code: "WC-" + db.seq++, customer_id: uid, status: "requested", worker_id: null, created_at: now() });
        db.bookings.push(row); dispatch(db, row); save(db);
        return { id: row.id, code: row.code, status: row.status };
      },
      async myBookings() {
        await tick(); const db = load();
        return db.bookings.filter((b) => b.customer_id === uid).sort((a, b) => b.created_at.localeCompare(a.created_at)).map((b) => {
          const w = b.worker_id && W(db, b.worker_id), p = b.worker_id && P(db, b.worker_id);
          return Object.assign({}, b, {
            worker: w ? { id: w.id, name: p.full_name, phone: p.phone, company_name: w.company_name, rating_avg: w.rating_avg, rating_count: w.rating_count } : null,
            offers_sent: db.offers.filter((o) => o.booking_id === b.id).length, reviewed: db.reviews.some((r) => r.booking_id === b.id)
          });
        });
      },
      async cancelBooking(id) {
        const db = load(); const b = db.bookings.find((x) => x.id === id);
        need(b && (b.customer_id === uid || isAdmin(db)) && ["requested", "offered", "assigned"].includes(b.status));
        b.status = "cancelled"; b.cancelled_at = now();
        db.offers.filter((o) => o.booking_id === id && o.status === "sent").forEach((o) => { o.status = "withdrawn"; });
        if (b.worker_id) note(db, b.worker_id, "booking_cancelled", { code: b.code });
        save(db);
      },
      async reviewBooking(id, rating, comment) {
        const db = load(); const b = db.bookings.find((x) => x.id === id);
        need(b && b.customer_id === uid && b.status === "completed");
        need(!db.reviews.some((r) => r.booking_id === id), "duplicate");
        db.reviews.push({ id: uuid(), booking_id: id, customer_id: uid, worker_id: b.worker_id, rating: Math.max(1, Math.min(5, rating)), comment: comment || "", created_at: now() });
        const rs = db.reviews.filter((r) => r.worker_id === b.worker_id), w = W(db, b.worker_id);
        w.rating_count = rs.length; w.rating_avg = Math.round(rs.reduce((s, r) => s + r.rating, 0) / rs.length * 100) / 100;
        save(db);
      },
      async myOffers() {
        await tick(); const db = load();
        return db.offers.filter((o) => o.worker_id === uid && o.status === "sent").map((o) => {
          const b = db.bookings.find((x) => x.id === o.booking_id);
          if (!b || !["requested", "offered"].includes(b.status)) return null;
          const { address, customer_id, ...pub } = b; // never expose address/customer before assignment
          return Object.assign(pub, { offer_id: o.id, booking_id: b.id, score: o.score, offer_status: o.status, sent_at: o.sent_at, booking_status: b.status });
        }).filter(Boolean).sort((a, b) => (b.urgency === "asap") - (a.urgency === "asap") || b.sent_at.localeCompare(a.sent_at));
      },
      async acceptOffer(id) {
        await tick(); const db = load(); const o = db.offers.find((x) => x.id === id && x.worker_id === uid);
        need(o, "not_found"); need(W(db, uid).status === "approved", "not_approved");
        const b = db.bookings.find((x) => x.id === o.booking_id);
        if (!["requested", "offered"].includes(b.status) || o.status !== "sent") { o.status = "lost"; save(db); return "taken"; }
        Object.assign(b, { status: "assigned", worker_id: uid, assigned_at: now() });
        o.status = "accepted";
        db.offers.filter((x) => x.booking_id === b.id && x.id !== id && x.status === "sent").forEach((x) => { x.status = "lost"; });
        note(db, b.customer_id, "booking_assigned", { code: b.code });
        save(db); return "assigned";
      },
      async declineOffer(id) {
        const db = load(); const o = db.offers.find((x) => x.id === id && x.worker_id === uid && x.status === "sent");
        if (!o) return; o.status = "declined";
        if (!db.offers.some((x) => x.booking_id === o.booking_id && x.status === "sent")) dispatch(db, db.bookings.find((b) => b.id === o.booking_id));
        save(db);
      },
      async myJobs() {
        await tick(); const db = load();
        return db.bookings.filter((b) => b.worker_id === uid && ["assigned", "in_progress", "completed"].includes(b.status))
          .sort((a, b) => (a.status === "completed") - (b.status === "completed") || String(a.scheduled_at || a.created_at).localeCompare(String(b.scheduled_at || b.created_at)))
          .map((b) => { const c = P(db, b.customer_id); const r = db.reviews.find((x) => x.booking_id === b.id); return Object.assign({}, b, { customer: { name: c.full_name, phone: c.phone }, review: r ? { rating: r.rating, comment: r.comment } : null }); });
      },
      async startJob(id) { const db = load(); const b = db.bookings.find((x) => x.id === id && x.worker_id === uid && x.status === "assigned"); need(b); b.status = "in_progress"; b.started_at = now(); save(db); },
      async completeJob(id) {
        const db = load(); const b = db.bookings.find((x) => x.id === id && x.worker_id === uid && ["assigned", "in_progress"].includes(x.status)); need(b);
        b.status = "completed"; b.completed_at = now(); W(db, uid).jobs_done++; note(db, b.customer_id, "booking_completed", { code: b.code }); save(db);
      },
      async notifications() { const db = load(); return db.notes.filter((n) => n.user_id === uid && n.channel === "inapp").sort((a, b) => b.id - a.id).slice(0, 30); },
      async markRead() { const db = load(); db.notes.forEach((n) => { if (n.user_id === uid && !n.read_at) n.read_at = now(); }); save(db); },
      async adminStats() {
        await tick(); const db = load(); if (!isAdmin(db)) return null;
        const d30 = Date.now() - 30 * 864e5, recent = (t) => t && Date.parse(t) > d30;
        const open = db.bookings.filter((b) => ["requested", "offered"].includes(b.status));
        const count = (arr, k) => Object.entries(arr.reduce((m, x) => (m[x[k]] = (m[x[k]] || 0) + 1, m), {})).map(([key, n]) => ({ [k]: key, n })).sort((a, b) => b.n - a.n).slice(0, 5);
        const rv = db.reviews;
        return {
          customers: db.profiles.filter((p) => p.role === "customer").length,
          workers_total: db.workers.length,
          workers_pending: db.workers.filter((w) => w.status === "pending").length,
          workers_approved: db.workers.filter((w) => w.status === "approved").length,
          workers_online: db.workers.filter((w) => w.status === "approved" && w.available).length,
          bookings_open: open.length,
          bookings_unmatched: db.bookings.filter((b) => b.status === "requested").length,
          bookings_active: db.bookings.filter((b) => ["assigned", "in_progress"].includes(b.status)).length,
          bookings_completed_30d: db.bookings.filter((b) => b.status === "completed" && recent(b.completed_at)).length,
          bookings_cancelled_30d: db.bookings.filter((b) => b.status === "cancelled" && recent(b.cancelled_at)).length,
          gmv_30d: db.bookings.filter((b) => b.status === "completed" && recent(b.completed_at)).reduce((s, b) => s + (Number(b.budget) || 0), 0),
          avg_rating: rv.length ? Math.round(rv.reduce((s, r) => s + r.rating, 0) / rv.length * 100) / 100 : null,
          low_reviews_30d: rv.filter((r) => r.rating <= 2 && recent(r.created_at)).length,
          top_zips_open: count(open, "zip"),
          top_services_30d: count(db.bookings.filter((b) => recent(b.created_at)), "service"),
          whatsapp_queued: db.notes.filter((n) => n.channel === "whatsapp" && n.status === "queued").length
        };
      },
      async adminWorkers() {
        await tick(); const db = load(); need(isAdmin(db), "admin_only");
        return db.workers.map((w) => { const p = P(db, w.id); return Object.assign({}, w, { full_name: p.full_name, phone: p.phone, email: p.email, language: p.language }); })
          .sort((a, b) => (b.status === "pending") - (a.status === "pending") || b.created_at.localeCompare(a.created_at));
      },
      async adminBookings() {
        await tick(); const db = load(); need(isAdmin(db), "admin_only");
        return db.bookings.slice().sort((a, b) => b.created_at.localeCompare(a.created_at)).map((b) => {
          const c = P(db, b.customer_id), wp = b.worker_id && P(db, b.worker_id);
          return Object.assign({}, b, {
            customer: { name: c.full_name, phone: c.phone, email: c.email }, worker: wp ? { name: wp.full_name, phone: wp.phone } : null,
            offers: db.offers.filter((o) => o.booking_id === b.id).sort((x, y) => y.score - x.score).map((o) => { const p = P(db, o.worker_id); return { worker_id: o.worker_id, name: p.full_name, phone: p.phone, status: o.status, score: o.score }; })
          });
        });
      },
      async adminSetWorkerStatus(id, s) {
        const db = load(); need(isAdmin(db), "admin_only"); const w = W(db, id);
        w.status = s; if (s === "approved") w.approved_at = now(); else w.available = false;
        note(db, id, "worker_" + s, {}); save(db);
      },
      async adminAssign(bid, wid) {
        const db = load(); need(isAdmin(db), "admin_only"); need(W(db, wid) && W(db, wid).status === "approved", "worker_not_approved");
        const b = db.bookings.find((x) => x.id === bid); need(b && ["requested", "offered", "assigned"].includes(b.status));
        Object.assign(b, { worker_id: wid, status: "assigned", assigned_at: now() });
        db.offers.filter((o) => o.booking_id === bid && o.status === "sent" && o.worker_id !== wid).forEach((o) => { o.status = "lost"; });
        note(db, wid, "job_assigned", { code: b.code }); note(db, b.customer_id, "booking_assigned", { code: b.code }); save(db);
      },
      async adminRedispatch(bid) { const db = load(); need(isAdmin(db), "admin_only"); const n = dispatch(db, db.bookings.find((b) => b.id === bid)); save(db); return n; },
      async aiBriefing() { return null; },
      async uploadDoc(id, file) { const db = load(); (db.docs[id] = db.docs[id] || []).push({ name: file.name, path: "" }); save(db); },
      async listDocs(id) { return (load().docs[id] || []).slice(); },
      async docUrl() { return null; }
    };
  }

  window.WCIA_API = LIVE ? liveBackend() : demoBackend();
  window.WCIA_API.ApiError = ApiError;
})();
