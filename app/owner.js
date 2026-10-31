// Owner panel views: Analytics, Architecture (AI superagents), Self-improvements, Updates & live activity, Customers.
// Pure rendering from data the database returns only to the 2-step-verified owner.
(function () {
  "use strict";
  window.WCIA_OWNER = function (c) {
    const { t, esc, icon, money, when, svcName, S, tile, loading, empty, wa, CFG } = c;
    const L = () => c.lang() === "es";
    const pct = (n) => n == null ? "—" : Math.round(n) + "%";
    const num = (n) => n == null ? "—" : Number(n).toLocaleString(L() ? "es-US" : "en-US", { maximumFractionDigits: 1 });
    const dayLabel = (d) => new Date(d + "T12:00:00").toLocaleDateString(L() ? "es-US" : "en-US", { month: "short", day: "numeric" });

    // ───────── charts (single hue, thin marks, hover tooltips, no dual axes) ─────────
    function bars(series, key, fmt, opts) {
      opts = opts || {};
      const W = 640, H = opts.h || 170, P = { l: 34, r: 8, t: 10, b: 24 };
      const vals = series.map((d) => Number(d[key]) || 0);
      const max = Math.max(1, ...vals);
      const nice = (() => { const p = Math.pow(10, Math.floor(Math.log10(max))); const m = max / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p; })();
      const iw = W - P.l - P.r, ih = H - P.t - P.b, n = series.length;
      const bw = Math.max(2, Math.min(26, iw / n - 2));
      let g = "";
      [0, 0.5, 1].forEach((f) => {
        const y = P.t + ih - ih * f;
        g += '<line x1="' + P.l + '" x2="' + (W - P.r) + '" y1="' + y + '" y2="' + y + '" class="grid"/>' +
          '<text x="' + (P.l - 6) + '" y="' + (y + 4) + '" class="axis" text-anchor="end">' + esc(fmt(nice * f, true)) + "</text>";
      });
      series.forEach((d, i) => {
        const v = vals[i], h = Math.max(v ? 3 : 0, ih * v / nice);
        const x = P.l + (iw / n) * i + (iw / n - bw) / 2, y = P.t + ih - h;
        const r = Math.min(4, bw / 2, h);
        const path = h ? "M" + x + "," + (P.t + ih) + "V" + (y + r) + "Q" + x + "," + y + " " + (x + r) + "," + y + "H" + (x + bw - r) + "Q" + (x + bw) + "," + y + " " + (x + bw) + "," + (y + r) + "V" + (P.t + ih) + "Z" : "";
        const tip = dayLabel(d.day) + " · " + fmt(v);
        g += '<g class="bar" data-tip="' + esc(tip) + '"><rect x="' + (P.l + (iw / n) * i) + '" y="' + P.t + '" width="' + (iw / n) + '" height="' + ih + '" fill="transparent"/>' + (path ? '<path d="' + path + '"/>' : "") + "</g>";
        if (n <= 14 || i % Math.ceil(n / 7) === 0 || i === n - 1) g += '<text x="' + (x + bw / 2) + '" y="' + (H - 6) + '" class="axis" text-anchor="middle">' + esc(dayLabel(d.day)) + "</text>";
      });
      return '<svg class="chart" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="' + esc(opts.label || "") + '">' + g + "</svg>";
    }
    function hbars(rows, opts) {
      const max = Math.max(1, ...rows.map((r) => r.v));
      return '<ul class="hbars">' + rows.map((r) => '<li data-tip="' + esc(r.tip || r.label + " · " + r.v) + '"><span class="hb-l">' + esc(r.label) + '</span><span class="hb-t"><i style="width:' + Math.max(r.v ? 3 : 0, 100 * r.v / max) + '%"></i></span><b>' + esc(r.show != null ? r.show : r.v) + "</b></li>").join("") + "</ul>" + (opts && opts.note ? '<p class="fine">' + esc(opts.note) + "</p>" : "");
    }
    function spark(series, key) {
      const W = 220, H = 46, vals = series.map((d) => Number(d[key]) || 0), max = Math.max(1, ...vals);
      const pts = vals.map((v, i) => (i * W / Math.max(1, vals.length - 1)).toFixed(1) + "," + (H - 4 - (H - 8) * v / max).toFixed(1)).join(" ");
      return '<svg class="spark" viewBox="0 0 ' + W + " " + H + '" aria-hidden="true"><polyline points="' + pts + '"/></svg>';
    }

    // ───────── Analytics ─────────
    function vAnalytics() {
      const a = S.data.an;
      const range = S.range || 30;
      const chips = '<div class="chips scroll">' + [7, 30, 90].map((d) => '<button class="chip-btn' + (range === d ? " on" : "") + '" data-act="range" data-d="' + d + '">' + d + (L() ? " días" : " days") + "</button>").join("") + "</div>";
      if (!a) return '<h1 class="title">' + esc(t("tab_analytics")) + "</h1>" + chips + loading();
      const f = a.funnel || {};
      const created = a.series.reduce((s, d) => s + d.created, 0), gmv = a.series.reduce((s, d) => s + Number(d.gmv), 0);
      const cancelRate = f.created ? 100 * f.cancelled / f.created : null;
      const ratings = a.ratings || {}, rTotal = [1, 2, 3, 4, 5].reduce((s, k) => s + (ratings[k] || 0), 0);
      return '<h1 class="title">' + esc(t("tab_analytics")) + "</h1>" + chips +
        '<div class="tiles">' + tile(L() ? "Pedidos" : "Orders", created, "lime") + tile(L() ? "Ventas" : "Sales", money(gmv), "lime") +
        tile(L() ? "Ticket promedio" : "Avg ticket", money(a.avg_ticket)) + tile(L() ? "Aceptación de ofertas" : "Offer acceptance", pct(a.acceptance_rate)) +
        tile(L() ? "Minutos hasta asignar" : "Minutes to assign", num(a.avg_minutes_to_assign)) + tile(L() ? "Cancelación" : "Cancellation", pct(cancelRate), cancelRate > 20 ? "warn" : "") +
        tile(L() ? "Clientes que repiten" : "Repeat customers", a.repeat_customers) + tile(L() ? "Registros" : "Sign-ups", a.series.reduce((s, d) => s + d.signups, 0)) + "</div>" +
        '<section class="card"><p class="label">' + esc(L() ? "Pedidos por día" : "Orders per day") + "</p>" + bars(a.series, "created", (v) => String(Math.round(v)), { label: "orders" }) + "</section>" +
        '<section class="card"><p class="label">' + esc(L() ? "Ventas completadas por día" : "Completed sales per day") + "</p>" + bars(a.series, "gmv", (v, ax) => ax ? "$" + (v >= 1000 ? Math.round(v / 100) / 10 + "k" : Math.round(v)) : money(v), { label: "sales" }) + "</section>" +
        '<section class="card"><p class="label">' + esc(L() ? "Embudo" : "Funnel") + "</p>" + hbars([
          { label: L() ? "Pedidos" : "Orders", v: f.created || 0 }, { label: L() ? "Con ofertas" : "Offered", v: f.offered || 0 },
          { label: L() ? "Asignados" : "Assigned", v: f.assigned || 0 }, { label: L() ? "Completados" : "Completed", v: f.completed || 0 }]) + "</section>" +
        '<section class="card"><p class="label">' + esc(L() ? "Demanda por ZIP vs. limpiadores" : "Demand by ZIP vs. cleaners") + "</p>" +
        (a.zips.length ? '<table class="tbl"><thead><tr><th>ZIP</th><th>' + esc(L() ? "Pedidos" : "Orders") + "</th><th>" + esc(L() ? "Sin limpiador" : "Unmatched") + "</th><th>" + esc(L() ? "Limpiadores" : "Cleaners") + "</th></tr></thead><tbody>" +
          a.zips.map((z) => "<tr" + (z.cleaners === 0 ? ' class="gap"' : "") + "><td><b>" + esc(z.zip) + "</b></td><td>" + z.demand + "</td><td>" + z.unmatched + "</td><td>" + z.cleaners + (z.cleaners === 0 ? " ⚠" : "") + "</td></tr>").join("") + "</tbody></table>" : '<p class="muted">—</p>') + "</section>" +
        '<section class="card"><p class="label">' + esc(L() ? "Servicios" : "Services") + "</p>" + (a.services.length ? hbars(a.services.map((s) => ({ label: svcName(s.service), v: s.n, show: s.n + (s.avg_budget ? " · " + money(s.avg_budget) : ""), tip: svcName(s.service) + " · " + s.n + (s.avg_budget ? " · " + (L() ? "promedio " : "avg ") + money(s.avg_budget) : "") }))) : '<p class="muted">—</p>') + "</section>" +
        '<section class="card"><p class="label">' + esc(L() ? "Calificaciones" : "Ratings") + " (" + rTotal + ")</p>" + hbars([5, 4, 3, 2, 1].map((k) => ({ label: k + " ★", v: ratings[k] || 0 }))) + "</section>" +
        '<section class="card"><p class="label">' + esc(L() ? "Mejores limpiadores" : "Top cleaners") + "</p>" +
        (a.top_workers.length ? '<table class="tbl"><thead><tr><th>' + esc(L() ? "Limpiador" : "Cleaner") + "</th><th>" + esc(L() ? "Trabajos" : "Jobs") + "</th><th>★</th><th>" + esc(L() ? "Acepta" : "Accepts") + "</th></tr></thead><tbody>" +
          a.top_workers.map((w) => "<tr><td><b>" + esc(w.company_name || w.name) + "</b>" + (w.available ? ' <span class="dot-on" title="online"></span>' : "") + "</td><td>" + w.done + "</td><td>" + (w.rating_count ? Number(w.rating).toFixed(1) : "—") + "</td><td>" + pct(w.acceptance) + "</td></tr>").join("") + "</tbody></table>" : '<p class="muted">' + esc(t("no_workers")) + "</p>") + "</section>";
    }

    // ───────── Architecture (the plan's superagents, mapped to what runs today) ─────────
    const ON = "on", P2 = "p2", PART = "part";
    function departments(s) {
      s = s || {};
      const es = L();
      return [
        { k: "brain", name: "BRAIN", sub: es ? "Inteligencia general" : "General intelligence", kpi: (S.data.ai ? "Claude" : es ? "Reglas" : "Rules"), kpiL: "AI",
          agents: [[es ? "Razonamiento (AI CEO)" : "Reasoning (AI CEO)", S.data.ai ? ON : PART], [es ? "Memoria (registro de acciones)" : "Memory (audit log)", ON], [es ? "Comunicación (WhatsApp, avisos)" : "Communication (WhatsApp, alerts)", PART], [es ? "Soporte al cliente" : "Customer support", P2], [es ? "Investigación" : "Research", P2], [es ? "Aprendizaje" : "Learning", P2]] },
        { k: "market", name: "MARKETPLACE", sub: es ? "Inteligencia de limpieza" : "Cleaning intelligence", kpi: s.bookings_open, kpiL: es ? "abiertos" : "open",
          agents: [[es ? "Asignación de clientes" : "Customer matching", ON], [es ? "Asignación de limpiadores (8 factores)" : "Worker matching (8 factors)", ON], [es ? "Reservas" : "Booking manager", ON], [es ? "Despacho (primero que acepta)" : "Dispatch (first to accept)", ON], [es ? "Horarios" : "Scheduling", PART], [es ? "Precio sugerido" : "Pricing optimizer", PART]] },
        { k: "ops", name: "OPERATIONS", sub: es ? "Inteligencia de negocio" : "Business intelligence", kpi: s.workers_pending, kpiL: es ? "por aprobar" : "to approve",
          agents: [[es ? "Verificación de limpiadores" : "Worker verification", ON], [es ? "Control de calidad (calificaciones)" : "Quality control (ratings)", ON], [es ? "Experiencia del cliente (alertas)" : "Customer experience (alerts)", ON], [es ? "Recuperación (re-búsqueda)" : "Service recovery (re-dispatch)", ON], [es ? "Disputas" : "Dispute resolution", P2]] },
        { k: "fin", name: "FINANCE", sub: es ? "Inteligencia financiera" : "Financial intelligence", kpi: money(s.gmv_30d), kpiL: es ? "30 días" : "30 days",
          agents: [[es ? "Ingresos" : "Revenue", ON], [es ? "Auditor (registro)" : "Auditor (log)", ON], [es ? "Comisiones" : "Commissions", P2], [es ? "Suscripciones" : "Subscriptions", P2], [es ? "Pagos a limpiadores" : "Payouts", P2], [es ? "Conciliación" : "Reconciliation", P2]] }
      ];
    }
    function vArchitecture() {
      const s = S.data.stats;
      const es = L();
      const chip = (st) => '<span class="st ' + st + '">' + esc(st === ON ? (es ? "Activo" : "Live") : st === PART ? (es ? "Básico" : "Basic") : (es ? "Fase 2" : "Phase 2")) + "</span>";
      const deps = departments(s);
      const all = deps.flatMap((d) => d.agents), live = all.filter((a) => a[1] === ON).length;
      return '<div class="org">' +
        '<div class="org-node owner-node"><b>' + esc(es ? "DUEÑO HUMANO" : "HUMAN OWNER") + "</b><small>" + esc(es ? "Estrategia · Aprobación crítica" : "Strategy · Critical approval") + "</small></div><i class=\"org-link\"></i>" +
        '<div class="org-node ceo-node"><b>WE CLEAN IT ALL CEO</b><small>' + esc(es ? "Dirección · Coordinación · Supervisión · Evolución" : "Direction · Coordination · Oversight · Evolution") + '</small><span class="ceo-meter"><i style="width:' + Math.round(100 * live / all.length) + '%"></i></span><small>' + live + "/" + all.length + " " + esc(es ? "agentes activos" : "agents live") + "</small></div><i class=\"org-link\"></i>" +
        '<div class="org-grid">' + deps.map((d) => '<section class="dept ' + d.k + '"><header><div><b>' + d.name + "</b><small>" + esc(d.sub) + '</small></div><span class="dept-kpi"><b>' + esc(d.kpi == null ? "—" : d.kpi) + "</b><small>" + esc(d.kpiL) + "</small></span></header><ul>" +
          d.agents.map((a) => "<li><span>" + esc(a[0]) + "</span>" + chip(a[1]) + "</li>").join("") + "</ul></section>").join("") + "</div>" +
        '<div class="org-node infra"><b>' + esc(es ? "INFRAESTRUCTURA DE CONFIANZA" : "TRUST INFRASTRUCTURE") + "</b><small>Supabase · Postgres RLS · " + esc(es ? "Verificación en 2 pasos · Registro de auditoría · Avisos" : "2-step verification · Audit log · Alerts") + "</small></div><i class=\"org-link\"></i>" +
        '<div class="org-apps"><span>' + icon("user") + esc(es ? "Clientes" : "Customers") + "</span><span>" + icon("broom") + esc(es ? "Limpiadores" : "Cleaners") + "</span><span>" + icon("shield") + esc(es ? "Dueño" : "Owner") + "</span></div>" +
        '<p class="fine center">' + esc(es ? "La IA coordina y recomienda; pagos, permisos, aprobación de limpiadores y decisiones importantes siempre pasan por ti." : "AI coordinates and recommends; payments, permissions, cleaner approval and key decisions always go through you.") + "</p></div>";
    }

    // ───────── Self-improvements: recommendations computed from live data ─────────
    function improvements() {
      const s = S.data.stats || {}, a = S.data.an || {}, ws = S.data.workers || [], es = L();
      const out = [];
      const recruit = (zip) => wa("", (es ? "¿Limpias casas u oficinas cerca de " : "Do you clean homes or offices near ") + zip + "? " + (es ? "Únete gratis a We Clean It All y recibe trabajos en tu teléfono: " : "Join We Clean It All for free and get jobs on your phone: ") + (CFG.APP_URL || location.origin + "/"));
      (a.zips || []).filter((z) => z.cleaners === 0 && z.demand > 0).slice(0, 3).forEach((z) => out.push({ lvl: "urgent", area: "MARKETPLACE",
        title: (es ? "Sin limpiadores en ZIP " : "No cleaners in ZIP ") + z.zip, body: (es ? z.demand + " pedido(s) ahí. Recluta limpiadores de esa zona." : z.demand + " order(s) there. Recruit cleaners in that area."),
        href: recruit(z.zip), cta: es ? "Mensaje para reclutar" : "Recruiting message" }));
      if (s.workers_pending > 0) out.push({ lvl: "warn", area: "OPERATIONS", title: (es ? "Aprueba limpiadores: " : "Approve cleaners: ") + s.workers_pending, body: es ? "Revisa perfil y documentos. Cada aprobado amplía tu cobertura." : "Check profile and documents. Each approval expands coverage.", tab: "workers", cta: es ? "Revisar" : "Review" });
      if (s.bookings_unmatched > 0) out.push({ lvl: "urgent", area: "MARKETPLACE", title: (es ? "Pedidos sin limpiador: " : "Unmatched orders: ") + s.bookings_unmatched, body: es ? "Asígnalos a mano o vuelve a buscar." : "Assign manually or search again.", tab: "bookings", cta: es ? "Asignar" : "Assign" });
      if (a.acceptance_rate != null && a.acceptance_rate < 60) out.push({ lvl: "warn", area: "MARKETPLACE", title: (es ? "Aceptación baja: " : "Low acceptance: ") + pct(a.acceptance_rate), body: es ? "Los limpiadores rechazan muchas ofertas. Sube el pago sugerido por hora (hoy $" + CFG.SUGGESTED_HOURLY + ") o pregunta qué les falta." : "Cleaners decline many offers. Raise the suggested hourly pay (now $" + CFG.SUGGESTED_HOURLY + ") or ask what's missing.", cta: null });
      if (a.avg_minutes_to_assign != null && a.avg_minutes_to_assign > 60) out.push({ lvl: "warn", area: "BRAIN", title: (es ? "Asignar tarda " : "Assigning takes ") + Math.round(a.avg_minutes_to_assign) + " min", body: es ? "Activa avisos automáticos por WhatsApp (Fase 2) o usa el botón 'Avisar por WhatsApp' en cada pedido." : "Turn on automatic WhatsApp alerts (Phase 2) or use 'Alert on WhatsApp' on each order.", tab: "bookings", cta: es ? "Ver pedidos" : "View orders" });
      ws.filter((w) => w.status === "approved" && !w.available).slice(0, 2).forEach((w) => out.push({ lvl: "info", area: "OPERATIONS", title: (w.company_name || w.full_name) + (es ? " está desconectado" : " is offline"), body: es ? "Pídele que active 'Disponible' para recibir trabajos." : "Ask them to turn on 'Available' to get jobs.", href: wa(w.phone, t("wa_msg_worker", { name: (w.full_name || "").split(" ")[0] }) + (es ? " ¿Puedes activar 'Disponible' en la app?" : " Can you turn on 'Available' in the app?")), cta: "WhatsApp" }));
      if (s.low_reviews_30d > 0) out.push({ lvl: "urgent", area: "OPERATIONS", title: (es ? "Calificaciones bajas: " : "Low ratings: ") + s.low_reviews_30d, body: es ? "Llama a esos clientes hoy y ofrece repetir el servicio." : "Call those customers today and offer a redo.", tab: "bookings", cta: es ? "Ver" : "View" });
      const f = a.funnel || {};
      if (f.created >= 5 && f.cancelled / f.created > 0.2) out.push({ lvl: "warn", area: "FINANCE", title: (es ? "Cancelaciones altas: " : "High cancellations: ") + pct(100 * f.cancelled / f.created), body: es ? "Confirma cada pedido por WhatsApp el día antes." : "Confirm every order on WhatsApp the day before.", cta: null });
      const svc = (a.services || []).filter((x) => x.avg_budget).sort((x, y) => y.avg_budget - x.avg_budget)[0];
      if (svc) out.push({ lvl: "good", area: "FINANCE", title: (es ? "Servicio de mayor valor: " : "Highest-value service: ") + svcName(svc.service), body: (es ? "Promedio " : "Average ") + money(svc.avg_budget) + (es ? ". Promuévelo en Instagram @wecleanitallfl." : ". Promote it on Instagram @wecleanitallfl."), cta: null });
      if ((s.customers || 0) < 10) out.push({ lvl: "info", area: "BRAIN", title: es ? "Consigue tus primeros 10 clientes" : "Get your first 10 customers", body: es ? "Comparte el enlace de la app con tus clientes comerciales actuales y en Instagram." : "Share the app link with current commercial clients and on Instagram.", href: wa("", (es ? "Pide tu limpieza en segundos: " : "Book your cleaning in seconds: ") + (CFG.APP_URL || location.origin + "/")), cta: es ? "Compartir" : "Share" });
      if (!S.data.ai) out.push({ lvl: "info", area: "BRAIN", title: es ? "Activa el AI CEO con Claude" : "Turn on the AI CEO with Claude", body: es ? "Agrega tu clave ANTHROPIC_API_KEY en Supabase → Edge Functions → Secrets para análisis con IA." : "Add ANTHROPIC_API_KEY in Supabase → Edge Functions → Secrets for AI analysis.", tab: "system", sys: "connectors", cta: es ? "Conectores" : "Connectors" });
      const order = { urgent: 0, warn: 1, info: 2, good: 3 };
      return out.sort((x, y) => order[x.lvl] - order[y.lvl]);
    }
    function vImprove() {
      if (!S.data.stats || !S.data.an) return loading();
      const items = improvements(), es = L();
      return '<p class="muted">' + esc(es ? "Se recalculan solas con tus datos en vivo cada vez que entras. Tú decides qué aplicar." : "Recomputed from live data every visit. You decide what to apply.") + "</p>" +
        items.map((m) => '<article class="card imp ' + m.lvl + '"><div class="row between"><span class="imp-area">' + esc(m.area) + '</span><span class="imp-lvl">' + esc({ urgent: es ? "Urgente" : "Urgent", warn: es ? "Importante" : "Important", info: "Info", good: es ? "Oportunidad" : "Opportunity" }[m.lvl]) + "</span></div><h3>" + esc(m.title) + '</h3><p class="bio">' + esc(m.body) + "</p>" +
          (m.cta ? (m.href ? '<a class="btn ' + (m.href.includes("wa.me") ? "wa" : "ghost") + ' small" target="_blank" rel="noopener" href="' + esc(m.href) + '">' + (m.href.includes("wa.me") ? icon("chat") : "") + esc(m.cta) + "</a>" :
            '<button class="btn ghost small" data-act="' + (m.sys ? "sys" : "tab") + '" data-tab="' + esc(m.tab) + '" data-s="' + esc(m.sys || "") + '">' + esc(m.cta) + "</button>") : "") + "</article>").join("");
    }

    // ───────── Updates: release notes + live activity ─────────
    const RELEASES = [
      { v: "1.3", d: "2026-10-31", es: ["Panel del dueño: analítica, arquitectura de agentes, mejoras automáticas y actividad en vivo", "Lista de clientes"], en: ["Owner panel: analytics, agent architecture, self-improvements and live activity", "Customer list"] },
      { v: "1.2", d: "2026-10-31", es: ["La app es la portada de wecleanitallfl.com; la web comercial está en /comercial/"], en: ["The app is the wecleanitallfl.com home page; commercial site at /comercial/"] },
      { v: "1.1", d: "2026-10-31", es: ["Conectado a Supabase", "Verificación en 2 pasos obligatoria para el dueño", "Límites contra spam y protección contra páginas falsas"], en: ["Connected to Supabase", "Mandatory 2-step verification for the owner", "Anti-spam limits and clickjacking protection"] },
      { v: "1.0", d: "2026-10-31", es: ["Marketplace Fase 1: clientes, limpiadores y dueño", "Motor de asignación con 8 factores", "Conectores listos para WhatsApp, SMS, correo y Claude"], en: ["Marketplace Phase 1: customers, cleaners and owner", "8-factor matching engine", "Connectors ready for WhatsApp, SMS, email and Claude"] }
    ];
    const ACT = {
      booking_created: ["Nuevo pedido", "New order"], offer_accepted: ["Limpiador aceptó", "Cleaner accepted"], booking_cancelled: ["Pedido cancelado", "Order cancelled"],
      admin_assign: ["Asignado por el dueño", "Assigned by owner"], worker_approved: ["Limpiador aprobado", "Cleaner approved"], worker_rejected: ["Limpiador rechazado", "Cleaner rejected"],
      worker_suspended: ["Limpiador pausado", "Cleaner paused"], worker_pending: ["Limpiador en revisión", "Cleaner under review"], owner_granted: ["Acceso de dueño", "Owner access"]
    };
    function vUpdates() {
      const es = L(), act = S.data.activity;
      return '<section class="card"><p class="label">' + icon("spark") + esc(es ? "Actividad en vivo" : "Live activity") + '<span class="live-dot"></span></p>' +
        (!act ? loading() : !act.length ? '<p class="muted">' + esc(es ? "Sin actividad aún." : "No activity yet.") + "</p>" :
          '<ul class="feed">' + act.slice(0, 25).map((x) => "<li><i></i><div><b>" + esc((ACT[x.action] || [x.action, x.action])[es ? 0 : 1]) + (x.details && x.details.code ? " · " + esc(x.details.code) : "") + "</b><small>" + esc(x.actor) + " · " + esc(when(x.created_at)) + "</small></div></li>").join("") + "</ul>") + "</section>" +
        '<section class="card"><p class="label">' + esc(es ? "Actualizaciones del sistema" : "System updates") + "</p>" +
        RELEASES.map((r) => '<div class="rel"><span class="rel-v">v' + r.v + "</span><div><small>" + esc(r.d) + "</small><ul>" + (es ? r.es : r.en).map((i) => "<li>" + esc(i) + "</li>").join("") + "</ul></div></div>").join("") + "</section>";
    }

    // ───────── Customers ─────────
    function vCustomers() {
      const list = S.data.customers, es = L();
      if (!list) return loading();
      if (!list.length) return empty("users", es ? "Aún no hay clientes." : "No customers yet.");
      return '<p class="muted">' + list.length + " " + esc(es ? "clientes" : "customers") + "</p>" + list.map((p) => '<article class="card cust"><div class="person"><div class="avatar">' + esc((p.full_name || "?")[0]) + "</div><div><b>" + esc(p.full_name || p.email) + "</b><small>" + esc(p.email) + " · " + esc(p.phone || "—") + '</small></div></div><p class="tags"><span>' + p.bookings + " " + esc(es ? "pedidos" : "orders") + "</span><span>" + p.completed + " " + esc(es ? "completados" : "completed") + "</span><span>" + money(p.spent) + "</span>" + (p.last_booking ? "<span>" + esc(when(p.last_booking)) + "</span>" : "") + "</p>" +
        (p.phone ? '<div class="row gap"><a class="btn ghost small" href="tel:+' + esc(String(p.phone).replace(/\D/g, "").replace(/^(\d{10})$/, "1$1")) + '">' + icon("phone") + esc(t("call")) + '</a><a class="btn wa small" target="_blank" rel="noopener" href="' + esc(wa(p.phone, (es ? "Hola " : "Hi ") + (p.full_name || "").split(" ")[0] + (es ? ", te escribe We Clean It All." : ", this is We Clean It All."))) + '">' + icon("chat") + "WhatsApp</a></div>" : "") + "</article>").join("");
    }

    // ───────── System hub ─────────
    const SYS = [["architecture", "grid"], ["improve", "spark"], ["updates", "bell"], ["customers", "users"], ["connectors", "plug"], ["account", "user"]];
    function vSystem(views) {
      const cur = S.sys || "architecture", es = L();
      const names = { architecture: es ? "Arquitectura" : "Architecture", improve: es ? "Mejoras" : "Improvements", updates: es ? "Actualizaciones" : "Updates", customers: es ? "Clientes" : "Customers", connectors: t("tab_connectors"), account: t("tab_account") };
      const body = { architecture: vArchitecture, improve: vImprove, updates: vUpdates, customers: vCustomers, connectors: views.connectors, account: views.account }[cur];
      return '<h1 class="title">' + esc(names[cur]) + "</h1>" +
        '<div class="sysnav">' + SYS.map(([k, ic]) => '<button class="' + (cur === k ? "on" : "") + '" data-act="sys" data-s="' + k + '">' + icon(ic) + "<span>" + esc(names[k]) + "</span></button>").join("") + "</div>" + body();
    }

    return { vAnalytics, vSystem, spark, improvements, departments };
  };
})();
