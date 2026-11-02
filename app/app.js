// We Clean It All — app UI (customers, cleaners, owner). Plain JS, no build step.
(function () {
  "use strict";
  // Refuse to run inside another site's frame (clickjacking); GitHub Pages can't send frame-ancestors.
  if (window.top !== window.self) { try { window.top.location = window.location.href; } catch (e) { /* cross-origin */ } document.documentElement.innerHTML = ""; return; }
  const API = window.WCIA_API, CFG = window.WCIA_CONFIG || {}, I18N = window.WCIA_I18N;
  const $ = (s, r) => (r || document).querySelector(s);
  const root = $("#app");

  // ───────── helpers ─────────
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } }
  };
  let lang = store.get("wcia_lang", (navigator.language || "es").toLowerCase().startsWith("es") ? "es" : "en");
  if (!I18N[lang]) lang = "es";
  const t = (k, v) => { let s = (I18N[lang] && I18N[lang][k]) || I18N.es[k] || k; if (v) Object.keys(v).forEach((x) => { s = s.split("{" + x + "}").join(v[x]); }); return s; };
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const money = (n) => n == null || n === "" ? "—" : "$" + Number(n).toLocaleString(lang === "es" ? "es-US" : "en-US", { maximumFractionDigits: 0 });
  const when = (iso) => {
    if (!iso) return t("asap");
    const d = new Date(iso);
    return d.toLocaleString(lang === "es" ? "es-US" : "en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  };
  const digits = (p) => String(p || "").replace(/\D/g, "");
  const intl = (p) => { const d = digits(p); return d.length === 10 ? "1" + d : d; };
  const wa = (phone, text) => "https://wa.me/" + intl(phone) + "?text=" + encodeURIComponent(text || "");
  const tel = (phone) => "tel:+" + intl(phone);
  const svcName = (s) => t("svc_" + s);
  const stars = (n) => { const r = Math.round(Number(n) || 0); return "★★★★★".slice(0, r) + "☆☆☆☆☆".slice(0, 5 - r); };

  const SERVICES = {
    residential: ["standard", "deep", "move", "airbnb", "post_construction", "windows", "carpet"],
    commercial: ["office", "restaurant", "bank", "hotel", "building", "deep", "post_construction", "windows", "carpet"]
  };
  const ALL_SERVICES = ["standard", "deep", "move", "airbnb", "office", "restaurant", "bank", "hotel", "building", "post_construction", "windows", "carpet"];
  const LANGS = ["es", "en", "pt", "ht"];

  const I = {
    plus: '<path d="M12 5v14M5 12h14"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    bulb: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>',
    mic: '<rect x="9" y="3" width="6" height="12" rx="3"/><path d="M19 11a7 7 0 0 1-14 0M12 18v3"/>',
    spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    cash: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    plug: '<path d="M9 2v6M15 2v6M6 8h12v4a6 6 0 0 1-12 0V8zM12 18v4"/>',
    bell: '<path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0"/>',
    phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/>',
    chat: '<path d="M21 11.5a8.4 8.4 0 0 1-12.3 7.4L3 21l2.1-5.6A8.4 8.4 0 1 1 21 11.5z"/>',
    pin: '<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    home: '<path d="M3 11 12 4l9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
    building: '<rect x="4" y="3" width="16" height="18" rx="1"/><path d="M9 7h.01M15 7h.01M9 11h.01M15 11h.01M9 15h.01M15 15h.01M10 21v-3h4v3"/>',
    broom: '<path d="M19 3 10 12M7 13l4 4M3 21c1-4 3-7 5-8l3 3c-1 2-4 4-8 5z"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>',
    out: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
    chart: '<path d="M3 3v18h18"/><path d="M7 15v2M11 11v6M15 7v10M19 12v5"/>',
    file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>'
  };
  const icon = (n, cls) => '<svg class="ic ' + (cls || "") + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + I[n] + "</svg>";

  // ───────── state ─────────
  const S = { me: null, screen: "landing", authRole: "customer", tab: null, data: {}, busy: false, notes: [], form: {}, filter: "pending", bfilter: "open" };

  function toast(msg, kind) {
    document.querySelectorAll(".toast").forEach((x) => x.remove());
    clearTimeout(toast._later);
    const el = document.createElement("div");
    el.className = "toast " + (kind || "");
    el.setAttribute("role", "status");
    el.textContent = msg;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add("in"));
    setTimeout(() => { el.classList.remove("in"); setTimeout(() => el.remove(), 300); }, 2600);
  }
  function errMsg(e) {
    if (S.screen === "mfa") return t("mfa_wrong");
    const c = (e && (e.code || e.message)) || "";
    const map = {
      invalid_credentials: lang === "es" ? "Correo o contraseña incorrectos." : "Wrong email or password.",
      invalid: lang === "es" ? "Correo o contraseña incorrectos." : "Wrong email or password.",
      user_already_exists: lang === "es" ? "Ese correo ya tiene cuenta. Entra." : "That email already has an account. Sign in.",
      user: lang === "es" ? "Ese correo ya tiene cuenta. Entra." : "That email already has an account. Sign in.",
      email: lang === "es" ? "Confirma tu correo primero." : "Confirm your email first.",
      not_approved: t("pending_title"), worker_not_approved: t("pending_title"),
      password: t("pw_hint"),
      too_many_open: t("err_too_many"), rate_limited: t("err_rate"), date_too_far: t("err_date_far"),
      invalid_totp: t("mfa_wrong"), mfa: t("mfa_wrong")
    };
    return map[c] || t("error_generic");
  }
  async function run(fn, okMsg) {
    if (S.busy) return;
    S.busy = true; document.body.classList.add("busy");
    try { const r = await fn(); if (okMsg) toast(okMsg, "ok"); return r; }
    catch (e) { console.error(e); toast(errMsg(e), "bad"); throw e; }
    finally { S.busy = false; document.body.classList.remove("busy"); }
  }

  // ───────── boot ─────────
  async function boot() {
    document.documentElement.lang = lang;
    if (API.hasSession()) {
      try { S.me = await API.me(); } catch (e) { S.me = null; }
    }
    if (API.recovery && API.recovery()) S.screen = "newpass";
    else if (S.me) afterLogin();
    render();
    poll();
  }
  async function afterLogin() {
    if (S.me && S.me.adminNeedsMfa && !S.skipMfa) {
      S.screen = "mfa"; S.mfa = { loading: true }; render();
      try {
        const st = await API.mfaStatus();
        if (st.verified.length) S.mfa = { factorId: st.verified[0].id, enrolled: true };
        else S.mfa = Object.assign({ enrolled: false }, await API.mfaEnroll());
      } catch (e) { console.error(e); S.mfa = { error: true }; }
      render(); return;
    }
    startRole();
  }
  function role() { return !S.me ? null : S.me.isAdmin ? "admin" : S.me.profile.role; }
  const TABS = {
    customer: [["book", "plus", "tab_book"], ["orders", "list", "tab_orders"], ["cleaners", "users", "tab_cleaners"], ["account", "user", "tab_account"]],
    worker: [["jobs", "spark", "tab_jobs"], ["myjobs", "check", "tab_myjobs"], ["earnings", "cash", "tab_earnings"], ["profile", "user", "tab_profile"]],
    admin: [["panel", "grid", "tab_panel"], ["analytics", "chart", "tab_analytics"], ["workers", "users", "tab_workers"], ["bookings", "list", "tab_bookings"], ["system", "spark", "tab_system"]]
  };
  function startRole() {
    S.screen = "app";
    const r = role();
    document.body.classList.toggle("owner", r === "admin");
    const saved = store.get("wcia_tab_" + r, null);
    S.tab = TABS[r].some((x) => x[0] === saved) ? saved : TABS[r][0][0];
    if (r === "worker" && S.me.worker && (!S.me.worker.zips.length || !S.me.worker.services.length) && S.me.worker.status === "pending") S.tab = "profile";
    S.data = {};
    loadTab();
    loadNotes();
  }
  async function refreshMe() { S.me = await API.me(); }

  // ───────── data per tab ─────────
  async function loadTab(quiet) {
    const tab = S.tab;
    const loaders = {
      orders: async () => ({ orders: await API.myBookings() }),
      cleaners: async () => ({ cleaners: await API.listWorkers(S.form.dirZip || "", S.form.dirSvc || "") }),
      book: async () => ({ cleaners: await API.listWorkers((S.form.book && S.form.book.zip) || "", (S.form.book && S.form.book.service) || "").catch(() => []) }),
      jobs: async () => { await refreshMe(); return { offers: S.me.worker && S.me.worker.status === "approved" ? await API.myOffers() : [] }; },
      myjobs: async () => { const jobs = await API.myJobs(); const live = jobs.find((j) => j.status === "in_progress"); if (live) startSharing(live.id); else stopSharing(); return { jobs }; },
      earnings: async () => { await refreshMe(); return { jobs: await API.myJobs() }; },
      profile: async () => ({ docs: await API.listDocs(S.me.profile.id).catch(() => []), myReviews: await API.myReviews().catch(() => null) }),
      panel: async () => { const [stats, an] = await Promise.all([API.adminStats(), API.adminAnalytics(14)]); S.data.stats = stats; S.data.an = an; render(); const ai = await API.aiBriefing(lang); return { stats, an, ai }; },
      analytics: async () => ({ an: await API.adminAnalytics(S.range || 30) }),
      system: async () => {
        const sys = S.sys || "launch";
        if (sys === "architecture") { const [stats, ai] = await Promise.all([API.adminStats(), S.data.ai !== undefined ? S.data.ai : API.aiBriefing(lang)]); return { stats, ai }; }
        if (sys === "improve") { const [stats, an, workers] = await Promise.all([API.adminStats(), API.adminAnalytics(30), API.adminWorkers()]); return { stats, an, workers }; }
        if (sys === "updates") return { activity: await API.adminActivity() };
        if (sys === "customers") return { customers: await API.adminCustomers() };
        if (sys === "agents") { const [agents, pending, log] = await Promise.all([API.adminAgents(), API.adminPendingApprovals(), API.adminAgentLog(50)]); return { agents, pending, log }; }
        if (sys === "connectors") return { stats: await API.adminStats() };
        if (sys === "account") return { dev: S.me && S.me.isAdmin ? await API.deviceStatus().catch(() => null) : null };
        return {};
      },
      workers: async () => ({ workers: await API.adminWorkers() }),
      bookings: async () => { const [bookings, workers] = await Promise.all([API.adminBookings(), API.adminWorkers()]); return { bookings, workers }; },
      connectors: async () => ({ stats: await API.adminStats() })
    };
    if (!loaders[tab]) { render(); return; }
    if (!quiet) { S.data.loading = true; render(); }
    try { const d = await loaders[tab](); if (S.tab === tab) S.data = Object.assign({}, S.data, d, { loading: false }); }
    catch (e) { console.error(e); S.data.loading = false; if (!quiet) toast(errMsg(e), "bad"); }
    if (S.tab === tab) render();
  }
  async function loadNotes() { try { S.notes = await API.notifications(); } catch (e) { S.notes = []; } renderBell(); }
  function poll() {
    setInterval(() => {
      if (document.hidden || !S.me || S.busy || S.screen !== "app") return;
      if (document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
      if (["jobs", "orders", "panel", "bookings", "myjobs", "analytics"].includes(S.tab) || (S.tab === "system" && S.sys === "updates")) loadTab(true);
      loadNotes();
    }, 20000);
    document.addEventListener("visibilitychange", () => { if (!document.hidden && S.me && S.screen === "app") { loadTab(true); loadNotes(); } });
  }

  // ───────── rendering ─────────
  function render() {
    const scrollY = window.scrollY;
    const sameTab = render._last === S.screen + S.tab;
    render._last = S.screen + S.tab;
    root.innerHTML = S.screen === "app" ? appShell() : publicScreen();
    if (sameTab) window.scrollTo(0, scrollY); else window.scrollTo(0, 0);
    const focus = root.querySelector("[autofocus]"); if (focus && !sameTab) focus.focus();
  }
  function header(extra) {
    return '<header class="top"><a class="brand" href="/" aria-label="We Clean It All">' +
      '<img src="/media/mark.svg" alt="" width="40" height="40"><span class="wm">We Clean<b>It All</b></span></a>' +
      '<div class="top-actions">' + (extra || "") +
      '<button class="chip-btn" data-act="lang" aria-label="' + t("language") + '">' + (lang === "es" ? "EN" : "ES") + "</button></div></header>";
  }
  function demoBanner() {
    const guest = S.me && S.me.needsAccount && !S.me.isAdmin ? '<div class="guest-banner"><span>' + esc(t("guest_banner")) + '</span><button class="link-btn" data-act="tab" data-tab="account">' + esc(t("guest_save")) + "</button></div>" : "";
    return (API.mode === "demo" ? '<div class="demo-banner">' + esc(t("demo_banner")) + "</div>" : "") + guest;
  }

  const guestEnabled = () => API.mode === "demo" || !!CFG.GUEST_BOOKING;
  // public: landing / auth / new password
  function publicScreen() {
    let body = "";
    if (S.screen === "landing") {
      body = '<section class="hero"><div class="logo-stage"><div class="logo-spin"><img class="hero-logo" src="/media/logo-hero.png" width="150" height="123" alt="We Clean It All"></div></div><p class="eyebrow">' + esc(t("hero_sub")) + '</p><h1 class="sr-only">We Clean It All</h1></section>' +
        '<div class="big-choices">' +
        '<button class="big-choice" data-act="' + (guestEnabled() ? "guest" : "auth") + '" data-role="customer">' + icon("home", "lg") + "<span><b>" + esc(t("need_cleaning")) + "</b><small>" + esc(t("need_cleaning_sub")) + "</small></span></button>" +
        '<button class="big-choice" data-act="auth" data-role="worker">' + icon("broom", "lg") + "<span><b>" + esc(t("want_work")) + "</b><small>" + esc(t("want_work_sub")) + "</small></span></button>" +
        "</div>" +
        '<button class="link-btn center" data-act="signin">' + esc(t("have_account")) + "</button>" +
        '<a class="link-btn center" href="/comercial/">' + esc(t("comm_eyebrow")) + "</a>" +
        (API.mode === "demo" ?'<div class="demo-try"><span>' + esc(t("demo_try")) + ':</span><button class="pill" data-act="demo" data-kind="customer">' + esc(t("demo_customer")) +
          '</button><button class="pill" data-act="demo" data-kind="worker">' + esc(t("demo_worker")) + '</button><button class="pill" data-act="demo" data-kind="owner">' + esc(t("demo_owner")) + "</button></div>" : "");
    } else if (S.screen === "signup") {
      const w = S.authRole === "worker";
      body = '<button class="back" data-act="home">‹ ' + esc(t("back")) + "</button>" +
        "<h2>" + esc(w ? t("want_work") : t("need_cleaning")) + "</h2>" +
        '<form class="card form" data-form="signup" novalidate>' +
        (w ? seg("kind", [["individual", t("individual")], ["company", t("company")]], S.form.kind || "individual") +
          '<label class="field company-only' + (S.form.kind === "company" ? "" : " hide") + '"><span>' + esc(t("company_name")) + '</span><input name="company_name" maxlength="120" autocomplete="organization"></label>' : "") +
        field("full_name", t("full_name"), "text", 'required maxlength="120" autocomplete="name" autofocus') +
        field("phone", t("phone"), "tel", 'required inputmode="tel" autocomplete="tel" maxlength="20" placeholder="954 555 0101"') +
        field("email", t("email"), "email", 'required autocomplete="email"') +
        field("password", t("password"), "password", 'required minlength="8" autocomplete="new-password"', t("pw_hint")) +
        '<button class="btn solid block" type="submit">' + esc(t("sign_up")) + "</button>" +
        '<p class="fine">' + esc(t("terms_note")) + "</p></form>" +
        '<button class="link-btn center" data-act="signin">' + esc(t("have_account")) + "</button>";
    } else if (S.screen === "signin") {
      body = '<button class="back" data-act="home">‹ ' + esc(t("back")) + "</button><h2>" + esc(t("sign_in")) + "</h2>" +
        '<form class="card form" data-form="signin" novalidate>' +
        field("email", t("email"), "email", 'required autocomplete="email" autofocus') +
        field("password", t("password"), "password", 'required autocomplete="current-password"') +
        '<button class="btn solid block" type="submit">' + esc(t("sign_in")) + "</button></form>" +
        '<button class="link-btn center" data-act="forgot">' + esc(t("forgot")) + "</button>";
    } else if (S.screen === "forgot") {
      body = '<button class="back" data-act="signin">‹ ' + esc(t("back")) + "</button><h2>" + esc(t("forgot")) + "</h2>" +
        '<form class="card form" data-form="forgot" novalidate>' + field("email", t("email"), "email", 'required autocomplete="email" autofocus') +
        '<button class="btn solid block" type="submit">' + esc(t("send_link")) + "</button></form>";
    } else if (S.screen === "newpass") {
      body = "<h2>" + esc(t("new_password")) + "</h2>" +
        '<form class="card form" data-form="newpass" novalidate>' + field("password", t("new_password"), "password", 'required minlength="8" autocomplete="new-password" autofocus', t("pw_hint")) +
        '<button class="btn solid block" type="submit">' + esc(t("save_password")) + "</button></form>";
    } else if (S.screen === "mfa") {
      const m = S.mfa || {};
      body = '<div class="empty">' + icon("shield", "xl") + "<h2>" + esc(t("mfa_title")) + "</h2><p>" + esc(m.enrolled ? t("mfa_login_sub") : t("mfa_setup_sub")) + "</p></div>" +
        (m.loading ? loading() : m.error ? '<p class="muted center">' + esc(t("error_generic")) + "</p>" :
          '<form class="card form" data-form="mfa" novalidate>' +
          (!m.enrolled && m.qr ? '<img class="qr" src="' + esc(m.qr) + '" alt="QR" width="220" height="220"><p class="fine">' + esc(t("mfa_secret")) + '</p><code class="secret">' + esc(m.secret || "") + "</code>" : "") +
          field("code", t("mfa_code"), "text", 'required inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" autofocus') +
          (m.enrolled ? '<label class="check"><input type="checkbox" name="remember" value="1"> <span>' + esc(t("mfa_remember")) + "</span></label>" : "") +
          '<button class="btn solid block" type="submit">' + esc(t("mfa_verify")) + '</button><p class="fine">' + esc(t("mfa_why")) + "</p></form>") +
        '<button class="link-btn center" data-act="skipmfa">' + esc(t("mfa_skip")) + "</button>";
    } else if (S.screen === "checkemail") {
      body = '<div class="empty big">' + icon("check", "xl") + "<h2>" + esc(t("check_email")) + '</h2><button class="btn ghost" data-act="signin">' + esc(t("sign_in")) + "</button></div>";
    }
    return header() + demoBanner() + '<main class="wrap public">' + body + "</main>";
  }
  function field(name, label, type, attrs, hint, value) {
    return '<label class="field"><span>' + esc(label) + '</span><input name="' + name + '" type="' + type + '" ' + (attrs || "") +
      (value != null ? ' value="' + esc(value) + '"' : "") + ">" + (hint ? "<small>" + esc(hint) + "</small>" : "") + "</label>";
  }
  function seg(name, opts, cur) {
    return '<div class="seg" role="radiogroup">' + opts.map(([v, l]) =>
      '<label class="seg-opt"><input type="radio" name="' + name + '" value="' + v + '"' + (v === cur ? " checked" : "") + "><span>" + esc(l) + "</span></label>").join("") + "</div>";
  }
  function chips(name, opts, selected, multi) {
    return '<div class="chips">' + opts.map(([v, l]) =>
      '<label class="chip"><input type="' + (multi ? "checkbox" : "radio") + '" name="' + name + '" value="' + v + '"' + (selected.includes(v) ? " checked" : "") + "><span>" + esc(l) + "</span></label>").join("") + "</div>";
  }
  function toggle(name, label, on) {
    return '<label class="switch-row"><span>' + esc(label) + '</span><input type="checkbox" role="switch" name="' + name + '"' + (on ? " checked" : "") + '><i aria-hidden="true"></i></label>';
  }
  function stepper(name, label, val, min, max) {
    return '<div class="stepper"><span>' + esc(label) + '</span><div><button type="button" data-act="step" data-name="' + name + '" data-d="-1" aria-label="-">−</button>' +
      '<input name="' + name + '" type="number" inputmode="numeric" min="' + min + '" max="' + max + '" value="' + val + '" aria-label="' + esc(label) + '">' +
      '<button type="button" data-act="step" data-name="' + name + '" data-d="1" aria-label="+">+</button></div></div>';
  }

  // app shell
  const LEGAL_VERSION = "2026-11-draft";
  const verifyChannel = () => (CFG.GUEST_VERIFY === "phone" ? "phone" : "email");
  function verifyModal() {
    const v = S.verify; if (!v) return "";
    const demoHint = API.mode === "demo" ? '<p class="fine">' + esc(t("verify_demo_hint")) + "</p>" : "";
    const byEmail = verifyChannel() === "email";
    const body = v.step === "email"
      ? '<p class="muted">' + esc(t(byEmail ? "verify_sub_email" : "verify_sub")) + "</p>" +
        (byEmail ? field("email", t("email"), "email", 'required inputmode="email" autocomplete="email"', null, v.info.ge || "") : "") +
        field("phone", t("phone"), "tel", 'required inputmode="tel" maxlength="20" autocomplete="tel"', null, v.info.gp) +
        '<label class="consent"><input type="checkbox" name="consent" value="1"><span>' + esc(t("consent_a")) + ' <a href="/terms/" target="_blank" rel="noopener">' + esc(t("terms")) + '</a>, <a href="/privacy/" target="_blank" rel="noopener">' + esc(t("privacy")) + "</a> " + esc(t("consent_b")) + "</span></label>" +
        '<button class="btn solid block" type="submit">' + esc(t(byEmail ? "send_code_email" : "send_code")) + "</button>"
      : '<p class="muted">' + esc(t("code_sent", { e: v.contact })) + "</p>" + field("code", t("mfa_code"), "text", 'required inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" autofocus') + demoHint +
        '<button class="btn solid block" type="submit">' + esc(t("verify_send")) + '</button><button type="button" class="link-btn center" data-act="verifyback">' + esc(t("change_phone")) + "</button>";
    return '<div class="modal" role="dialog" aria-modal="true"><form class="modal-card stack" data-form="verify" novalidate><div class="row between"><p class="label">' + icon("shield") + esc(t("verify_title")) + '</p><button type="button" class="x" data-act="verifycancel" aria-label="' + esc(t("cancel")) + '">×</button></div>' + body + "</form></div>";
  }
  function appShell() {
    const r = role();
    const tabs = TABS[r];
    const bell = '<button class="bell" data-act="notes" aria-label="' + esc(t("notifications")) + '">' + icon("bell") + '<b class="dot" id="bell-dot" hidden></b></button>';
    const strip = (h) => h.replace(/^<h1 class="title">.*?<\/h1>/, "");
    const views = { book: vBook, orders: vOrders, cleaners: vCleaners, account: vAccount, jobs: vJobs, myjobs: vMyJobs, earnings: vEarnings, profile: vProfile, panel: vPanel, workers: vWorkers, bookings: vAdminBookings, connectors: vConnectors,
      analytics: () => owner().vAnalytics(), system: () => owner().vSystem({ connectors: () => strip(vConnectors()), account: () => strip(vAccount()) }) };
    return header(bell) + demoBanner() +
      '<main class="wrap app">' + (views[S.tab] ? views[S.tab]() : "") + "</main>" +
      '<nav class="tabbar n' + tabs.length + '" aria-label="Menu">' + tabs.map(([k, ic, lab]) =>
        '<button data-act="tab" data-tab="' + k + '"' + (S.tab === k ? ' aria-current="page" class="on"' : "") + ">" + icon(ic) + "<span>" + esc(t(lab)) + "</span></button>").join("") + "</nav>" + verifyModal() + reviewsModal();
  }
  function renderBell() {
    const dot = $("#bell-dot"); if (!dot) return;
    const unread = S.notes.filter((n) => !n.read_at).length;
    dot.hidden = !unread; dot.textContent = unread > 9 ? "9+" : String(unread || "");
  }
  let OWNER = null;
  const owner = () => OWNER || (OWNER = window.WCIA_OWNER({ t, esc, icon, money, when, svcName, S, tile, loading, empty, wa, CFG, lang: () => lang }));
  // Agent console: runs on the owner's own session. Class D requests only create approvals; nothing runs by itself.
  let CONSOLE = null;
  const askAgents = async (text) => {
    if (!window.WCIA_CONSOLE || !window.WCIA_ORCH || !window.WCIA_TOOLS) throw new Error("agent console not loaded");
    CONSOLE = CONSOLE || window.WCIA_CONSOLE.createConsole({ orch: window.WCIA_ORCH, tools: window.WCIA_TOOLS, api: API });
    return CONSOLE.ask(text, S.data.agents || []);
  };
  const loading = () => '<div class="skeleton"><i></i><i></i><i></i></div>';
  // Live job timer (from the real start time) and an optional Google Map (needs CFG.GOOGLE_MAPS_KEY).
  const jobTimer = (b) => b.status === "in_progress" && b.started_at ? '<p class="job-timer" data-started="' + esc(b.started_at) + '">' + icon("clock") + "<span>" + esc(t("timer_label")) + ' <b class="tval">--:--</b></span></p>' : "";
  const jobMap = (b) => {
    if (!CFG.GOOGLE_MAPS_KEY) return "";
    const q = [b.address, b.city, b.zip, "FL"].filter(Boolean).join(", ");
    if (!q.trim()) return "";
    return '<div class="job-map"><iframe title="' + esc(t("map_label")) + '" loading="lazy" referrerpolicy="no-referrer-when-downgrade" src="https://www.google.com/maps/embed/v1/place?key=' + encodeURIComponent(CFG.GOOGLE_MAPS_KEY) + "&q=" + encodeURIComponent(q) + '"></iframe></div>';
  };
  const tickTimers = () => {
    document.querySelectorAll(".job-timer").forEach((el) => {
      const s = Math.max(0, Math.floor((Date.now() - Date.parse(el.dataset.started)) / 1000));
      const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
      const v = (h ? h + ":" : "") + String(m).padStart(2, "0") + ":" + String(x).padStart(2, "0");
      const b = el.querySelector(".tval"); if (b && b.textContent !== v) b.textContent = v;
    });
  };
  const tickLoc = () => document.querySelectorAll("[data-since]").forEach((el) => {
    const m = Math.floor((Date.now() - Date.parse(el.dataset.since)) / 60000);
    const v = m < 1 ? t("loc_now") : t("loc_ago", { n: m }); if (el.textContent !== v) el.textContent = v;
  });
  document.addEventListener("toggle", (e) => { const d = e.target; if (d && d.matches && d.matches("details.sec[data-sec]")) { S.secs = S.secs || {}; S.secs[d.dataset.sec] = d.open; } }, true);
  setInterval(() => { tickTimers(); tickLoc(); }, 1000);
  setInterval(() => { if (S.tab === "orders" && document.querySelector(".live-loc") && !S.data.loading) loadTab(true); }, 30000);
  // Reviews: summary, bars and the list. Used by the customer (any cleaner) and by the cleaner (own).
  const reviewsPanel = (d) => {
    if (!d) return '<p class="muted">…</p>';
    const bars = [5, 4, 3, 2, 1].map((n) => { const c = (d.dist && d.dist[n]) || 0; const pct = d.count ? Math.round((c / d.count) * 100) : 0; return '<div class="bar-row"><span>' + n + '★</span><div class="bar"><i style="width:' + pct + '%"></i></div><small>' + c + "</small></div>"; }).join("");
    const items = (d.items || []).map((r) => '<article class="rv"><div class="row between"><b>' + esc(r.name || "–") + "</b><small>" + esc(when(r.created_at)) + '</small></div><p class="stars">' + stars(r.rating) + "</p>" + (r.comment ? '<p class="bio">' + esc(r.comment) + "</p>" : "") + "</article>").join("");
    return '<div class="rv-sum"><div class="big-avg">' + (d.count ? Number(d.avg).toFixed(1) : "–") + '</div><div><p class="stars">' + stars(d.avg) + '</p><small class="muted">' + esc(t("reviews_count", { n: d.count })) + "</small></div></div>" +
      '<div class="bars">' + bars + "</div>" + (items || '<p class="muted">' + esc(t("reviews_none")) + "</p>");
  };
  function reviewsModal() {
    const r = S.rv; if (!r) return "";
    return '<div class="modal" role="dialog" aria-modal="true"><div class="modal-card stack rv-modal"><div class="row between"><p class="label">' + esc(r.name) + '</p><button type="button" class="x" data-act="rvclose" aria-label="' + esc(t("cancel")) + '">×</button></div>' + reviewsPanel(r.data) + "</div></div>";
  }

  // Live location: the cleaner shares GPS only while a job is in progress (every ~30 s). Stops when the job ends.
  let geoWatch = null, geoJob = null, geoLast = 0;
  const stopSharing = () => { if (geoWatch != null && navigator.geolocation) navigator.geolocation.clearWatch(geoWatch); geoWatch = null; geoJob = null; geoLast = 0; };
  const startSharing = (id) => {
    if (!navigator.geolocation || geoJob === id) return;
    stopSharing(); geoJob = id;
    geoWatch = navigator.geolocation.watchPosition((pos) => {
      const n = Date.now(); if (n - geoLast < 30000) return; geoLast = n;
      API.shareLocation(id, pos.coords.latitude, pos.coords.longitude).catch((e) => console.error(e));
    }, () => { toast(t("loc_denied"), "bad"); stopSharing(); }, { enableHighAccuracy: true, maximumAge: 15000, timeout: 60000 });
  };
  const liveLoc = (b) => b.status === "in_progress" && b.worker_lat != null
    ? '<span class="row gap wrap-row"><a class="btn ghost small live-loc" target="_blank" rel="noopener" href="https://www.google.com/maps?q=' + encodeURIComponent(b.worker_lat + "," + b.worker_lng) + '">' + icon("pin") + "<span>" + esc(t("see_live")) + '</span> · <small data-since="' + esc(b.location_at) + '">' + esc(t("loc_now")) + '</small></a><a class="btn ghost small" target="_blank" rel="noopener" href="https://earth.google.com/web/search/' + encodeURIComponent(b.worker_lat + "," + b.worker_lng) + '">Google Earth</a></span>'
    : "";
  const empty = (ic, title, sub, btn) => '<div class="empty">' + icon(ic, "xl") + "<h3>" + esc(title) + "</h3>" + (sub ? "<p>" + esc(sub) + "</p>" : "") + (btn || "") + "</div>";

  // ── customer: book ──
  function suggest(f) {
    const deep = ["deep", "move", "post_construction"].includes(f.service);
    let h;
    if (f.segment === "commercial") h = Math.max(2, Math.round(((Number(f.sqft) || 2000) / 1000) * 1.5 * 2) / 2);
    else h = 1.5 + (Number(f.bedrooms) || 0) * 0.75 + (Number(f.bathrooms) || 0) * 0.5;
    if (deep) h *= 1.5;
    h = Math.round(h * 2) / 2;
    return { hours: h, budget: Math.round(h * (Number(CFG.SUGGESTED_HOURLY) || 30) / 5) * 5 };
  }
  // Collapsible sections for the booking form (native <details>). Open/closed state survives re-renders.
  // Sections are open by default unless the owner/customer closed them; "open = false" starts them closed.
  const secO = (k, label, open = true) => {
    const isOpen = S.secs && k in S.secs ? S.secs[k] : open;
    return '<details class="sec" data-sec="' + k + '"' + (isOpen ? " open" : "") + '><summary>' + esc(label) + "</summary>";
  };
  const secC = "</details>";
  // Brain assistants: customer (booking page), worker (my jobs) and owner (panel). One central function answers all three.
  function brainCard(role) {
    if (API.mode !== "demo" && !CFG.BRAIN_ON) return ""; // hidden in live mode until the brain is switched on
    const log = (S.brain && S.brain[role]) || [];
    const title = role === "owner" ? t("brain_title_owner") : role === "worker" ? t("brain_title_worker") : t("brain_title_customer");
    return '<section class="card stack brain" aria-label="' + esc(title) + '"><p class="label">' + icon("spark") + esc(title) + "</p>" +
      '<div class="brain-log" aria-live="polite">' + (log.length ? log.map((m) => '<p class="brain-' + m.from + '">' + esc(m.text) + "</p>").join("") : '<p class="fine">' + esc(t("brain_hint")) + "</p>") + "</div>" +
      '<form class="row gap" data-form="brain" data-role="' + role + '" novalidate><input name="message" maxlength="500" autocomplete="off" placeholder="' + esc(t("brain_ask")) + '">' +
      '<button class="btn ghost small brain-mic" type="button" data-act="brainmic" data-role="' + role + '" aria-label="' + esc(t("brain_voice")) + '" title="' + esc(t("brain_voice")) + '">' + icon("mic") + "</button>" +
      '<button class="btn solid small" type="submit">' + esc(t("brain_send")) + "</button></form></section>";
  }
  // Only what that user is allowed to see goes to the brain: no addresses, phones or notes.
  function brainContext(role) {
    if (role === "owner") return { lang, stats: S.data.stats || null };
    if (role === "worker") return { lang, jobs: (S.data.jobs || []).slice(0, 10).map((b) => ({ status: b.status, service: b.service, when: b.scheduled_at, zip: b.zip, budget: b.budget })) };
    const f = (S.form && S.form.book) || {};
    return { lang, booking: { segment: f.segment, service: f.service, frequency: f.frequency, zip: f.zip, urgency: f.urgency, bedrooms: f.bedrooms, bathrooms: f.bathrooms, budget: f.budget } };
  }
  async function brainAsk(form) {
    const role = form.dataset.role, text = String(new FormData(form).get("message") || "").trim();
    const byVoice = form.dataset.voice === "1";
    delete form.dataset.voice;
    if (!text) return;
    S.brain = S.brain || {};
    const log = (S.brain[role] = S.brain[role] || []);
    log.push({ from: "me", text }, { from: "bot", text: "…" });
    render();
    let res;
    try { res = await API.askBrain(role, text, brainContext(role)); } catch (e) { res = { mode: "error" }; }
    log.pop();
    log.push({ from: "bot", text: res && res.reply ? res.reply : res && res.mode === "off" ? t("brain_off") : t("brain_error") });
    if (log.length > 30) log.splice(0, log.length - 30);
    if (byVoice && res && res.reply) brainSpeak(res.reply);
    render();
  }
  // Voice in: the words go to the same assistant as typing. Stays on the device's own speech service (no key needed).
  function brainListen(role) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { toast(t("brain_voice_no"), "bad"); return; }
    let rec;
    try { rec = new SR(); } catch (e) { toast(t("brain_voice_no"), "bad"); return; }
    rec.lang = lang === "es" ? "es-US" : "en-US";
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (ev) => {
      const said = String((((ev.results || [])[0] || [])[0] || {}).transcript || "").trim();
      const form = document.querySelector('form[data-form="brain"][data-role="' + role + '"]');
      if (!said || !form) return;
      document.querySelectorAll(".toast").forEach((x) => x.remove());
      form.querySelector('input[name="message"]').value = said;
      form.dataset.voice = "1";
      if (form.requestSubmit) form.requestSubmit(); else form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    };
    rec.onerror = (ev) => toast(t(ev.error === "not-allowed" || ev.error === "service-not-allowed" ? "brain_voice_denied" : "brain_voice_err"), "bad");
    toast(t("brain_voice_listen"));
    try { rec.start(); } catch (e) { toast(t("brain_voice_err"), "bad"); }
  }
  // Voice out: a spoken question gets its answer read aloud. Typed questions stay silent.
  function brainSpeak(text) {
    try {
      if (!("speechSynthesis" in window) || !window.SpeechSynthesisUtterance || !text) return;
      const u = new SpeechSynthesisUtterance(text);
      u.lang = lang === "es" ? "es-US" : "en-US";
      speechSynthesis.cancel();
      speechSynthesis.speak(u);
    } catch (e) { /* reading aloud is optional */ }
  }
  function vBook() {
    const f = S.form.book || (S.form.book = { segment: "residential", service: "standard", bedrooms: 2, bathrooms: 1, frequency: "once", urgency: "scheduled" });
    const sg = suggest(f);
    const pref = f.preferred_worker_id ? (S.data.cleaners || []).find((c) => c.id === f.preferred_worker_id) || S.form.prefCleaner : null;
    const minDate = new Date(Date.now() + 2 * 3600e3); minDate.setMinutes(0, 0, 0);
    const localMin = new Date(minDate.getTime() - minDate.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    const guestCard = S.me.isGuest ? '<div class="card stack"><p class="label">' + icon("user") + esc(t("guest_contact")) + "</p>" +
      field("g_name", t("full_name"), "text", 'required maxlength="120" autocomplete="name"', null, S.me.profile.full_name) +
      field("g_phone", t("phone"), "tel", 'required inputmode="tel" maxlength="20" autocomplete="tel"', null, S.me.profile.phone) + "</div>" : "";
    const sugg = (S.data.cleaners || []).filter((c) => !f.preferred_worker_id && (!f.service || (c.services || []).includes(f.service))).slice(0, 3);
    const suggHtml = sugg.length ? '<div class="card"><p class="label">' + icon("users") + esc(t("suggested")) + '</p><div class="sugg">' + sugg.map((c) =>
      '<div class="sugg-c"><span class="av">' + esc((c.display_name || "?")[0]) + '</span><span><b>' + esc(c.display_name) + "</b><small>★ " + esc(String(c.rating_avg || "–")) + " · " + esc(String(c.jobs_done || 0)) + " " + esc(t("jobs_done_short")) + "</small></span>" +
      '<button type="button" class="btn ghost small" data-act="prefer" data-id="' + esc(c.id) + '">' + esc(t("pick")) + "</button></div>").join("") + "</div></div>" : "";
    return '<h1 class="title">' + esc(t("book_title")) + "</h1>" +
      '<form class="form stack" data-form="book" novalidate>' + guestCard + secO("what", t("sec_what")) +
      '<div class="seg big">' + [["residential", "home"], ["commercial", "building"]].map(([v, ic]) =>
        '<label class="seg-opt"><input type="radio" name="segment" value="' + v + '"' + (f.segment === v ? " checked" : "") + ">" + "<span>" + icon(ic) + esc(t(v)) + "</span></label>").join("") + "</div>" +
      chips("service", SERVICES[f.segment].map((s) => [s, svcName(s)]), [f.service]) +
      (f.segment === "residential"
        ? '<div class="card row2">' + stepper("bedrooms", t("bedrooms"), f.bedrooms, 0, 20) + stepper("bathrooms", t("bathrooms"), f.bathrooms, 0, 20) + "</div>"
        : '<div class="card">' + field("property_type", t("business_type"), "text", 'maxlength="60"', null, f.property_type || "") + field("sqft", t("sqft"), "number", 'inputmode="numeric" min="0" max="1000000"', null, f.sqft || "") + "</div>") +
      '<div class="card"><p class="label">' + esc(t("frequency")) + "</p>" + chips("frequency", ["once", "weekly", "biweekly", "monthly"].concat(f.segment === "commercial" ? ["daily"] : []).map((x) => [x, t("freq_" + x)]), [f.frequency]) + "</div>" +
      secC + secO("where", t("sec_where")) + '<div class="card"><div class="row2">' + field("zip", t("zip"), "text", 'required inputmode="numeric" pattern="[0-9]{5}" maxlength="5" autocomplete="postal-code"', null, f.zip || "") +
      field("city", t("city"), "text", 'maxlength="80" autocomplete="address-level2"', null, f.city || "") + "</div>" +
      '<div class="zip-map" id="zipMap">' + zipMapHtml(f.zip) + "</div>" +
      field("address", t("address"), "text", 'maxlength="200" autocomplete="street-address"', t("address_private"), f.address || "") +
      '<div class="zip-map" id="addrMap">' + addrMapHtml(f) + "</div>" + "</div>" +
      secC + secO("when", t("sec_when")) + '<div class="card"><p class="label">' + esc(t("when")) + "</p>" + seg("urgency", [["scheduled", t("pick_date")], ["asap", t("asap")]], f.urgency) +
      (f.urgency === "scheduled" ? field("scheduled_at", t("date_time"), "datetime-local", 'min="' + localMin + '" required', null, f.scheduled_at || "") : "") + "</div>" +
      secC + secO("details", t("sec_details") + " · $" + (f.budget || sg.budget), false) + '<div class="card"><div class="row2">' + field("hours_est", t("hours_est"), "number", 'step="0.5" min="0.5" max="200" inputmode="decimal"', null, f.hours_est || sg.hours) +
      field("budget", t("budget") + " ($)", "number", 'min="0" max="100000" inputmode="numeric"', null, f.budget || sg.budget) + "</div>" +
      '<p class="fine">' + esc(t("budget_hint")) + "</p></div>" +
      secC + secO("access", t("sec_access"), !!f.notes) +
      '<label class="field"><span>' + esc(t("notes")) + '</span><textarea name="notes" rows="3" maxlength="1000">' + esc(f.notes || "") + "</textarea></label>" +
      secC +
      (pref ?'<div class="pref">' + icon("user") + "<span>" + esc(t("preferred")) + ": <b>" + esc(pref.display_name) + '</b></span><button type="button" class="x" data-act="clearpref" aria-label="' + esc(t("cancel")) + '">×</button></div>' : "") +
      (suggHtml ?secO("sugg", t("suggested"), false) + suggHtml + secC : "") +
      '<button class="btn solid block xl" type="submit">' + esc(t("send_request")) + "</button>" +
      '<p class="fine center">' + esc(t("privacy_note")) + "</p></form>" + brainCard("customer");
  }

  // ── customer: orders ──
  const STEPS = ["requested", "offered", "assigned", "in_progress", "completed"];
  function timeline(status) {
    if (status === "cancelled") return '<div class="pill bad">' + esc(t("st_cancelled")) + "</div>";
    const i = STEPS.indexOf(status);
    return '<ol class="steps">' + STEPS.slice(1).map((s, k) => '<li class="' + (k + 1 <= i ? "done" : "") + (k + 1 === i ? " now" : "") + '"><i></i><span>' + esc(t("st_" + s)) + "</span></li>").join("") + "</ol>";
  }
  function vOrders() {
    if (S.data.loading && !S.data.orders) return loading();
    const list = S.data.orders || [];
    if (!list.length) return empty("list", t("no_orders"), "", '<button class="btn solid" data-act="tab" data-tab="book">' + esc(t("book_now")) + "</button>");
    return '<h1 class="title">' + esc(t("tab_orders")) + "</h1>" + list.map((b) => {
      const w = b.worker;
      const status = '<span class="pill st-' + b.status + '">' + esc(t("st_" + b.status)) + "</span>";
      return '<article class="card order">' +
        '<div class="row between"><b class="code">' + esc(b.code) + "</b>" + status + "</div>" +
        "<h3>" + esc(svcName(b.service)) + "</h3>" +
        '<p class="meta">' + icon("clock") + esc(b.urgency === "asap" ? t("asap") : when(b.scheduled_at)) + " · " + icon("pin") + esc(b.city || b.zip) + "</p>" +
        timeline(b.status) + jobTimer(b) + liveLoc(b) + (b.status === "in_progress" ? jobMap(b) : "") +
        (b.status === "offered" ? '<p class="muted">' + esc(t("sent_to", { n: b.offers_sent })) + "</p>" : "") +
        (w ? '<div class="person"><div class="avatar">' + esc((w.name || "?")[0]) + "</div><div><small>" + esc(t("your_cleaner")) + "</small><b>" + esc(w.name) + "</b>" +
          (w.company_name ? "<small>" + esc(w.company_name) + "</small>" : "") + (w.rating_count ? '<small class="stars">' + stars(w.rating_avg) + " " + Number(w.rating_avg).toFixed(1) + "</small>" : "") + "</div></div>" +
          (["assigned", "in_progress"].includes(b.status) ? '<div class="row gap">' + '<a class="btn ghost small" href="' + tel(w.phone) + '">' + icon("phone") + esc(t("call")) + "</a>" +
            '<a class="btn wa small" target="_blank" rel="noopener" href="' + wa(w.phone, t("wa_msg_customer", { name: S.me.profile.full_name, code: b.code })) + '">' + icon("chat") + "WhatsApp</a></div>" : "") : "") +
        (b.status === "completed" && !b.reviewed ? reviewForm(b) : b.reviewed ? '<p class="muted">✓ ' + esc(t("reviewed")) + "</p>" : "") +
        (["requested", "offered", "assigned"].includes(b.status) ? '<button class="link-btn danger" data-act="cancel" data-id="' + b.id + '">' + esc(t("cancel_order")) + "</button>" : "") +
        "</article>";
    }).join("");
  }
  function reviewForm(b) {
    return '<form class="review" data-form="review" data-id="' + b.id + '"><p class="label">' + esc(t("rate_service")) + '</p><div class="rate" role="radiogroup">' +
      [5, 4, 3, 2, 1].map((n) => '<input type="radio" id="r' + b.id + n + '" name="rating" value="' + n + '"><label for="r' + b.id + n + '" aria-label="' + n + '">★</label>').join("") +
      '</div><input name="comment" maxlength="600" placeholder="' + esc(t("comment")) + '"><button class="btn solid small" type="submit">' + esc(t("send_review")) + "</button></form>";
  }

  // ── customer: directory ──
  function vCleaners() {
    const list = S.data.cleaners;
    return '<h1 class="title">' + esc(t("find_cleaners")) + "</h1>" +
      '<form class="row gap filters" data-form="dir"><input name="zip" inputmode="numeric" maxlength="5" placeholder="' + esc(t("search_zip")) + '" value="' + esc(S.form.dirZip || "") + '" aria-label="' + esc(t("search_zip")) + '">' +
      '<select name="svc" aria-label="' + esc(t("service")) + '"><option value="">' + esc(t("any_service")) + "</option>" + ALL_SERVICES.map((s) => '<option value="' + s + '"' + (S.form.dirSvc === s ? " selected" : "") + ">" + esc(svcName(s)) + "</option>").join("") + "</select>" +
      '<button class="btn solid small" type="submit">OK</button></form>' +
      (/^\d{5}$/.test(S.form.dirZip || "") ? '<p><a class="btn ghost small" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(S.form.dirZip + " FL") + '">' + esc(t("zip_on_map")) + "</a></p>" : "") +
      (S.data.loading && !list ? loading() : !list || !list.length ? empty("users", t("no_cleaners")) :
        list.map((w) => '<article class="card cleaner"><div class="person"><div class="avatar">' + esc(w.display_name[0]) + "</div><div><b>" + esc(w.kind === "company" && w.company_name ? w.company_name : w.display_name) + "</b>" +
          (w.kind === "company" && w.company_name ? "<small>" + esc(w.display_name) + " · " + esc(t("team_size")) + ": " + w.team_size + "</small>" : "") +
          '<small class="stars">' + (w.rating_count ? stars(w.rating_avg) + " " + Number(w.rating_avg).toFixed(1) + " (" + w.rating_count + ")" : esc(t("new_cleaner"))) + "</small></div>" +
          '<span class="pill ' + (w.available ? "ok" : "") + '">' + esc(w.available ? t("online") : t("offline")) + "</span></div>" +
          (w.bio ? '<p class="bio">' + esc(w.bio) + "</p>" : "") +
          '<p class="tags">' + [t("years", { n: w.years_experience }), t("jobs", { n: w.jobs_done })].concat(w.has_insurance ? [t("insured")] : []).concat(w.has_equipment ? [t("own_equipment")] : [])
            .concat(w.covers_zip ? [t("covers_zip")] : []).map((x) => "<span>" + esc(x) + "</span>").join("") + "</p>" +
          '<p class="tags soft">' + w.services.map((s) => "<span>" + esc(svcName(s)) + "</span>").join("") + w.languages.map((l) => "<span>" + esc(t("lang_" + l)) + "</span>").join("") + "</p>" +
          '<div class="row between"><b>' + (w.rate_type === "hourly" && w.hourly_rate ? money(w.hourly_rate) + esc(t("per_hour")) : "") + '</b><div class="row gap"><button class="btn ghost small" data-act="reviews" data-id="' + w.id + '" data-name="' + esc(w.company_name && w.kind === "company" ? w.company_name : w.display_name) + '">' + esc(t("reviews_btn")) + " (" + (w.rating_count || 0) + ')</button><button class="btn solid small" data-act="prefer" data-id="' + w.id + '">' + esc(t("request_this")) + "</button></div></div></article>").join(""));
  }

  // ── shared: account ──
  function vAccount() {
    const p = S.me.profile;
    return '<h1 class="title">' + esc(t("my_account")) + "</h1>" +
      (S.me.needsAccount && !S.me.isAdmin ? '<form class="card form" data-form="upgrade" novalidate><p class="label">' + icon("shield") + esc(t("guest_save_title")) + '</p><p class="muted">' + esc(t("guest_save_sub")) + "</p>" +
        field("email", t("email"), "email", 'required autocomplete="email"') + field("password", t("password"), "password", 'required minlength="8" autocomplete="new-password"') +
        '<button class="btn solid block" type="submit">' + esc(t("guest_save")) + "</button></form>" : "") +
      '<form class="card form" data-form="account">' +
      '<p class="pill">' + esc(t("role_" + role())) + "</p>" +
      field("full_name", t("full_name"), "text", 'required maxlength="120" autocomplete="name"', null, p.full_name) +
      field("phone", t("phone"), "tel", 'inputmode="tel" maxlength="20" autocomplete="tel"', null, p.phone) +
      '<label class="field"><span>' + esc(t("email")) + '</span><input value="' + esc(p.email) + '" disabled></label>' +
      '<label class="field"><span>' + esc(t("language")) + '</span><select name="language">' + LANGS.map((l) => '<option value="' + l + '"' + (p.language === l ? " selected" : "") + ">" + esc(t("lang_" + l)) + "</option>").join("") + "</select></label>" +
      '<button class="btn solid block" type="submit">' + esc(t("save")) + "</button></form>" +
      '<div class="card"><p class="label">' + icon("phone") + esc(t("install_app")) + '</p><p class="muted">' + esc(t("install_hint")) + "</p></div>" +
      '<div class="card"><p class="label">' + esc(t("help")) + '</p><div class="row gap"><a class="btn ghost small" href="' + tel(CFG.BUSINESS_PHONE) + '">' + icon("phone") + esc(t("call")) + "</a>" +
      '<a class="btn wa small" target="_blank" rel="noopener" href="' + wa(CFG.BUSINESS_PHONE, "") + '">' + icon("chat") + "WhatsApp</a></div></div>" +
      (S.me.isAdmin && S.data && S.data.dev ? '<div class="card"><p class="label">' + icon("shield") + esc(t("dev_title")) + '</p><p class="muted">' +
        esc(S.data.dev.this_device ? t("dev_this_yes") : t("dev_this_no")) + " " + esc(t("dev_count", { n: S.data.dev.active || 0 })) + '</p><div class="row gap">' +
        (S.data.dev.this_device ? '<button class="btn ghost small" data-act="devforget">' + esc(t("dev_forget")) + "</button>" : "") +
        ((S.data.dev.active || 0) > 0 ? '<button class="btn ghost small" data-act="devforgetall">' + esc(t("dev_forget_all")) + "</button>" : "") + "</div></div>" : "") +
      '<button class="btn ghost block" data-act="signout">' + icon("out") + esc(t("sign_out")) + "</button>" +
      (API.mode === "demo" ? '<button class="link-btn center" data-act="demoreset">Reset demo</button>' : "");
  }

  // ── worker ──
  function workerGaps(w) {
    const g = [];
    if (!w.zips.length) g.push(t("zips_served"));
    if (!w.services.length) g.push(t("services_offered"));
    if (!digits(S.me.profile.phone)) g.push(t("phone"));
    return g;
  }
  function statusBanner(w) {
    if (w.status === "approved") return "";
    const gaps = workerGaps(w);
    const title = { pending: t("pending_title"), rejected: t("rejected_title"), suspended: t("suspended_title") }[w.status];
    return '<div class="banner ' + (w.status === "pending" ? "warn" : "bad") + '">' + icon("shield") + "<div><b>" + esc(title) + "</b><p>" + esc(w.status === "pending" ? t("pending_sub") : "") + "</p>" +
      (gaps.length ? '<p class="small">' + esc(t("profile_missing", { f: gaps.join(", ") })) + '</p><button class="btn solid small" data-act="tab" data-tab="profile">' + esc(t("complete_profile")) + "</button>" :
        '<a class="btn wa small" target="_blank" rel="noopener" href="' + wa(CFG.BUSINESS_PHONE, t("wa_msg_worker", { name: "" }) + " " + S.me.profile.full_name) + '">' + icon("chat") + esc(t("contact_owner")) + "</a>") + "</div></div>";
  }
  function vJobs() {
    const w = S.me.worker;
    const avail = '<label class="avail ' + (w.available ? "on" : "") + (w.status !== "approved" ? " disabled" : "") + '"><input type="checkbox" role="switch" data-act="avail"' + (w.available ? " checked" : "") + (w.status !== "approved" ? " disabled" : "") + '>' +
      '<i aria-hidden="true"></i><span><b>' + esc(w.available ? t("available_now") : t("not_available")) + "</b><small>" + esc(w.available ? t("available_sub_on") : t("available_sub_off")) + "</small></span></label>";
    const offers = S.data.offers;
    return avail + statusBanner(w) +
      (w.status !== "approved" ? "" : S.data.loading && !offers ? loading() : !offers || !offers.length ? empty("spark", t("no_offers"), t("no_offers_sub")) :
        offers.map((o) => '<article class="card offer' + (o.urgency === "asap" ? " hot" : "") + '">' +
          '<div class="row between"><b class="eyebrow">' + esc(t("new_opportunity")) + '</b><span class="code">' + esc(o.code) + "</span></div>" +
          '<dl class="facts">' +
          "<dt>" + esc(t("service")) + "</dt><dd>" + esc(svcName(o.service)) + (o.frequency !== "once" ? " · " + esc(t("freq_" + o.frequency)) : "") + "</dd>" +
          "<dt>" + esc(t("location")) + "</dt><dd>" + esc((o.city ? o.city + ", " : "") + o.zip) + "</dd>" +
          (o.segment === "residential" ? "<dt>" + esc(t("property")) + "</dt><dd>" + esc(t("bedrooms")) + ": " + (o.bedrooms || 0) + " · " + esc(t("bathrooms")) + ": " + (o.bathrooms || 0) + "</dd>" :
            "<dt>" + esc(t("property")) + "</dt><dd>" + esc(o.property_type || t("commercial")) + (o.sqft ? " · " + Number(o.sqft).toLocaleString() + " ft²" : "") + "</dd>") +
          (o.hours_est ? "<dt>" + esc(t("duration")) + "</dt><dd>" + o.hours_est + " h</dd>" : "") +
          "<dt>" + esc(t("pay")) + '</dt><dd class="pay">' + money(o.budget) + "</dd>" +
          "<dt>" + esc(t("schedule")) + "</dt><dd>" + esc(o.urgency === "asap" ? t("asap") : when(o.scheduled_at)) + "</dd></dl>" +
          (o.notes ? '<p class="bio">' + esc(o.notes) + "</p>" : "") +
          '<div class="row2"><button class="btn solid" data-act="accept" data-id="' + o.offer_id + '">' + icon("check") + esc(t("accept_job")) + '</button><button class="btn ghost" data-act="decline" data-id="' + o.offer_id + '">' + esc(t("decline")) + "</button></div></article>").join(""));
  }
  function vMyJobs() {
    const jobs = S.data.jobs;
    if (S.data.loading && !jobs) return loading();
    if (!jobs || !jobs.length) return empty("check", t("no_jobs"));
    return '<h1 class="title">' + esc(t("tab_myjobs")) + "</h1>" + brainCard("worker") + jobs.map((b) => '<article class="card order">' +
      '<div class="row between"><b class="code">' + esc(b.code) + '</b><span class="pill st-' + b.status + '">' + esc(t("st_" + b.status)) + "</span></div>" +
      "<h3>" + esc(svcName(b.service)) + "</h3>" +
      '<p class="meta">' + icon("clock") + esc(b.urgency === "asap" ? t("asap") : when(b.scheduled_at)) + " · " + money(b.budget) + (b.hours_est ? " · " + b.hours_est + " h" : "") + "</p>" +
      jobTimer(b) + (b.status === "in_progress" && geoJob === b.id ? '<p class="muted">' + esc(t("sharing_loc")) + "</p>" : "") +
      (b.status !== "completed" ? '<p class="addr">' + icon("pin") + "<span>" + esc([b.address, b.city, b.zip].filter(Boolean).join(", ")) + "</span></p>" + (b.status === "in_progress" ? jobMap(b) : "") : "") +
      (b.notes ? '<p class="bio">' + esc(b.notes) + "</p>" : "") +
      '<div class="person"><div class="avatar">' + esc((b.customer.name || "?")[0]) + "</div><div><small>" + esc(t("customer")) + "</small><b>" + esc(b.customer.name) + "</b></div></div>" +
      (b.status !== "completed" ? '<div class="row gap wrap-row"><a class="btn ghost small" href="' + tel(b.customer.phone) + '">' + icon("phone") + esc(t("call")) + "</a>" +
        '<a class="btn wa small" target="_blank" rel="noopener" href="' + wa(b.customer.phone, t("wa_msg_customer", { name: S.me.profile.full_name, code: b.code })) + '">' + icon("chat") + "WhatsApp</a>" +
        '<a class="btn ghost small" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent([b.address, b.city, b.zip, "FL"].filter(Boolean).join(", ")) + '">' + icon("pin") + esc(t("directions")) + "</a></div>" +
        (b.status === "assigned" ? '<button class="btn solid block" data-act="start" data-id="' + b.id + '">' + esc(t("start_job")) + "</button>" :
          '<button class="btn solid block" data-act="complete" data-id="' + b.id + '">' + icon("check") + esc(t("finish_job")) + "</button>") :
        b.review ? '<p class="stars">' + stars(b.review.rating) + (b.review.comment ? " · " + esc(b.review.comment) : "") + "</p>" : "") + "</article>").join("");
  }
  function vEarnings() {
    const jobs = (S.data.jobs || []).filter((b) => b.status === "completed");
    const m0 = new Date(); m0.setDate(1); m0.setHours(0, 0, 0, 0);
    const month = jobs.filter((b) => Date.parse(b.completed_at) >= m0.getTime());
    const sum = (a) => a.reduce((s, b) => s + (Number(b.budget) || 0), 0);
    const w = S.me.worker;
    return '<h1 class="title">' + esc(t("tab_earnings")) + "</h1>" +
      '<div class="tiles">' + tile(t("earn_month"), money(sum(month)), "lime") + tile(t("earn_total"), money(sum(jobs))) + tile(t("jobs_done"), w.jobs_done) +
      tile(t("rating"), w.rating_count ? Number(w.rating_avg).toFixed(1) + " ★" : "—") + "</div>" +
      '<p class="fine">' + esc(t("earn_note")) + "</p>" +
      jobs.map((b) => '<div class="line"><span>' + esc(b.code) + " · " + esc(svcName(b.service)) + "<small>" + esc(when(b.completed_at)) + "</small></span><b>" + money(b.budget) + "</b></div>").join("");
  }
  function tile(label, value, cls, act) {
    return "<div class=\"tile " + (cls || "") + "\"" + (act ? ' data-act="tab" data-tab="' + act + '" role="button" tabindex="0"' : "") + "><b>" + esc(value) + "</b><span>" + esc(label) + "</span></div>";
  }
  function vProfile() {
    const w = S.me.worker, p = S.me.profile;
    const docs = S.data.docs || [];
    return '<h1 class="title">' + esc(t("tab_profile")) + "</h1>" + statusBanner(w) +
      '<section class="card"><p class="label">' + esc(t("reviews_mine")) + "</p>" + reviewsPanel(S.data.myReviews) + "</section>" +
      '<form class="form stack" data-form="profile" novalidate>' +
      '<div class="card"><p class="label">' + esc(t("work_type")) + "</p>" + seg("kind", [["individual", t("individual")], ["company", t("company")]], w.kind) +
      (w.kind === "company" ? field("company_name", t("company_name"), "text", 'maxlength="120"', null, w.company_name) + field("team_size", t("team_size"), "number", 'min="1" max="500" inputmode="numeric"', null, w.team_size) : "") +
      field("full_name", t("full_name"), "text", 'required maxlength="120"', null, p.full_name) +
      field("phone", t("phone"), "tel", 'required inputmode="tel" maxlength="20"', null, p.phone) +
      '<label class="field"><span>' + esc(t("bio")) + '</span><textarea name="bio" rows="3" maxlength="600">' + esc(w.bio) + "</textarea></label></div>" +
      '<div class="card">' + field("zips", t("zips_served"), "text", 'inputmode="numeric" required', t("zips_hint"), w.zips.join(", ")) + "</div>" +
      '<div class="card"><p class="label">' + esc(t("services_offered")) + "</p>" + chips("services", ALL_SERVICES.map((s) => [s, svcName(s)]), w.services, true) + "</div>" +
      '<div class="card"><p class="label">' + esc(t("languages")) + "</p>" + chips("languages", LANGS.map((l) => [l, t("lang_" + l)]), w.languages, true) +
      field("years_experience", t("experience_years"), "number", 'min="0" max="60" inputmode="numeric"', null, w.years_experience) + "</div>" +
      '<div class="card">' + toggle("has_transport", t("transport"), w.has_transport) + toggle("has_equipment", t("equipment"), w.has_equipment) + toggle("has_insurance", t("insurance"), w.has_insurance) + toggle("whatsapp_opt_in", t("wa_opt_in"), w.whatsapp_opt_in) + "</div>" +
      '<div class="card"><p class="label">' + esc(t("rate_type")) + "</p>" + seg("rate_type", [["hourly", t("hourly")], ["fixed", t("fixed")]], w.rate_type) +
      (w.rate_type === "hourly" ? field("hourly_rate", t("hourly_rate"), "number", 'min="0" max="1000" step="1" inputmode="decimal"', null, w.hourly_rate == null ? "" : w.hourly_rate) : "") + "</div>" +
      '<button class="btn solid block xl" type="submit">' + esc(t("save")) + "</button></form>" +
      '<div class="card"><p class="label">' + icon("file") + esc(t("documents")) + '</p><p class="fine">' + esc(API.mode === "demo" ? t("docs_demo") : t("docs_hint")) + "</p>" +
      (docs.length ? '<ul class="docs">' + docs.map((d) => "<li>" + icon("file") + esc(d.name) + "</li>").join("") + "</ul>" : "") +
      '<label class="btn ghost block file-btn">' + esc(t("upload")) + '<input type="file" data-act="upload" accept="image/*,application/pdf" hidden></label></div>' +
      vAccountMini();
  }
  function vAccountMini() {
    return '<div class="card"><label class="field"><span>' + esc(t("language")) + '</span><select data-act="setlang-profile">' + LANGS.map((l) => '<option value="' + l + '"' + (S.me.profile.language === l ? " selected" : "") + ">" + esc(t("lang_" + l)) + "</option>").join("") + "</select></label></div>" +
      '<button class="btn ghost block" data-act="signout">' + icon("out") + esc(t("sign_out")) + "</button>" +
      (API.mode === "demo" ? '<button class="link-btn center" data-act="demoreset">Reset demo</button>' : "");
  }

  // ── admin ──
  function rules(s) {
    const L = lang === "es";
    const out = [];
    if (!s) return out;
    if (s.bookings_unmatched > 0) out.push({ level: "urgent", text: L ? "Pedidos sin limpiador disponible: " + s.bookings_unmatched + ". Asígnalos a mano en Pedidos." : "Orders with no available cleaner: " + s.bookings_unmatched + ". Assign them in Orders.", tab: "bookings" });
    if (s.workers_pending > 0) out.push({ level: "warn", text: L ? "Limpiadores esperando tu aprobación: " + s.workers_pending + "." : "Cleaners waiting for approval: " + s.workers_pending + ".", tab: "workers" });
    if (s.bookings_open > 0 && s.workers_online < Math.max(2, s.bookings_open)) out.push({ level: "warn", text: L ? "Hay más pedidos abiertos (" + s.bookings_open + ") que limpiadores disponibles (" + s.workers_online + "). Avisa por WhatsApp a tu equipo." : "More open orders (" + s.bookings_open + ") than available cleaners (" + s.workers_online + "). Message your team on WhatsApp.", tab: "bookings" });
    if (s.low_reviews_30d > 0) out.push({ level: "urgent", text: L ? "Calificaciones de 1–2 estrellas este mes: " + s.low_reviews_30d + ". Llama a esos clientes." : "1–2 star reviews this month: " + s.low_reviews_30d + ". Call those customers.", tab: "bookings" });
    if (s.top_zips_open && s.top_zips_open.length) out.push({ level: "info", text: (L ? "Más demanda abierta en ZIP " : "Most open demand in ZIP ") + s.top_zips_open.map((z) => z.zip + " (" + z.n + ")").join(", ") + (L ? ". Recluta limpiadores ahí." : ". Recruit cleaners there.") });
    if (s.whatsapp_queued > 0) out.push({ level: "info", text: t("queued_msgs", { n: s.whatsapp_queued }) + ".", tab: "connectors" });
    if (s.bookings_completed_30d > 0) out.push({ level: "good", text: (L ? "Últimos 30 días · completados: " : "Last 30 days · completed: ") + s.bookings_completed_30d + (L ? " · ventas: " : " · sales: ") + money(s.gmv_30d) + (s.avg_rating ? " · " + s.avg_rating + " ★" : "") + "." });
    if (!out.length) out.push({ level: "good", text: L ? "Todo al día. Comparte el enlace de la app para atraer clientes y limpiadores." : "All caught up. Share the app link to bring in customers and cleaners." });
    const order = { urgent: 0, warn: 1, info: 2, good: 3 };
    return out.sort((a, b) => order[a.level] - order[b.level]);
  }
  function vPanel() {
    const s = S.data.stats;
    if (!s) return loading();
    const items = S.data.ai || rules(s);
    const an = S.data.an;
    const hr = new Date().getHours();
    const hello = (lang === "es" ? (hr < 12 ? "Buenos días" : hr < 19 ? "Buenas tardes" : "Buenas noches") : (hr < 12 ? "Good morning" : hr < 19 ? "Good afternoon" : "Good evening")) + ", " + esc((S.me.profile.full_name || "").split(" ")[0]);
    const today = new Date().toLocaleDateString(lang === "es" ? "es-US" : "en-US", { weekday: "long", month: "long", day: "numeric" });
    const week = an ? an.series.slice(-7).reduce((x, d) => x + d.created, 0) : null;
    const hero = '<section class="owner-hero"><div><p class="eyebrow">' + icon("shield") + esc(t("owner_panel")) + "</p><h1>" + hello + "</h1><p class=\"muted\">" + esc(today) + "</p></div>" +
      (an ? '<div class="hero-spark"><b>' + week + "</b><small>" + esc(lang === "es" ? "pedidos · 7 días" : "orders · 7 days") + "</small>" + owner().spark(an.series, "created") + "</div>" : "") + "</section>";
    const quick = '<div class="quick">' + [["analytics", "chart", t("tab_analytics")], ["system", "grid", lang === "es" ? "Arquitectura" : "Architecture", "architecture"], ["system", "spark", lang === "es" ? "Mejoras" : "Improvements", "improve"], ["system", "users", lang === "es" ? "Clientes" : "Customers", "customers"]]
      .map(([tb, ic, lb, sy]) => '<button class="q" data-act="' + (sy ? "sys" : "tab") + '" data-tab="' + tb + '" data-s="' + (sy || "") + '">' + icon(ic) + "<span>" + esc(lb) + "</span></button>").join("") + "</div>";
    return hero + brainCard("owner") + quick +
      '<section class="ceo card"><div class="row between"><p class="eyebrow">' + icon("spark") + esc(t("ai_ceo")) + " · " + esc(t("ai_briefing")) + '</p><span class="pill">' + esc(S.data.ai ? t("ai_live") : t("ai_rules")) + "</span></div>" +
      '<ul class="brief">' + items.map((i) => '<li class="' + esc(i.level) + '"' + (i.tab ? ' data-act="tab" data-tab="' + i.tab + '" role="button" tabindex="0"' : "") + "><i></i><span>" + esc(i.text) + "</span></li>").join("") + "</ul></section>" +
      '<div class="tiles">' + tile(t("m_unmatched"), s.bookings_unmatched, s.bookings_unmatched ? "bad" : "", "bookings") + tile(t("m_pending"), s.workers_pending, s.workers_pending ? "warn" : "", "workers") +
      tile(t("m_open"), s.bookings_open, "", "bookings") + tile(t("m_active"), s.bookings_active, "", "bookings") +
      tile(t("m_workers_online"), s.workers_online + "/" + s.workers_approved, "lime", "workers") + tile(t("m_customers"), s.customers) +
      tile(t("m_done30"), s.bookings_completed_30d) + tile(t("m_gmv"), money(s.gmv_30d), "lime") + "</div>" +
      '<button class="btn ghost block" data-act="reload">' + esc(t("refresh")) + "</button>";
  }
  // keep the old title out of the new hero layout
  function vWorkers() {
    const all = S.data.workers;
    if (S.data.loading && !all) return loading();
    const f = S.filter;
    const list = (all || []).filter((w) => f === "all" || w.status === f);
    const count = (s) => (all || []).filter((w) => w.status === s).length;
    return '<h1 class="title">' + esc(t("tab_workers")) + "</h1>" +
      '<div class="chips scroll">' + ["pending", "approved", "suspended", "rejected", "all"].map((s) => '<button class="chip-btn' + (f === s ? " on" : "") + '" data-act="wfilter" data-f="' + s + '">' + esc(s === "all" ? t("filter_all") : t("st_" + s)) + (s !== "all" ? " " + count(s) : "") + "</button>").join("") + "</div>" +
      (!list.length ? empty("users", t("no_workers")) : list.map((w) => '<article class="card cleaner">' +
        '<div class="person"><div class="avatar">' + esc((w.full_name || "?")[0]) + "</div><div><b>" + esc(w.full_name) + "</b>" + (w.kind === "company" ? "<small>" + esc(w.company_name || t("company")) + " · " + w.team_size + "</small>" : "") +
        "<small>" + esc(w.email) + " · " + esc(w.phone) + '</small></div><span class="pill st-' + w.status + '">' + esc(t("st_" + w.status)) + "</span></div>" +
        '<p class="tags">' + [t("years", { n: w.years_experience }), t("jobs", { n: w.jobs_done })].concat(w.rating_count ? [Number(w.rating_avg).toFixed(1) + " ★ (" + w.rating_count + ")"] : [])
          .concat(w.has_insurance ? [t("insured")] : []).concat(w.has_transport ? [t("transport")] : []).concat(w.available ? [t("online")] : []).map((x) => "<span>" + esc(x) + "</span>").join("") + "</p>" +
        '<p class="tags soft"><span>ZIP: ' + esc(w.zips.join(", ") || "—") + "</span>" + w.services.map((s) => "<span>" + esc(svcName(s)) + "</span>").join("") + w.languages.map((l) => "<span>" + esc(t("lang_" + l)) + "</span>").join("") + "</p>" +
        (w.bio ? '<p class="bio">' + esc(w.bio) + "</p>" : "") +
        '<div class="row gap wrap-row">' +
        (w.status !== "approved" ? '<button class="btn solid small" data-act="wstatus" data-id="' + w.id + '" data-s="approved">' + esc(w.status === "suspended" ? t("reactivate") : t("approve")) + "</button>" : '<button class="btn ghost small" data-act="wstatus" data-id="' + w.id + '" data-s="suspended">' + esc(t("suspend")) + "</button>") +
        (w.status === "pending" ? '<button class="btn ghost small" data-act="wstatus" data-id="' + w.id + '" data-s="rejected">' + esc(t("reject")) + "</button>" : "") +
        '<a class="btn wa small" target="_blank" rel="noopener" href="' + wa(w.phone, t("wa_msg_worker", { name: (w.full_name || "").split(" ")[0] })) + '">' + icon("chat") + "WhatsApp</a>" +
        '<button class="btn ghost small" data-act="docs" data-id="' + w.id + '">' + icon("file") + esc(t("view_docs")) + "</button></div>" +
        '<div class="docs-slot" id="docs-' + w.id + '"></div></article>').join(""));
  }
  function offerText(b) {
    return t("wa_msg_offer", { code: b.code, service: svcName(b.service), area: (b.city ? b.city + " " : "") + b.zip, when: b.urgency === "asap" ? t("asap") : when(b.scheduled_at), pay: money(b.budget), url: CFG.APP_URL || location.href });
  }
  // Owner-only live map: cleaners currently sharing location on jobs in progress, filtered by ZIP (empty = all).
  function liveMapCard() {
    const jobs = S.data.live;
    let html = '<section class="card stack"><p class="label">' + icon("pin") + esc(t("live_map")) + '</p><form class="row gap" data-form="livemap"><input name="zip" inputmode="numeric" maxlength="5" placeholder="' + esc(t("search_zip")) + '" value="' + esc(S.form.liveZip || "") + '" aria-label="' + esc(t("search_zip")) + '"><button class="btn solid small" type="submit">OK</button></form>' + (/^\d{5}$/.test(S.form.liveZip || "") ? '<p><a class="btn ghost small" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(S.form.liveZip + " FL") + '">' + esc(t("zip_on_map")) + "</a></p>" : "");
    if (!jobs) return html + '<p class="muted">' + esc(t("live_hint")) + "</p></section>";
    if (!jobs.length) return html + '<p class="muted">' + esc(t("live_none")) + "</p></section>";
    const lats = jobs.map((j) => j.lat), lngs = jobs.map((j) => j.lng), c = jobs[0];
    const bbox = [Math.min(...lngs) - 0.01, Math.min(...lats) - 0.01, Math.max(...lngs) + 0.01, Math.max(...lats) + 0.01].join(",");
    html += '<div class="job-map"><iframe title="' + esc(t("live_map")) + '" loading="lazy" src="https://www.openstreetmap.org/export/embed.html?bbox=' + bbox + "&layer=mapnik&marker=" + c.lat + "," + c.lng + '"></iframe></div>';
    html += jobs.map((j) => '<p class="row between"><span><b>' + esc(j.code) + "</b> · " + esc(j.worker || "") + ' · <small data-since="' + esc(j.location_at) + '">' + esc(t("loc_now")) + "</small></span>" +
      '<span class="row gap"><a class="btn ghost small" target="_blank" rel="noopener" href="https://www.google.com/maps?q=' + encodeURIComponent(j.lat + "," + j.lng) + '">Google Maps</a><a class="btn ghost small" target="_blank" rel="noopener" href="https://earth.google.com/web/search/' + encodeURIComponent(j.lat + "," + j.lng) + '">Google Earth</a></span></p>').join("");
    return html + "</section>";
  }

  function vAdminBookings() {
    const all = S.data.bookings;
    if (S.data.loading && !all) return loading();
    const groups = { open: ["requested", "offered"], active: ["assigned", "in_progress"], done: ["completed", "cancelled"], all: null };
    const f = S.bfilter;
    const list = (all || []).filter((b) => !groups[f] || groups[f].includes(b.status));
    const approved = (S.data.workers || []).filter((w) => w.status === "approved");
    const label = { open: t("m_open"), active: t("m_active"), done: t("st_completed"), all: t("filter_all") };
    return '<h1 class="title">' + esc(t("tab_bookings")) + "</h1>" + liveMapCard() +
      '<div class="chips scroll">' + Object.keys(groups).map((g) => '<button class="chip-btn' + (f === g ? " on" : "") + '" data-act="bfilter" data-f="' + g + '">' + esc(label[g]) + " " + (all || []).filter((b) => !groups[g] || groups[g].includes(b.status)).length + "</button>").join("") + "</div>" +
      (!list.length ? empty("list", t("no_bookings")) : list.map((b) => '<article class="card order' + (b.status === "requested" ? " hot" : "") + '">' +
        '<div class="row between"><b class="code">' + esc(b.code) + '</b><span class="pill st-' + b.status + '">' + esc(t("st_" + b.status)) + "</span></div>" +
        "<h3>" + esc(svcName(b.service)) + ' <small class="muted">· ' + esc(t(b.segment)) + "</small></h3>" +
        '<p class="meta">' + icon("clock") + esc(b.urgency === "asap" ? t("asap") : when(b.scheduled_at)) + " · " + icon("pin") + esc([b.city, b.zip].filter(Boolean).join(" ")) + " · " + money(b.budget) + "</p>" +
        '<p class="small">' + esc(t("customer")) + ": <b>" + esc(b.customer.name) + "</b> · " + '<a href="' + tel(b.customer.phone) + '">' + esc(b.customer.phone) + "</a></p>" +
        (b.worker ? '<p class="small">' + esc(t("cleaner")) + ": <b>" + esc(b.worker.name) + "</b></p>" : "") +
        (b.offers.length ? '<details class="offers"><summary>' + esc(t("offers")) + " (" + b.offers.length + ")</summary><ul>" + b.offers.map((o) => "<li><span>" + esc(o.name) + ' <small class="muted">' + o.score + " · " + esc(o.status) + "</small></span>" +
          (o.status === "sent" ? '<a class="btn wa tiny" target="_blank" rel="noopener" href="' + wa(o.phone, offerText(b)) + '">' + icon("chat") + esc(t("wa_notify")) + "</a>" : "") + "</li>").join("") + "</ul></details>" : "") +
        (["requested", "offered", "assigned"].includes(b.status) ? '<div class="assign"><select data-assign="' + b.id + '" aria-label="' + esc(t("assign_to")) + '"><option value="">' + esc(t("assign_to")) + "</option>" +
          approved.map((w) => '<option value="' + w.id + '"' + (b.worker_id === w.id ? " selected" : "") + ">" + esc(w.full_name + (w.company_name ? " · " + w.company_name : "") + (w.zips.includes(b.zip) ? " ✓ZIP" : "") + (w.available ? "" : " (off)")) + "</option>").join("") +
          '</select><button class="btn solid small" data-act="assign" data-id="' + b.id + '">' + esc(t("assign")) + "</button></div>" +
          '<div class="row gap wrap-row">' + (b.status !== "assigned" ? '<button class="btn ghost small" data-act="redispatch" data-id="' + b.id + '">' + esc(t("redispatch")) + "</button>" : "") +
          '<button class="link-btn danger" data-act="cancel" data-id="' + b.id + '">' + esc(t("cancel_order")) + "</button></div>" : "") + "</article>").join(""));
  }
  function vConnectors() {
    const s = S.data.stats || {};
    const live = API.mode === "live";
    const row = (ic, name, state, cls, desc) => '<div class="conn"><div class="conn-ic">' + icon(ic) + "</div><div><b>" + esc(name) + '</b><p class="muted">' + esc(desc) + '</p></div><span class="pill ' + cls + '">' + esc(state) + "</span></div>";
    return '<h1 class="title">' + esc(t("tab_connectors")) + "</h1>" +
      '<div class="card stack">' +
      row("shield", t("conn_db"), live ? t("conn_ready") : "Demo", live ? "ok" : "warn", live ? t("conn_db_live") : t("conn_db_demo")) +
      row("chat", t("conn_whatsapp"), t("conn_manual"), "ok", t("conn_wa_desc") + (s.whatsapp_queued ? " " + t("queued_msgs", { n: s.whatsapp_queued }) + "." : "")) +
      row("phone", t("conn_sms"), t("conn_phase2"), "", t("conn_sms_desc")) +
      row("bell", t("conn_email"), t("conn_phase2"), "", t("conn_email_desc")) +
      row("spark", t("conn_ai"), S.data.ai ? t("conn_ready") : t("ai_rules"), S.data.ai ? "ok" : "", t("conn_ai_desc")) +
      row("cash", t("conn_payments"), t("conn_phase2"), "", t("conn_pay_desc")) +
      row("pin", t("conn_maps"), "ZIP", "", t("conn_maps_desc")) + "</div>";
  }

  // ── notifications sheet ──
  function openNotes() {
    const items = S.notes;
    const sheet = document.createElement("div");
    sheet.className = "sheet-wrap";
    sheet.innerHTML = '<div class="sheet" role="dialog" aria-modal="true" aria-label="' + esc(t("notifications")) + '"><div class="row between"><h2>' + esc(t("notifications")) + '</h2><button class="chip-btn" data-close>' + esc(t("close")) + "</button></div>" +
      (items.length ? '<ul class="notes">' + items.map((n) => '<li class="' + (n.read_at ? "" : "new") + '"><b>' + esc(t("n_" + n.template, { code: (n.payload && n.payload.code) || "" })) + "</b><small>" + esc(when(n.created_at)) + "</small></li>").join("") + "</ul>" : '<p class="muted">' + esc(t("no_notifications")) + "</p>") + "</div>";
    document.body.appendChild(sheet);
    const close = () => { sheet.remove(); };
    sheet.addEventListener("click", (e) => { if (e.target === sheet || e.target.closest("[data-close]")) close(); });
    document.addEventListener("keydown", function k(e) { if (e.key === "Escape") { close(); document.removeEventListener("keydown", k); } });
    sheet.querySelector("[data-close]").focus();
    API.markRead().then(loadNotes).catch(() => {});
  }

  // ───────── events ─────────
  function formData(form) {
    const o = {};
    new FormData(form).forEach((v, k) => { if (o[k] === undefined) o[k] = v; else o[k] = [].concat(o[k], v); });
    return o;
  }
  const arr = (v) => v == null ? [] : [].concat(v);

  root.addEventListener("click", async (e) => {
    const el = e.target.closest("[data-act]");
    if (!el || el.tagName === "INPUT" || el.tagName === "SELECT") return;
    const a = el.dataset.act, id = el.dataset.id;
    if (el.tagName === "A") return;
    e.preventDefault();
    if (a === "lang") { lang = lang === "es" ? "en" : "es"; store.set("wcia_lang", lang); document.documentElement.lang = lang; render(); }
    else if (a === "auth") { S.authRole = el.dataset.role; S.form.kind = "individual"; S.screen = "signup"; render(); }
    else if (a === "signin") { S.screen = "signin"; render(); }
    else if (a === "agentsall") { const off = ((S.data && S.data.agents) || []).filter((x) => x.status !== "active"); try { for (const x of off) await API.adminSetAgentStatus(x.agent, "active"); toast(t("saved")); } catch (err) { console.error(err); toast(t("error_generic"), "bad"); } loadTab(true); }
    else if (a === "devforget" || a === "devforgetall") { try { await API.revokeDevices(a === "devforgetall"); toast(t("saved")); } catch (err) { console.error(err); } loadTab(true); }
    else if (a === "guest") {
      try { await API.guestStart(lang); S.me = await API.me(); startRole(); }
      catch (err) { console.error(err); S.authRole = "customer"; S.form.kind = "individual"; S.screen = "signup"; render(); } // guest not available: normal sign-up
    }
    else if (a === "brainmic") brainListen(el.dataset.role);
    else if (a === "reviews") { S.rv = { name: el.dataset.name || "", data: null }; render(); try { S.rv.data = await API.workerReviews(el.dataset.id); } catch (err) { console.error(err); S.rv.data = { avg: 0, count: 0, dist: {}, items: [] }; } render(); }
    else if (a === "rvclose") { S.rv = null; render(); }
    else if (a === "verifycancel") { S.verify = null; render(); }
    else if (a === "verifyback") { S.verify = Object.assign({}, S.verify, { step: "email" }); render(); }
    else if (a === "skipmfa") { S.skipMfa = true; S.mfa = null; startRole(); }
    else if (a === "forgot") { S.screen = "forgot"; render(); }
    else if (a === "home") { S.screen = "landing"; render(); }
    else if (a === "demo") { await API.demoLogin(el.dataset.kind); S.me = await API.me(); startRole(); }
    else if (a === "demoreset") { await API.demoReset(); S.me = null; S.screen = "landing"; S.form = {}; render(); }
    else if (a === "tab") { S.tab = el.dataset.tab; store.set("wcia_tab_" + role(), S.tab); S.data = {}; loadTab(); }
    else if (a === "notes") openNotes();
    else if (a === "signout") { await API.signOut(); S.me = null; S.screen = "landing"; S.form = {}; render(); }
    else if (a === "reload") loadTab();
    else if (a === "step") {
      const inp = root.querySelector('input[name="' + el.dataset.name + '"]');
      inp.value = Math.max(+inp.min, Math.min(+inp.max, (+inp.value || 0) + +el.dataset.d));
      inp.dispatchEvent(new Event("change", { bubbles: true }));
    }
    else if (a === "clearpref") { S.form.book.preferred_worker_id = null; render(); }
    else if (a === "prefer") {
      const c = (S.data.cleaners || []).find((x) => x.id === id);
      S.form.prefCleaner = c;
      S.form.book = Object.assign(S.form.book || { segment: "residential", service: "standard", bedrooms: 2, bathrooms: 1, frequency: "once", urgency: "scheduled" }, { preferred_worker_id: id, zip: S.form.dirZip || (S.form.book && S.form.book.zip) || "" });
      if (c && !c.services.includes(S.form.book.service)) { S.form.book.service = c.services[0]; S.form.book.segment = SERVICES.residential.includes(c.services[0]) ? "residential" : "commercial"; }
      S.tab = "book"; S.data = {}; render(); loadTab(true);
    }
    else if (a === "cancel") {
      if (!confirm(t("confirm_cancel"))) return;
      await run(() => API.cancelBooking(id)).catch(() => {}); loadTab(true);
    }
    else if (a === "accept") {
      const r = await run(() => API.acceptOffer(id)).catch(() => null);
      if (r === "assigned") toast(t("job_accepted"), "ok"); else if (r === "taken") toast(t("job_taken"), "bad");
      loadTab(true);
    }
    else if (a === "decline") { await run(() => API.declineOffer(id)).catch(() => {}); loadTab(true); }
    else if (a === "start") { await run(() => API.startJob(id)).catch(() => {}); loadTab(true); }
    else if (a === "complete") { stopSharing(); await run(() => API.completeJob(id)).catch(() => {}); loadTab(true); }
    else if (a === "wfilter") { S.filter = el.dataset.f; render(); }
    else if (a === "range") { S.range = Number(el.dataset.d); S.data.an = null; render(); loadTab(true); }
    else if (a === "sys") { S.tab = "system"; S.sys = el.dataset.s || "architecture"; store.set("wcia_tab_" + role(), "system"); S.data = {}; loadTab(); }
    else if (a === "agentstatus") { await run(() => API.adminSetAgentStatus(el.dataset.agent, el.dataset.s), t("saved")).catch(() => {}); loadTab(true); }
    else if (a === "decide") {
      const reason = (root.querySelector('[data-reason="' + id + '"]') || {}).value || "";
      if (el.dataset.s === "rejected" && reason.trim().length < 3) { root.querySelector('[data-reason="' + id + '"]').focus(); return; }
      await run(() => API.adminDecideApproval(id, el.dataset.s, reason.trim()), t("saved")).catch(() => {}); loadTab(true);
    }
    else if (a === "ask") {
      const box = root.querySelector("#agent-ask");
      const text = ((box && box.value) || "").trim();
      if (text.length < 3) { if (box) box.focus(); return; }
      const answer = await askAgents(text).catch((e) => ({ error: String((e && e.message) || e).slice(0, 160) }));
      S.data = Object.assign({}, S.data, { answer });
      render();
      loadTab(true);
    }
    else if (a === "bfilter") { S.bfilter = el.dataset.f; render(); }
    else if (a === "wstatus") { await run(() => API.adminSetWorkerStatus(id, el.dataset.s), t("saved")).catch(() => {}); loadTab(true); }
    else if (a === "assign") {
      const sel = root.querySelector('[data-assign="' + id + '"]');
      if (!sel.value) { sel.focus(); return; }
      await run(() => API.adminAssign(id, sel.value), t("saved")).catch(() => {}); loadTab(true);
    }
    else if (a === "redispatch") { const n = await run(() => API.adminRedispatch(id)).catch(() => null); if (n != null) toast(t("sent_to", { n }), n ? "ok" : "bad"); loadTab(true); }
    else if (a === "docs") {
      const slot = $("#docs-" + id);
      const docs = await API.listDocs(id).catch(() => []);
      slot.innerHTML = docs.length ? '<ul class="docs">' + docs.map((d) => '<li><button class="link-btn" data-act="opendoc" data-path="' + esc(d.path) + '">' + icon("file") + esc(d.name) + "</button></li>").join("") + "</ul>" : '<p class="muted">' + esc(t("no_docs")) + "</p>";
    }
    else if (a === "opendoc") { const u = await API.docUrl(el.dataset.path); if (u) window.open(u, "_blank", "noopener"); }
  });
  // Chart tooltips: hover on desktop, tap on phones.
  const tipEl = document.createElement("div"); tipEl.className = "tip"; tipEl.setAttribute("role", "tooltip"); document.body.appendChild(tipEl);
  function showTip(e) {
    const el = e.target.closest && e.target.closest("[data-tip]");
    if (!el) { tipEl.classList.remove("in"); return; }
    tipEl.textContent = el.dataset.tip;
    const r = el.getBoundingClientRect();
    tipEl.classList.add("in");
    const w = tipEl.offsetWidth;
    tipEl.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2)) + "px";
    tipEl.style.top = Math.max(8, r.top - tipEl.offsetHeight - 8) + "px";
  }
  // 3D tilt for the landing logo: follows the mouse while it hovers over the logo
  root.addEventListener("pointermove", (e) => {
    if (e.pointerType !== "mouse") return;
    const stage = e.target.closest && e.target.closest(".logo-stage");
    if (!stage) return;
    const img = stage.querySelector(".hero-logo"), r = img.getBoundingClientRect();
    const x = Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / r.width));
    const y = Math.max(-1, Math.min(1, (e.clientY - (r.top + r.height / 2)) / r.height));
    img.style.setProperty("--ry", (x * 30).toFixed(1) + "deg");
    img.style.setProperty("--rx", (-y * 22).toFixed(1) + "deg");
  });
  root.addEventListener("pointerout", (e) => {
    const stage = e.target.closest && e.target.closest(".logo-stage");
    if (!stage || stage.contains(e.relatedTarget)) return;
    const img = stage.querySelector(".hero-logo");
    img.style.removeProperty("--rx");
    img.style.removeProperty("--ry");
  });
  root.addEventListener("mouseover", showTip);
  root.addEventListener("pointerdown", (e) => { if (e.pointerType !== "mouse") showTip(e); });
  root.addEventListener("mouseleave", () => tipEl.classList.remove("in"));
  window.addEventListener("scroll", () => tipEl.classList.remove("in"), { passive: true });
  root.addEventListener("keydown", (e) => {
    if ((e.key === "Enter" || e.key === " ") && e.target.matches('[role="button"][data-act]')) { e.preventDefault(); e.target.click(); }
  });

  root.addEventListener("change", async (e) => {
    const el = e.target;
    if (el.dataset.act === "avail") {
      const on = el.checked;
      await run(() => API.saveWorker(S.me.profile.id, { available: on })).catch(() => {});
      await refreshMe(); loadTab(true);
    } else if (el.dataset.act === "upload" && el.files && el.files[0]) {
      const f = el.files[0];
      if (f.size > 10 * 1024 * 1024) { toast("Max 10 MB", "bad"); return; }
      await run(() => API.uploadDoc(S.me.profile.id, f), t("saved")).catch(() => {});
      loadTab(true);
    } else if (el.dataset.act === "setlang-profile") {
      await run(() => API.saveProfile(S.me.profile.id, Object.assign({}, S.me.profile, { language: el.value })), t("saved")).catch(() => {});
      await refreshMe();
    } else if (el.form && el.form.dataset.form === "book") {
      syncBook(el.form);
      if (["segment", "urgency", "service", "bedrooms", "bathrooms", "sqft"].includes(el.name)) {
        const f = S.form.book;
        if (el.name === "segment") { f.service = SERVICES[f.segment][0]; f.frequency = "once"; }
        if (["segment", "service", "bedrooms", "bathrooms", "sqft"].includes(el.name)) { const sg = suggest(f); f.hours_est = sg.hours; f.budget = sg.budget; }
        render();
      }
    } else if (el.form && el.form.dataset.form === "profile" && ["kind", "rate_type"].includes(el.name)) {
      S.me.worker[el.name] = el.value; render();
    } else if (el.form && el.form.dataset.form === "signup" && el.name === "kind") {
      S.form.kind = el.value; root.querySelectorAll(".company-only").forEach((x) => x.classList.toggle("hide", el.value !== "company"));
    }
  });
  root.addEventListener("input", (e) => { const el = e.target; if (el.form && el.form.dataset.form === "book") syncBook(el.form); });
  // Google Maps link for the ZIP area only (never the street address). Shown as soon as 5 digits are typed.
  function zipMapHtml(z) {
    return /^\d{5}$/.test(String(z || ""))
      ? '<a class="btn ghost small" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(z + " FL") + '">' + esc(t("zip_on_map")) + "</a>"
      : "";
  }
  // Route + distance link for the address. No origin is set, so Google Maps uses the device's own location when it opens.
  function addrMapHtml(f) {
    const a = String(f.address || "").trim();
    if (a.length < 5) return "";
    const dest = [a, f.city, f.zip, "FL"].filter(Boolean).join(", ");
    return '<a class="btn ghost small" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(dest) + '&travelmode=driving">' + esc(t("addr_route")) + "</a>";
  }
  function syncBook(form) {
    const d = formData(form);
    const f = S.form.book;
    ["segment", "service", "frequency", "zip", "city", "address", "urgency", "scheduled_at", "notes", "property_type"].forEach((k) => { if (d[k] !== undefined) f[k] = d[k]; });
    ["bedrooms", "bathrooms", "sqft", "hours_est", "budget"].forEach((k) => { if (d[k] !== undefined) f[k] = d[k] === "" ? "" : Number(d[k]); });
    const zm = document.getElementById("zipMap");
    if (zm) zm.innerHTML = zipMapHtml(f.zip);
    const am = document.getElementById("addrMap");
    if (am) am.innerHTML = addrMapHtml(f);
  }

  root.addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.target, kind = form.dataset.form, d = formData(form);
    if (kind === "brain") { await brainAsk(form); return; }
    const invalid = [...form.querySelectorAll("input[required]")].find((i) => !i.checkValidity());
    if (invalid && kind !== "dir") { invalid.focus(); invalid.reportValidity && invalid.reportValidity(); return; }
    try {
      if (kind === "signup") {
        const r = await run(() => API.signUp({ email: d.email.trim(), password: d.password, role: S.authRole, full_name: d.full_name.trim(), phone: d.phone.trim(), language: lang, kind: d.kind || "individual", company_name: (d.company_name || "").trim() }));
        if (r && r.confirmed) { S.me = await API.me(); afterLogin(); } else { S.screen = "checkemail"; render(); }
      } else if (kind === "signin") {
        await run(() => API.signIn({ email: d.email.trim(), password: d.password }));
        S.me = await API.me(); afterLogin();
      } else if (kind === "forgot") {
        await run(() => API.resetPassword(d.email.trim()), t("reset_sent")); S.screen = "signin"; render();
      } else if (kind === "newpass") {
        await run(() => API.setPassword(d.password), t("saved")); S.me = await API.me(); afterLogin();
      } else if (kind === "mfa") {
        await run(() => API.mfaVerify(S.mfa.factorId, d.code, !!d.remember));
        S.me = await API.me(); S.mfa = null; startRole();
      } else if (kind === "book") {
        syncBook(form);
        const f = S.form.book;
        if (!/^\d{5}$/.test(f.zip || "")) { toast(t("zip_invalid"), "bad"); form.zip.focus(); return; }
        if (f.urgency === "scheduled" && !f.scheduled_at) { toast(t("date_needed"), "bad"); form.scheduled_at && form.scheduled_at.focus(); return; }
        let guestInfo = null;
        if (S.me.isGuest) {
          const gn = String(d.g_name || "").trim(), gp = String(d.g_phone || "").trim();
          if (gn.length < 2) { toast(t("guest_name_needed"), "bad"); form.g_name && form.g_name.focus(); return; }
          if (digits(gp).length < 10) { toast(t("guest_phone_needed"), "bad"); form.g_phone && form.g_phone.focus(); return; }
          guestInfo = { gn, gp };
        }
        const res = f.segment === "residential";
        const row = {
          segment: f.segment, service: f.service, frequency: f.frequency, zip: f.zip, city: (f.city || "").trim(), address: (f.address || "").trim(),
          urgency: f.urgency, scheduled_at: f.urgency === "scheduled" ? new Date(f.scheduled_at).toISOString() : null,
          bedrooms: res ? Number(f.bedrooms) || 0 : null, bathrooms: res ? Number(f.bathrooms) || 0 : null,
          property_type: res ? "" : (f.property_type || "").trim(), sqft: res ? null : (Number(f.sqft) || null),
          hours_est: Number(f.hours_est) || null, budget: f.budget === "" ? null : Number(f.budget), notes: (f.notes || "").trim(),
          preferred_worker_id: f.preferred_worker_id || null
        };
        if (guestInfo) { S.verify = { step: "email", row, info: guestInfo, phone: "" }; render(); return; } // human check first
        await run(() => API.createBooking(row));
        S.form.book = null; S.form.prefCleaner = null;
        toast(t("request_sent"), "ok");
        S.tab = "orders"; S.data = {}; loadTab();
        toast._later = setTimeout(() => { if (S.tab === "orders") toast(t("request_sent_sub"), "ok"); }, 2700);
      } else if (kind === "verify") {
        const v = S.verify; if (!v) return;
        if (v.step === "email") {
          if (!d.consent) { toast(t("consent_needed"), "bad"); return; }
          if (digits(d.phone).length < 10) { toast(t("guest_phone_needed"), "bad"); return; }
          const byEmail = verifyChannel() === "email";
          if (byEmail && !/^\S+@\S+\.\S+$/.test(String(d.email || "").trim())) { toast(t("email_needed"), "bad"); return; }
          const contact = byEmail ? d.email.trim() : d.phone.trim();
          await run(() => API.verifyStart(contact, verifyChannel()));
          try { await API.recordConsent(LEGAL_VERSION); } catch (err) { console.error(err); }
          S.verify = Object.assign({}, v, { step: "code", channel: verifyChannel(), contact, info: Object.assign({}, v.info, { gp: d.phone.trim(), ge: byEmail ? contact : (v.info.ge || "") }) }); render();
        } else {
          await run(() => API.verifyCode(v.contact, d.code, v.channel));
          S.me = await API.me();
          if (S.me.isGuest) { toast(t("verify_wrong"), "bad"); return; }
          await run(() => API.saveProfile(S.me.profile.id, { full_name: v.info.gn, phone: v.info.gp, language: lang }));
          S.me.profile.full_name = v.info.gn; S.me.profile.phone = v.info.gp;
          await run(() => API.createBooking(v.row));
          S.verify = null; S.form.book = null; S.form.prefCleaner = null;
          toast(t("request_sent"), "ok"); S.tab = "orders"; S.data = {}; loadTab();
        }
      } else if (kind === "upgrade") {
        await run(() => API.upgradeGuest(d.email.trim(), d.password), t("saved")); S.me = await API.me(); loadTab(true);
      } else if (kind === "review") {
        if (!d.rating) { toast(t("rate_service"), "bad"); return; }
        await run(() => API.reviewBooking(form.dataset.id, Number(d.rating), d.comment), t("thanks_review")); loadTab(true);
      } else if (kind === "livemap") {
        S.form.liveZip = (d.zip || "").trim();
        try { S.data.live = await API.adminLiveJobs(S.form.liveZip); } catch (err) { console.error(err); toast(t("error_generic"), "bad"); }
        render();
      } else if (kind === "dir") {
        S.form.dirZip = (d.zip || "").trim(); S.form.dirSvc = d.svc || ""; loadTab();
      } else if (kind === "account") {
        await run(() => API.saveProfile(S.me.profile.id, { full_name: d.full_name.trim(), phone: d.phone.trim(), language: d.language }), t("saved"));
        await refreshMe(); render();
      } else if (kind === "profile") {
        const zips = String(d.zips || "").split(/[^\d]+/).filter((z) => /^\d{5}$/.test(z));
        await run(async () => {
          await API.saveProfile(S.me.profile.id, { full_name: d.full_name.trim(), phone: d.phone.trim(), language: S.me.profile.language });
          await API.saveWorker(S.me.profile.id, {
            kind: d.kind, company_name: (d.company_name || "").trim(), team_size: Number(d.team_size) || 1, bio: (d.bio || "").trim(), zips,
            services: arr(d.services), languages: arr(d.languages).length ? arr(d.languages) : [S.me.profile.language || "es"],
            years_experience: Math.max(0, Math.min(60, Number(d.years_experience) || 0)),
            has_transport: !!d.has_transport, has_equipment: !!d.has_equipment, has_insurance: !!d.has_insurance, whatsapp_opt_in: !!d.whatsapp_opt_in,
            rate_type: d.rate_type, hourly_rate: d.hourly_rate === "" || d.hourly_rate == null ? null : Number(d.hourly_rate)
          });
        }, t("saved"));
        await refreshMe(); render();
      }
    } catch (err) { /* toast already shown */ }
  });

  // PWA
  if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("/sw.js").catch(() => {});

  boot();
})();
