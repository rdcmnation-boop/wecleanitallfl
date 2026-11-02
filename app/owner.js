// Owner panel views: Analytics, Architecture (AI superagents), Self-improvements, Updates & live activity, Customers.
// Pure rendering from data the database returns only to the 2-step-verified owner.
(function () {
  "use strict";
  window.WCIA_OWNER = function (c) {
    const { t, esc, icon, money, when, svcName, S, tile, loading, empty, wa, CFG } = c;
    const L = () => c.lang() === "es";
    const pct = (n) => n == null ? "—" : Math.round(n) + "%";
    const num = (n) => n == null ? "—" : Number(n).toLocaleString(L() ? "es-US" : "en-US", { maximumFractionDigits: 1 });
    // Fold a card into a collapsible section (same look and memory as the booking form). Title stays visible.
    const fold = (key, html, open) => {
      const m = html.match(/^<section class="card([^"]*)"><p class="eyebrow">([\s\S]*?)<\/p>([\s\S]*)<\/section>$/);
      if (!m) return html;
      const isOpen = S.secs && key in S.secs ? S.secs[key] : !!open;
      return '<details class="sec ofold" data-sec="' + key + '"' + (isOpen ? " open" : "") + '><summary><span class="eyebrow">' + m[2] + '</span></summary><div class="card' + m[1] + '">' + m[3] + "</div></details>";
    };
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
        // Order progress: how many orders reach each step, with the share of all orders.
        '<section class="card"><p class="label">' + esc(t("order_progress")) + "</p>" + hbars([
          { label: L() ? "Pedidos" : "Orders", v: f.created || 0 }, { label: L() ? "Con ofertas" : "Offered", v: f.offered || 0 },
          { label: L() ? "Asignados" : "Assigned", v: f.assigned || 0 }, { label: L() ? "Completados" : "Completed", v: f.completed || 0 }]
          .map((r, i) => Object.assign(r, { show: i && f.created ? r.v + " · " + Math.round((100 * r.v) / f.created) + "%" : r.v }))) + "</section>" +
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
    // Each improvement is shown under the agent responsible for that area. Agents only PROPOSE:
    // none can change its own code, permissions, financial rules or safety policies. The owner decides.
    const AREA_AGENT = { OPERATIONS: "operations", MARKETPLACE: "dispatch", FINANCE: "finance", BRAIN: "orchestrator" };
    function vImprove() {
      if (!S.data.stats || !S.data.an) return loading();
      const items = improvements(), es = L();
      const lvl = (m) => esc({ urgent: es ? "Urgente" : "Urgent", warn: es ? "Importante" : "Important", info: "Info", good: es ? "Oportunidad" : "Opportunity" }[m.lvl]);
      const card = (m) => '<article class="card imp ' + m.lvl + '"><div class="row between"><span class="imp-area">' + esc(m.area) + '</span><span class="imp-lvl">' + lvl(m) + "</span></div><h3>" + esc(m.title) + '</h3><p class="bio">' + esc(m.body) + "</p>" +
        (m.cta ? (m.href ? '<a class="btn ' + (m.href.includes("wa.me") ? "wa" : "ghost") + ' small" target="_blank" rel="noopener" href="' + esc(m.href) + '">' + (m.href.includes("wa.me") ? icon("chat") : "") + esc(m.cta) + "</a>" :
          '<button class="btn ghost small" data-act="' + (m.sys ? "sys" : "tab") + '" data-tab="' + esc(m.tab) + '" data-s="' + esc(m.sys || "") + '">' + esc(m.cta) + "</button>") : "") + "</article>";
      const groups = {};
      items.forEach((m) => { const ag = AREA_AGENT[m.area] || "orchestrator"; (groups[ag] = groups[ag] || []).push(m); });
      const rk = { urgent: 0, warn: 1, good: 2, info: 3 }, worst = (k) => Math.min(...groups[k].map((m) => rk[m.lvl] ?? 3));
      const order = ["orchestrator", "operations", "dispatch", "finance"].filter((k) => groups[k]).sort((x, y) => worst(x) - worst(y));
      const note = '<section class="card"><p class="eyebrow">' + icon("shield") + esc(es ? "Reglas de las mejoras" : "Rules for improvements") + "</p><p class=\"muted ag-d\">" +
        esc(es ? "Los agentes solo proponen. Ninguno puede cambiar su propio código, sus permisos, reglas de dinero ni políticas de seguridad: solo tú decides qué aplicar. Se recalculan con tus datos en vivo cada vez que entras."
          : "Agents only propose. None can change its own code, permissions, money rules or safety policies: only you decide what to apply. Recomputed from live data every visit.") + "</p></section>";
      const chips = '<div class="row" style="gap:8px;flex-wrap:wrap;margin:0 0 10px">' + order.map((k) => '<span class="pill">' + esc(k) + " · " + groups[k].length + "</span>").join("") + "</div>";
      return note + chips + order.map((k) => '<p class="eyebrow" style="margin:14px 0 6px">' + esc((es ? "Propone: " : "Proposed by: ") + k) + "</p>" + groups[k].map(card).join("")).join("") +
        (items.length ? "" : '<p class="muted">' + esc(es ? "Sin propuestas por ahora." : "No proposals right now.") + "</p>");
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
    // Agents: owner-only controls. Agents start paused; nothing here lets an agent act on its own.
    function vAgents() {
      const d = S.data, es = L();
      if (!d.agents) return loading();
      const tr = (en, esTxt) => (es ? esTxt : en);
      const ans = d.answer;
      const answerHtml = (x) => {
        if (x.error) return '<p class="muted">' + esc(x.error) + "</p>";
        const rows = (x.results || []).map((r) => {
          const state = r.ok
            ? (r.verified ? tr("Done, verified", "Hecho, verificado") : tr("Done, not verified (no evidence)", "Hecho, sin verificar (sin evidencia)")) + (Array.isArray(r.result) ? " · " + r.result.length + " " + tr("items", "elementos") : "")
            : tr("Not run: ", "No se ejecutó: ") + (r.reason === "owner_approval_required" ? tr("waiting for your approval below", "esperando tu aprobación abajo") : String(r.reason || ""));
          return '<li><b>' + esc(r.agent + " → " + r.action) + '</b><br><span class="muted">' + esc(state) + "</span></li>";
        }).join("");
        const logWarn = x.logErrors && x.logErrors.length ? '<p class="muted">' + esc(tr("Could not record " + x.logErrors.length + " entries.", "No se pudieron registrar " + x.logErrors.length + " entradas.")) + "</p>" : "";
        return (rows ? "<ul>" + rows + "</ul>" : '<p class="muted">' + esc(tr("No agent matched that request.", "Ningún agente coincidió con esa petición.")) + "</p>") + logWarn;
      };
      const composer = '<section class="card"><p class="eyebrow">' + esc(tr("Ask the agents", "Pregunta a los agentes")) + "</p>" +
        '<textarea id="agent-ask" rows="2" maxlength="500" placeholder="' + esc(tr("e.g. show unassigned bookings", "ej. muestra pedidos sin asignar")) + '"></textarea>' +
        '<div class="row"><button class="btn solid small" data-act="ask">' + esc(tr("Run", "Ejecutar")) + "</button></div>" +
        (ans ? answerHtml(ans) : "") + "</section>";
      const rowStyle = 'style="padding:12px 0;border-top:1px solid rgba(255,255,255,.08)"';
      const paused = d.agents.filter((a) => a.status !== "active").length;
      const reg = '<section class="card"><div class="row between"><p class="eyebrow">' + esc(tr("Agents", "Agentes")) + "</p>" +
        (paused ? '<button class="btn solid small" data-act="agentsall">' + esc(tr("Activate all", "Activar todos")) + " (" + paused + ")</button>" : '<span class="pill">' + esc(tr("All active", "Todos activos")) + "</span>") + "</div>" +
        d.agents.map((a) => { const on = a.status === "active";
          return '<div class="ag"><div class="row between"><b>' + esc(a.agent) + '</b><span class="row" style="gap:8px"><span class="pill">' + esc(a.max_class) + " · " + esc(on ? tr("Active", "Activo") : tr("Paused", "Pausado")) + '</span>' +
            '<button class="btn ghost small" data-act="agentstatus" data-agent="' + esc(a.agent) + '" data-s="' + (on ? "paused" : "active") + '">' + esc(on ? tr("Pause", "Pausar") : tr("Activate", "Activar")) + "</button></span></div>" +
            '<p class="muted ag-d">' + esc(a.role_description) + "</p></div>"; }).join("") + "</section>";
      const pend = '<section class="card"><p class="eyebrow">' + esc(tr("Waiting for your approval", "Esperan tu aprobación")) + "</p>" +
        (d.pending && d.pending.length ? d.pending.map((p) => '<div ' + rowStyle + '><b>' + esc(p.agent) + " → " + esc(p.action) + '</b><pre class="muted" style="white-space:pre-wrap;font-size:12px">' + esc(JSON.stringify(p.payload || {}, null, 1)) + '</pre><input data-reason="' + esc(p.id) + '" placeholder="' + esc(tr("Reason (required to reject)", "Motivo (obligatorio para rechazar)")) + '"><div class="row" style="margin-top:8px"><button class="btn solid small" data-act="decide" data-id="' + esc(p.id) + '" data-s="approved">' + esc(tr("Approve", "Aprobar")) + '</button><button class="btn ghost small" data-act="decide" data-id="' + esc(p.id) + '" data-s="rejected">' + esc(tr("Reject", "Rechazar")) + "</button></div></div>").join("") : '<p class="muted">' + esc(tr("Nothing pending.", "Nada pendiente.")) + "</p>") + "</section>";
      const log = '<section class="card"><p class="eyebrow">' + esc(tr("Agent activity (read-only)", "Actividad de agentes (solo lectura)")) + "</p>" +
        (d.log && d.log.length ? d.log.map((x) => '<div ' + rowStyle + '>' + esc(x.agent + " → " + x.action) + '<br><span class="muted">' + esc(when(x.created_at)) + " · " + esc(x.approval_class) + "</span></div>").join("") : '<p class="muted">' + esc(tr("No agent activity yet.", "Aún no hay actividad de agentes.")) + "</p>") + "</section>";
      return agentsOverview(d.ov) + composer + reg + pend + log;
    }

    // Phase 2: the owner's 4 decisions in force, the 3-step rollout and what the agents found.
    function agentsOverview(ov) {
      if (!ov) return "";
      const es = L(), tr = (en, esTxt) => (es ? esTxt : en);
      const s = ov.settings || {}, b = ov.budget || {}, auto = s.auto_send || [];
      const cap = Number(b.cap || 0), spent = Number(b.spent || 0), pct = cap ? Math.min(100, Math.round((spent / cap) * 100)) : 100;
      const sw = (on, act, k) => '<button class="mini-switch' + (on ? " on" : "") + '" data-act="' + act + '"' + (k ? ' data-k="' + k + '"' : "") + ' role="switch" aria-checked="' + on + '"><i></i></button>';
      const dt = (iso) => new Date(iso).toLocaleDateString(es ? "es-US" : "en-US", { weekday: "short", month: "short", day: "numeric" });
      const decisions = '<section class="card ag-dec"><p class="eyebrow">' + icon("shield") + esc(tr("Your decisions", "Tus decisiones")) + "</p>" +
        '<div class="ag-row"><div><b>' + esc(tr("Routine notices send alone", "Avisos de rutina salen solos")) + '</b><small>' + esc(tr("Job offers, order updates, reminders", "Ofertas de trabajo, cambios de pedido, recordatorios")) + "</small></div>" + sw(auto.includes("routine"), "agset", "routine") + "</div>" +
        '<div class="ag-row"><div><b>' + esc(tr("Support answers send alone", "Respuestas de soporte salen solas")) + '</b><small>' + esc(tr("AI answers to clients and cleaners", "Respuestas de IA a clientes y limpiadores")) + "</small></div>" + sw(auto.includes("support"), "agset", "support") + "</div>" +
        '<p class="fine">' + esc(tr("Campaigns and anything about money always wait for you.", "Campañas y todo lo de dinero siempre esperan por ti.")) + "</p>" +
        '<div class="ag-row"><div><b>' + esc(tr("AI: Claude Haiku 5.5", "IA: Claude Haiku 5.5")) + '</b><small>' + esc("$" + spent.toFixed(2) + " " + tr("of", "de") + " $" + cap.toFixed(0) + " " + tr("this month", "este mes") + " · " + (b.calls || 0) + " " + tr("answers", "respuestas")) + "</small></div>" +
        '<button class="btn ghost small" data-act="agcap">' + esc(tr("Change cap", "Cambiar tope")) + "</button></div>" +
        '<div class="goal-bar"><i style="width:' + pct + '%"></i></div>' +
        '<p class="fine">' + esc(tr("Free until you add a Claude key. At the cap, the app switches to its free built-in replies.", "Gratis hasta que agregues una clave de Claude. Al llegar al tope, la app usa sus respuestas propias gratis.")) + "</p>" +
        '<div class="ag-row"><div><b>' + esc(tr("WhatsApp / SMS messages", "Mensajes de WhatsApp / SMS")) + '</b><small>' + esc(s.messaging_on ? tr("On: queued messages go out every minute", "Encendido: los mensajes en cola salen cada minuto") : tr("Off until Twilio is set up; messages wait in the queue", "Apagado hasta configurar Twilio; los mensajes esperan en cola")) + "</small></div>" + sw(!!s.messaging_on, "agmsg") + "</div>" +
        '<div class="ag-row"><div><b>' + esc(tr("Records kept", "Registros guardados")) + '</b><small>' + esc(tr("Audit and agent logs ", "Auditoría y agentes ") + Math.round((s.audit_retention_days || 365) / 365) + tr(" year · chats ", " año · chats ") + (s.chat_retention_days || 90) + tr(" days", " días")) + "</small></div></div></section>";
      const steps = '<section class="card"><p class="eyebrow">' + icon("calendar") + esc(tr("Agents go live in 3 steps", "Agentes en 3 etapas")) + "</p>" +
        (ov.steps || []).map((x) => '<div class="ag-step' + (x.live ? " live" : "") + '"><span class="ag-num">' + x.step + "</span><div><b>" + esc(x.live ? tr("Live now", "En vivo") : tr("Starts ", "Empieza ") + dt(x.at)) + "</b><small>" + esc((x.agents || []).join(" · ")) + "</small></div></div>").join("") +
        '<p class="fine">' + esc(tr("Pausing an agent below always wins. Agents never move money, change prices, approve cleaners or assign jobs.", "Pausar un agente abajo siempre manda. Los agentes nunca mueven dinero, cambian precios, aprueban limpiadores ni asignan trabajos.")) + "</p></section>";
      const wa = ov.whatsapp || {};
      const hook = "https://fqajygzjteauxornipva.supabase.co/functions/v1/whatsapp-in";
      const waCard = '<section class="card"><p class="eyebrow">' + icon("chat") + esc(tr("WhatsApp agent", "Agente de WhatsApp")) + "</p>" +
        '<div class="ag-row"><div><b>' + esc(tr("Owner number", "Número del dueño")) + " · …" + esc(s.owner_whatsapp_last4 || "----") + '</b><small>' + esc(tr("Messages from this number get owner mode: summary, alerts, advice. Everyone else gets the client or cleaner side.", "Los mensajes desde este número reciben el modo dueño: resumen, alertas y consejos. Todos los demás reciben el lado de cliente o limpiador.")) + "</small></div>" +
        '<button class="btn ghost small" data-act="agowner">' + esc(tr("Change", "Cambiar")) + "</button></div>" +
        '<div class="ag-row"><div><b>' + esc(tr("Chats", "Chats")) + '</b><small>' + esc(tr("Today: ", "Hoy: ") + (wa.in_today || 0) + tr(" messages · 7 days: ", " mensajes · 7 días: ") + (wa.people_7d || 0) + tr(" people", " personas")) + "</small></div></div>" +
        '<p class="fine">' + esc(tr("Approvals and money never happen on WhatsApp: only here, with your 2-step code. Answer someone who asked for a person by writing R and the last 4 digits, e.g. R 1234 Hi, I'll call you in 5 min.", "Aprobaciones y dinero nunca pasan por WhatsApp: solo aquí, con tu código de 2 pasos. Para contestar a quien pidió una persona, escribe R y los últimos 4 números, ej.: R 1234 Hola, te llamo en 5 min.")) + "</p>" +
        '<p class="fine">' + esc(tr("Twilio setup: WhatsApp sender → When a message comes in → ", "Configuración en Twilio: remitente de WhatsApp → When a message comes in → ")) + "<code>" + esc(hook) + "</code></p></section>";
      const open = (ov.tasks || []).filter((x) => x.status === "open");
      const tasks = '<section class="card"><p class="eyebrow">' + icon("bell") + esc(tr("What the agents found", "Lo que encontraron los agentes")) + " · " + open.length + "</p>" +
        (open.length ? open.map((x) => '<div class="ag-task"><div><small>' + esc(x.agent) + " · " + esc(when(x.created_at)) + "</small><p>" + esc(x.title) + '</p></div><div class="row gap">' +
          (x.phone ? '<a class="btn wa small" target="_blank" rel="noopener" href="' + esc("https://wa.me/" + String(x.phone).replace(/\D/g, "")) + '">' + icon("chat") + "WhatsApp</a>" : "") + '<button class="btn solid small" data-act="task" data-id="' + esc(x.id) + '" data-s="done">' + esc(tr("Done", "Hecho")) + '</button><button class="btn ghost small" data-act="task" data-id="' + esc(x.id) + '" data-s="dismissed">' + esc(tr("Dismiss", "Descartar")) + "</button></div></div>").join("")
          : '<p class="muted">' + esc(tr("Nothing needs you right now. Checks run every 5 minutes.", "Nada te necesita ahora. Revisan cada 5 minutos.")) + "</p>") + "</section>";
      return fold("ag_tasks", tasks, true) + fold("ag_dec", decisions) + fold("ag_wa", waCard) + fold("ag_steps", steps);
    }

    // Launch checklist: what already works (checked) and what is still missing, with direct links.
    function vLaunch() {
      const es = L(), tr = (en, esTxt) => (es ? esTxt : en);
      const P = "https://supabase.com/dashboard/project/fqajygzjteauxornipva";
      const done = [
        ["Site live at wecleanitallfl.com", "Sitio en vivo en wecleanitallfl.com"],
        ["Single-owner lock (only your account can be owner)", "Candado de único dueño (solo tu cuenta es dueño)"],
        ["2-step code required for owner powers", "Código de 2 pasos obligatorio para el dueño"],
        ["Owner panel: orders, cleaners, analytics, improvements", "Panel de dueño: pedidos, limpiadores, analítica, mejoras"],
        ["10 agents with approvals and a read-only audit log", "10 agentes con aprobaciones y registro de auditoría de solo lectura"],
        ["Agent console (read-only reports)", "Consola de agentes (reportes de solo lectura)"],
        ["Spanish / English, installable on the phone", "Español / inglés, se instala en el teléfono"],
        ["Agent database rules tested: 48 of 48 pass", "Reglas de agentes probadas: 48 de 48 pasan"],
        ["Remember this device (owner) is live", "Recordar dispositivo (dueño) activo"],
        ["4 agent decisions made: routine + support replies send alone, Claude Haiku 5.5 capped at $10/month, agents go live in 3 steps, logs kept 1 year", "4 decisiones tomadas: avisos de rutina y respuestas de soporte salen solos, Claude Haiku 5.5 con tope de $10 al mes, agentes en 3 etapas, registros por 1 año"],
        ["DoorDash-style app: ☰ menu with Log out for everyone, cleaner Home with Go active, live order tracker with alerts", "App estilo DoorDash: menú ☰ con Cerrar sesión para todos, Inicio del limpiador con Ponerme activo, seguimiento del pedido en vivo con avisos"],
        ["WhatsApp agent built and tested: your number = owner mode, everyone else = client / cleaner side, with limits", "Agente de WhatsApp listo y probado: tu número = modo dueño, todos los demás = lado de cliente / limpiador, con límites"]
      ];
      const todo = [
        ["Block leaked passwords", "Bloquear contraseñas filtradas", "Supabase offers this only on its Pro plan. Free alternative: in Email settings require digits, lowercase, uppercase and symbols (8+ characters).", "Supabase lo ofrece solo en el plan Pro. Alternativa gratis: en los ajustes de Email exige números, minúsculas, mayúsculas y símbolos (8+ caracteres).", [["Auth settings", "Ajustes de Auth", P + "/auth/providers"]]],
        ["AI with Claude (optional)", "IA con Claude (opcional)", "Free until you add a key: the app uses its built-in replies. With a key, AI stops at the $10 monthly cap.", "Gratis hasta que agregues una clave: la app usa sus respuestas propias. Con clave, la IA se detiene en el tope de $10 al mes.", [["Get key", "Crear clave", "https://console.anthropic.com/settings/keys"], ["Save secret", "Guardar secreto", P + "/functions/secrets"]]],
        ["Connect Twilio to turn on WhatsApp", "Conectar Twilio para encender WhatsApp", "The WhatsApp agent is built and waiting. 1) Save TWILIO_SID, TWILIO_TOKEN and TWILIO_WHATSAPP_FROM as secrets. 2) In Twilio, paste the webhook from More → Agents. 3) Turn on Messages in Agents. Email codes stay on and free.", "El agente de WhatsApp está listo y esperando. 1) Guarda TWILIO_SID, TWILIO_TOKEN y TWILIO_WHATSAPP_FROM como secretos. 2) En Twilio, pega el webhook de Más → Agentes. 3) Enciende Mensajes en Agentes. Los códigos por correo siguen activos y gratis.", [["Twilio WhatsApp", "Twilio WhatsApp", "https://console.twilio.com/us1/develop/sms/try-it-out/whatsapp-learn"], ["Save secrets", "Guardar secretos", P + "/functions/secrets"]]],
        ["Google map on the cleaner's Home (optional)", "Mapa de Google en el Inicio del limpiador (opcional)", "Zones show without it. A free Google Maps key adds the real map.", "Las zonas se ven sin él. Una clave gratis de Google Maps agrega el mapa real.", [["Google Maps key", "Clave de Google Maps", "https://console.cloud.google.com/google/maps-apis/credentials"]]],
        ["Card payments (optional)", "Pagos con tarjeta (opcional)", "Not built yet.", "Aún no está construido.", [["Stripe keys", "Claves de Stripe", "https://dashboard.stripe.com/apikeys"]]]
      ];
      const ok = '<span class="ck ok">' + icon("check") + "</span>", no = '<span class="ck no"></span>';
      // Guest verification: which channel is live, and how to switch to WhatsApp/SMS.
      const byPhone = CFG.GUEST_VERIFY === "phone";
      const verifyCard = '<section class="card"><p class="eyebrow">' + esc(tr("Guest booking check", "Verificación de pedidos sin cuenta")) + "</p>" +
        '<p><b>' + esc(tr("Active now:", "Activo ahora:")) + "</b> " + esc(byPhone ? tr("code by WhatsApp / SMS (Twilio)", "código por WhatsApp / SMS (Twilio)") : tr("code by email (free)", "código por correo (gratis)")) + "</p>" +
        (byPhone ? "" : '<p class="muted ag-d">' + esc(tr("Needs the 'Change Email Address' template in Supabase to show {{ .Token }} (the 6-digit code).", "Necesita que la plantilla 'Change Email Address' de Supabase muestre {{ .Token }} (el código de 6 números).")) + "</p>" +
          '<div class="row" style="gap:8px;flex-wrap:wrap;margin-top:6px"><a class="btn ghost small" target="_blank" rel="noopener" href="' + esc(P + "/auth/templates") + '">' + esc(tr("Email templates", "Plantillas de correo")) + "</a></div>") +
        '<p class="muted ag-d" style="margin-top:10px">' + esc(tr("To switch to WhatsApp later: 1) Twilio account with a WhatsApp sender. 2) Supabase → Providers → Phone: paste the Account SID, Auth Token and Verify/Messaging service. 3) Set GUEST_VERIFY to \"phone\" in app/config.js and publish.", "Para cambiar a WhatsApp después: 1) Cuenta de Twilio con remitente de WhatsApp. 2) Supabase → Providers → Phone: pega el Account SID, Auth Token y el servicio de mensajes. 3) Cambia GUEST_VERIFY a \"phone\" en app/config.js y publica.")) + "</p>" +
        '<div class="row" style="gap:8px;flex-wrap:wrap;margin-top:6px"><a class="btn ghost small" target="_blank" rel="noopener" href="' + esc(P + "/auth/providers") + '">' + esc(tr("Auth providers", "Proveedores de Auth")) + '</a><a class="btn ghost small" target="_blank" rel="noopener" href="https://console.twilio.com/">Twilio</a></div></section>';
      return fold("ln_verify", verifyCard) + fold("ln_done", '<section class="card"><p class="eyebrow">' + esc(tr("Already working", "Ya funciona")) + " · " + done.length + "</p>" +
        done.map((x) => '<div class="ckrow">' + ok + "<span>" + esc(tr(x[0], x[1])) + "</span></div>").join("") + "</section>") +
        fold("ln_todo", '<section class="card"><p class="eyebrow">' + esc(tr("Still missing for launch", "Falta para el lanzamiento")) + " · " + todo.length + "</p>" +
        todo.map((x) => '<div class="ckrow top">' + no + '<div><b>' + esc(tr(x[0], x[1])) + '</b><p class="muted ag-d">' + esc(tr(x[2], x[3])) + "</p>" +
          (x[4].length ? '<div class="row" style="gap:8px;flex-wrap:wrap;margin-top:6px">' + x[4].map((l) => '<a class="btn ghost small" target="_blank" rel="noopener" href="' + esc(l[2]) + '">' + esc(tr(l[0], l[1])) + "</a>").join("") + "</div>" : "") + "</div></div>").join("") + "</section>", true);
    }

    const SYS = [["launch", "check"], ["architecture", "grid"], ["improve", "bulb"], ["agents", "list"], ["updates", "bell"], ["customers", "users"], ["connectors", "plug"], ["account", "user"]];
    function vSystem(views) {
      const cur = S.sys || "launch", es = L();
      const names = { launch: es ? "Lanzamiento" : "Launch", architecture: es ? "Arquitectura" : "Architecture", improve: es ? "Mejoras" : "Improvements", agents: es ? "Agentes" : "Agents", updates: es ? "Actualizaciones" : "Updates", customers: es ? "Clientes" : "Customers", connectors: t("tab_connectors"), account: t("tab_account") };
      const body = { launch: vLaunch, architecture: vArchitecture, improve: vImprove, agents: vAgents, updates: vUpdates, customers: vCustomers, connectors: views.connectors, account: views.account }[cur];
      return '<h1 class="title">' + esc(names[cur]) + "</h1>" +
        '<div class="sysnav">' + SYS.map(([k, ic]) => '<button class="' + (cur === k ? "on" : "") + '" data-act="sys" data-s="' + k + '">' + icon(ic) + "<span>" + esc(names[k]) + "</span></button>").join("") + "</div>" + body();
    }

    return { vAnalytics, vSystem, spark, improvements, departments };
  };
})();
