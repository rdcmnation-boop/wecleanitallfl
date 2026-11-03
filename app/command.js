// Admin Command Center: one owner screen, 12 modules, all fed by the database's cc_* / admin_* functions
// (owner-only, 2-step checked on the server). No numbers are made up here: empty data shows as empty.
// Plain JS, no build step; app.js passes its helpers in, the same way it does for owner.js and dash.js.
(function () {
  "use strict";
  window.WCIA_CC = function (c) {
    const { esc, icon, money, when, svcName, S, loading, empty, API, toast, render, lang } = c;
    const L = () => lang() === "es";
    const tr = (en, es) => (L() ? es : en);
    const st = () => (S.cc = S.cc || { mod: "overview", q: "", st: "", mk: "", page: 1, sel: null, days: 30 });
    const cents = (n) => money((Number(n) || 0) / 100);
    const n0 = (v) => (v == null ? "—" : Number(v).toLocaleString(L() ? "es-US" : "en-US"));
    const pill = (txt, cls) => '<span class="pill ' + (cls || "") + '">' + esc(txt) + "</span>";
    const tbl = (head, rows) => '<div class="cc-scroll"><table class="tbl cc-tbl"><thead><tr>' + head.map((h) => "<th>" + esc(h) + "</th>").join("") + "</tr></thead><tbody>" + rows.join("") + "</tbody></table></div>";
    const kpi = (label, value, note, cls) => '<div class="tile ' + (cls || "") + '"><span>' + esc(label) + "</span><b>" + value + "</b>" + (note ? '<small class="muted">' + esc(note) + "</small>" : "") + "</div>";
    const card = (title, body, extra) => '<section class="card cc-card"><div class="row between"><p class="eyebrow">' + esc(title) + "</p>" + (extra || "") + "</div>" + body + "</section>";

    const MODS = [
      ["overview", "grid", "Overview", "Resumen"], ["bookings", "list", "Bookings", "Pedidos"], ["dispatch", "spark", "AI dispatch", "Despacho IA"],
      ["customers", "users", "Customers", "Clientes"], ["workforce", "broom", "Cleaners", "Limpiadores"], ["companies", "shield", "Companies", "Empresas"],
      ["ai", "bulb", "AI operations", "Operaciones IA"], ["robotics", "plug", "Robotics", "Robótica"], ["finance", "chart", "Money", "Dinero"],
      ["sales", "bell", "Commercial sales", "Ventas comerciales"], ["markets", "check", "Markets", "Mercados"], ["reports", "chart", "Reports", "Reportes"],
    ];
    const SVC = (s) => (svcName ? svcName(s) : s);

    // ───────── data ─────────
    async function load() {
      const s = st(), m = s.mod, mk = s.mk || null;
      const call = (fn, args) => API.cc(fn, args || {});
      if (m === "overview") return { ov: await call("cc_overview", { p_market: mk }) };
      if (m === "bookings") {
        if (s.sel) return { detail: await call("cc_booking_detail", { p_booking: s.sel }) };
        return { list: await call("cc_bookings", { p_q: s.q, p_status: s.st, p_market: s.mk, p_page: s.page, p_size: 25 }) };
      }
      if (m === "dispatch") {
        if (s.sel) return { disp: await call("cc_dispatch", { p_booking: s.sel }) };
        const [a, b] = await Promise.all([call("cc_bookings", { p_status: "requested", p_market: s.mk, p_size: 50 }), call("cc_bookings", { p_status: "offered", p_market: s.mk, p_size: 50 })]);
        return { queue: [].concat(a.rows, b.rows) };
      }
      if (m === "customers") {
        if (s.sel) return { cust: await call("cc_customer_detail", { p_customer: s.sel }) };
        return { list: await call("cc_customers", { p_q: s.q, p_page: s.page, p_size: 25 }) };
      }
      if (m === "workforce") return { list: await call("cc_providers", { p_q: s.q, p_status: s.st, p_type: "", p_page: s.page, p_size: 25 }) };
      if (m === "companies") {
        const [list, sales] = await Promise.all([call("cc_providers", { p_q: s.q, p_status: s.st, p_type: "company", p_page: s.page, p_size: 25 }), call("cc_sales", { p_status: "active", p_size: 50 })]);
        return { list, sales };
      }
      if (m === "ai") { const [ov, pending] = await Promise.all([call("admin_agent_overview"), call("admin_pending_approvals")]); return { ai: ov, pending }; }
      if (m === "finance") return { fin: await call("cc_finance", { p_status: s.st, p_page: s.page, p_size: 25 }) };
      if (m === "sales") return { sales: await call("cc_sales", { p_q: s.q, p_status: s.st, p_page: s.page, p_size: 25 }) };
      if (m === "markets") return { markets: await call("admin_markets") };
      if (m === "reports") return { rep: await call("cc_reports", { p_days: s.days, p_market: mk }) };
      return {};
    }

    // ───────── shared pieces ─────────
    function search(placeholder) {
      return '<form class="cc-search" data-form="cc_search" role="search"><label class="sr-only" for="ccq">' + esc(tr("Search", "Buscar")) + "</label>" +
        '<input id="ccq" name="q" type="search" value="' + esc(st().q) + '" placeholder="' + esc(placeholder) + '" autocomplete="off">' +
        '<button class="btn small solid" type="submit">' + esc(tr("Search", "Buscar")) + "</button></form>";
    }
    function chips(key, opts) {
      const cur = st()[key] || "";
      return '<div class="chips scroll" role="group">' + opts.map(([v, lab]) => '<button class="chip-btn' + (cur === v ? " on" : "") + '" data-act="cc_filter" data-k="' + key + '" data-v="' + esc(v) + '"' + (cur === v ? ' aria-pressed="true"' : ' aria-pressed="false"') + ">" + esc(lab) + "</button>").join("") + "</div>";
    }
    function pager(d) {
      if (!d || d.total <= d.size) return d ? '<p class="muted cc-count">' + esc(n0(d.total) + " " + tr("total", "en total")) + "</p>" : "";
      const pages = Math.ceil(d.total / d.size), p = d.page;
      return '<div class="row between cc-pager"><span class="muted">' + esc(tr("Page", "Página") + " " + p + " / " + pages + " · " + n0(d.total) + " " + tr("total", "en total")) + "</span><span class=\"row\" style=\"gap:8px\">" +
        '<button class="btn ghost small" data-act="cc_page" data-p="' + (p - 1) + '"' + (p <= 1 ? " disabled" : "") + ">" + esc(tr("Previous", "Anterior")) + "</button>" +
        '<button class="btn ghost small" data-act="cc_page" data-p="' + (p + 1) + '"' + (p >= pages ? " disabled" : "") + ">" + esc(tr("Next", "Siguiente")) + "</button></span></div>";
    }
    const marketChips = () => chips("mk", [["", tr("All markets", "Todos")], ["miami-dade", "Miami-Dade"], ["broward", "Broward"]]);
    const back = () => '<button class="btn ghost small" data-act="cc_back">← ' + esc(tr("Back to list", "Volver a la lista")) + "</button>";
    const statusPill = (s) => pill(s || "—", "st-" + (s || ""));
    const reasonText = (r) => ({ not_approved: tr("not approved", "no aprobado"), not_available: tr("offline", "desconectado"), not_qualified: tr("doesn't offer this service", "no ofrece este servicio"),
      outside_service_area: tr("outside their area", "fuera de su zona"), awaiting_payment: tr("booking not paid yet", "pedido sin pagar"), insurance_missing: tr("insurance missing", "falta seguro"),
      own_booking: tr("their own booking", "su propio pedido"), suspended_in_market: tr("suspended in this market", "suspendido en este mercado"),
      no_payout_account: tr("no payout account", "sin cuenta de pago"), onboarding_incomplete: tr("Stripe onboarding not finished", "registro en Stripe incompleto"),
      payouts_not_enabled: tr("payouts not enabled", "pagos no habilitados"), cleaner_not_approved: tr("not approved", "no aprobado"), mode_mismatch: tr("test/live mismatch", "modo prueba/real no coincide") }[r] || r);

    // ───────── modules ─────────
    function vOverview(d) {
      const o = d.ov; if (!o) return loading();
      const b = o.bookings, rv = o.revenue, cu = o.customers, pv = o.providers, co = o.commercial;
      const alerts = o.alerts.length ? '<ul class="cc-list">' + o.alerts.map((a) => "<li><b>" + esc(a.agent) + "</b> " + esc(a.title) + ' <small class="muted">' + esc(when(a.at)) + "</small></li>").join("") + "</ul>"
        : '<p class="muted">' + esc(tr("No open alerts.", "Sin alertas abiertas.")) + "</p>";
      return marketChips() +
        '<div class="tiles">' + kpi(tr("Today", "Hoy"), n0(b.today), tr("bookings scheduled", "pedidos para hoy")) + kpi(tr("Waiting for a cleaner", "Esperando limpiador"), n0(b.open), "", b.open ? "warn" : "") +
        kpi(tr("In progress", "En curso"), n0(b.in_progress), n0(b.assigned) + " " + tr("assigned", "asignados")) + kpi(tr("Awaiting payment", "Esperando pago"), n0(b.awaiting_payment), "", b.awaiting_payment ? "warn" : "") + "</div>" +
        '<div class="tiles">' + kpi(tr("Completed · 30 days", "Completados · 30 días"), n0(b.completed_30d), n0(b.cancelled_30d) + " " + tr("cancelled", "cancelados"), "lime") +
        kpi(tr("Cleaner pay · 30 days", "Pago a limpiadores · 30 días"), money(rv.gmv_30d), tr("job prices of completed work", "precio de trabajos completados")) +
        kpi(tr("Our fees · 30 days", "Nuestras tarifas · 30 días"), money(rv.fees_booked_30d), tr("collected by card: ", "cobrado con tarjeta: ") + cents(rv.fees_collected_cents)) +
        kpi(tr("Ledger", "Libro contable"), rv.unbalanced_ledger_groups ? n0(rv.unbalanced_ledger_groups) + " ✕" : "✓", rv.unbalanced_ledger_groups ? tr("unbalanced entries", "asientos descuadrados") : tr("balanced", "cuadrado"), rv.unbalanced_ledger_groups ? "bad" : "") + "</div>" +
        '<div class="tiles">' + kpi(tr("Customers", "Clientes"), n0(cu.total), n0(cu.new_30d) + " " + tr("new · 30 days", "nuevos · 30 días")) + kpi(tr("Repeat customers", "Clientes que repiten"), n0(cu.repeat), n0(cu.with_booking) + " " + tr("have booked", "han pedido")) +
        kpi(tr("Cleaners online", "Limpiadores activos"), n0(pv.online) + " / " + n0(pv.approved), n0(pv.pending) + " " + tr("waiting for approval", "esperando aprobación"), pv.incomplete_profiles ? "warn" : "") +
        kpi(tr("Commercial accounts", "Cuentas comerciales"), n0(co.active), n0(co.pipeline) + " " + tr("in the pipeline", "en proceso")) + "</div>" +
        (pv.incomplete_profiles ? '<p class="cc-note warn">' + esc(tr(pv.incomplete_profiles + " approved cleaner(s) have no services or ZIP codes, so they can't receive offers.", pv.incomplete_profiles + " limpiador(es) aprobado(s) sin servicios o códigos postales: no pueden recibir ofertas.")) + "</p>" : "") +
        card(tr("Alerts", "Alertas") + " · " + o.open_alerts, alerts) +
        '<p class="muted cc-asof">' + esc(tr("Live from the database · ", "En vivo desde la base de datos · ") + when(o.as_of)) + "</p>";
    }

    function vBookings(d) {
      const s = st();
      if (s.sel) {
        const x = d.detail; if (!x) return loading();
        const b = x.booking, open = ["requested", "offered", "assigned"].includes(b.status);
        const hist = x.history.map((h) => "<li><b>" + esc(h.to || h.event) + "</b> " + esc(tr("by ", "por ") + h.actor) + ' <small class="muted">' + esc(when(h.at)) + (h.data && h.data.reason ? " · " + esc(h.data.reason) : "") + "</small></li>").join("");
        return back() + card(b.code + " · " + SVC(b.service), '<div class="cc-kv">' +
            "<span>" + esc(tr("Status", "Estado")) + "</span>" + statusPill(b.status) + "<span>" + esc(tr("Workflow", "Flujo")) + "</span><b>" + esc(b.workflow_state || "—") + "</b>" +
            "<span>" + esc(tr("Payment", "Pago")) + "</span><b>" + esc(b.payment_status || tr("outside the app", "fuera de la app")) + "</b>" +
            "<span>" + esc(tr("When", "Cuándo")) + "</span><b>" + esc(b.scheduled_at ? when(b.scheduled_at) : tr("As soon as possible", "Lo antes posible")) + "</b>" +
            "<span>" + esc(tr("Where", "Dónde")) + "</span><b>" + esc((b.city || "") + " " + b.zip + " · " + (b.market_id || "")) + "</b>" +
            "<span>" + esc(tr("Customer", "Cliente")) + "</span><b>" + esc(x.customer ? x.customer.name || "—" : "—") + "</b>" +
            "<span>" + esc(tr("Cleaner", "Limpiador")) + "</span><b>" + esc(x.worker ? x.worker.name : tr("not assigned", "sin asignar")) + "</b>" +
            "<span>" + esc(tr("Cleaner price · total", "Precio limpiador · total")) + "</span><b>" + esc(money(b.budget) + " · " + money(b.total)) + "</b></div>" +
            (open ? '<div class="row cc-actions"><button class="btn small solid" data-act="cc_dispatch_open" data-id="' + esc(b.id) + '">' + esc(tr("Find a cleaner", "Buscar limpiador")) + "</button>" +
              '<button class="btn ghost small" data-act="cc_reschedule" data-id="' + esc(b.id) + '">' + esc(tr("Reschedule", "Reprogramar")) + "</button>" +
              '<button class="btn ghost small danger" data-act="cc_cancel" data-id="' + esc(b.id) + '">' + esc(tr("Cancel booking", "Cancelar pedido")) + "</button></div>" : "")) +
          card(tr("History", "Historial") + " · " + x.history.length, hist ? '<ol class="cc-list">' + hist + "</ol>" : '<p class="muted">—</p>') +
          card(tr("Offers sent", "Ofertas enviadas") + " · " + x.offers.length, x.offers.length ? tbl([tr("Cleaner", "Limpiador"), tr("Status", "Estado"), tr("Score", "Puntaje")], x.offers.map((o) => "<tr><td>" + esc(o.worker) + "</td><td>" + statusPill(o.status) + "</td><td>" + esc(o.score) + "</td></tr>")) : '<p class="muted">—</p>') +
          (x.payment ? card(tr("Payment and ledger", "Pago y libro contable"), '<p>' + esc(x.payment.status + " · " + cents(x.payment.amount_cents) + (x.payment.livemode ? " · LIVE" : " · " + tr("test mode", "modo prueba"))) + "</p>" +
            (x.ledger.length ? tbl([tr("Entry", "Asiento"), tr("Account", "Cuenta"), tr("Amount", "Monto")], x.ledger.map((l) => "<tr><td>" + esc(l.group.split(":")[0]) + "</td><td>" + esc(l.account) + "</td><td>" + esc(cents(l.cents)) + "</td></tr>")) : "")) : "");
      }
      const list = d.list; if (!list) return search(tr("Code, ZIP, customer or cleaner", "Código, ZIP, cliente o limpiador")) + loading();
      return search(tr("Code, ZIP, customer or cleaner", "Código, ZIP, cliente o limpiador")) + marketChips() +
        chips("st", [["", tr("All", "Todos")], ["requested", tr("Waiting", "Esperando")], ["offered", tr("Offered", "Ofrecidos")], ["assigned", tr("Assigned", "Asignados")], ["in_progress", tr("In progress", "En curso")], ["completed", tr("Completed", "Completados")], ["cancelled", tr("Cancelled", "Cancelados")], ["requires_payment", tr("Unpaid", "Sin pagar")]]) +
        (list.rows.length ? tbl([tr("Code", "Código"), tr("Service", "Servicio"), tr("When", "Cuándo"), tr("Where", "Dónde"), tr("Status", "Estado"), tr("Cleaner", "Limpiador"), tr("Total", "Total")],
          list.rows.map((r) => '<tr class="cc-row" data-act="cc_open" data-id="' + esc(r.id) + '" tabindex="0"><td><b>' + esc(r.code) + "</b></td><td>" + esc(SVC(r.service)) + "</td><td>" + esc(r.scheduled_at ? when(r.scheduled_at) : "ASAP") + "</td><td>" + esc(r.zip) + "</td><td>" + statusPill(r.status) + (r.payment === "requires_payment" ? " " + pill(tr("unpaid", "sin pagar"), "warn") : "") + "</td><td>" + esc(r.worker || "—") + "</td><td>" + esc(money(r.total)) + "</td></tr>")) + pager(list)
          : empty("list", tr("No bookings match", "Ningún pedido coincide"), st().q || st().st ? tr("Try another search or filter.", "Prueba otra búsqueda o filtro.") : tr("Bookings appear here as customers book.", "Los pedidos aparecen aquí cuando los clientes reservan.")));
    }

    function vDispatch(d) {
      const s = st();
      if (s.sel) {
        const x = d.disp; if (!x) return loading();
        const b = x.booking;
        const rec = x.recommended.length ? tbl([tr("Cleaner", "Limpiador"), tr("Type", "Tipo"), tr("Score", "Puntaje"), tr("Rating", "Calificación"), tr("Jobs", "Trabajos"), ""],
          x.recommended.map((w, i) => "<tr><td><b>" + esc(w.name) + "</b>" + (i === 0 ? " " + pill(tr("best match", "mejor opción"), "ok") : "") + "</td><td>" + esc(w.provider_type) + "</td><td>" + esc(w.score) + "</td><td>" + esc(w.rating || "—") + "</td><td>" + esc(w.jobs_done) + "</td>" +
            '<td><button class="btn small solid" data-act="cc_assign" data-id="' + esc(b.id) + '" data-w="' + esc(w.worker_id) + '" data-n="' + esc(w.name) + '">' + esc(tr("Approve & assign", "Aprobar y asignar")) + "</button></td></tr>"))
          : '<p class="cc-note warn">' + esc(tr("No eligible cleaner right now. See why below.", "Ningún limpiador elegible ahora. Mira por qué abajo.")) + "</p>";
        return back() + card(b.code + " · " + SVC(b.service) + " · " + b.zip, '<p class="muted">' + esc(tr("RECOMMENDATION — the score uses service area, rating, experience, acceptance rate, language, team size and past jobs with this customer. The database enforces eligibility and stops double assignment; you approve.", "RECOMENDACIÓN — el puntaje usa zona, calificación, experiencia, aceptación, idioma, tamaño del equipo y trabajos previos con este cliente. La base de datos verifica la elegibilidad y evita doble asignación; tú apruebas.")) + "</p>" + rec) +
          card(tr("Not eligible", "No elegibles") + " · " + x.blocked.length, x.blocked.length ? '<ul class="cc-list">' + x.blocked.map((w) => "<li><b>" + esc(w.name) + "</b> — " + esc(reasonText(w.reason)) + "</li>").join("") + "</ul>" : '<p class="muted">—</p>');
      }
      const q = d.queue; if (!q) return loading();
      return marketChips() + (q.length ? tbl([tr("Code", "Código"), tr("Service", "Servicio"), tr("ZIP", "ZIP"), tr("Waiting since", "Esperando desde"), tr("Status", "Estado"), ""],
        q.map((r) => "<tr><td><b>" + esc(r.code) + "</b></td><td>" + esc(SVC(r.service)) + "</td><td>" + esc(r.zip) + "</td><td>" + esc(when(r.created_at)) + "</td><td>" + statusPill(r.status) + (r.payment === "requires_payment" ? " " + pill(tr("unpaid", "sin pagar"), "warn") : "") + "</td>" +
          '<td><button class="btn small solid" data-act="cc_dispatch_open" data-id="' + esc(r.id) + '">' + esc(tr("Match", "Asignar")) + "</button></td></tr>"))
        : empty("check", tr("Nothing waiting for a cleaner", "Nada esperando limpiador"), tr("New requests show here until a cleaner accepts.", "Las solicitudes nuevas aparecen aquí hasta que un limpiador acepte.")));
    }

    function vCustomers(d) {
      const s = st();
      if (s.sel) {
        const x = d.cust; if (!x) return loading();
        const p = x.profile || {};
        return back() + card(p.name || tr("Guest", "Invitado"), '<div class="cc-kv"><span>Email</span><b>' + esc(p.email || "—") + "</b><span>" + esc(tr("Phone", "Teléfono")) + "</span><b>" + esc(p.phone || "—") + "</b>" +
            "<span>" + esc(tr("Language", "Idioma")) + "</span><b>" + esc(p.language || "—") + "</b><span>" + esc(tr("Texts", "Mensajes de texto")) + "</span><b>" + esc(p.sms_opt_out_at ? tr("opted out", "se dio de baja") : p.sms_consent_at ? tr("consented", "aceptó") : tr("no consent", "sin permiso")) + "</b>" +
            "<span>" + esc(tr("Recurring", "Recurrente")) + "</span><b>" + esc(x.recurring.length ? x.recurring.join(", ") : tr("none", "ninguno")) + "</b></div>") +
          card(tr("Addresses", "Direcciones") + " · " + x.addresses.length, x.addresses.length ? '<ul class="cc-list">' + x.addresses.map((a) => "<li>" + esc(a.address + ", " + (a.city || "") + " " + a.zip) + "</li>").join("") + "</ul>" : '<p class="muted">—</p>') +
          card(tr("Bookings", "Pedidos") + " · " + x.bookings.length, x.bookings.length ? tbl([tr("Code", "Código"), tr("Service", "Servicio"), tr("Status", "Estado"), tr("Total", "Total"), tr("Created", "Creado")], x.bookings.map((b) => "<tr><td>" + esc(b.code) + "</td><td>" + esc(SVC(b.service)) + "</td><td>" + statusPill(b.status) + "</td><td>" + esc(money(b.total)) + "</td><td>" + esc(when(b.created_at)) + "</td></tr>")) : '<p class="muted">—</p>') +
          card(tr("Messages sent", "Mensajes enviados") + " · " + x.messages.length, x.messages.length ? tbl([tr("Channel", "Canal"), tr("Message", "Mensaje"), tr("Status", "Estado"), tr("When", "Cuándo")], x.messages.map((m) => "<tr><td>" + esc(m.channel) + "</td><td>" + esc(m.template) + "</td><td>" + esc(m.status) + "</td><td>" + esc(when(m.at)) + "</td></tr>")) : '<p class="muted">—</p>') +
          card(tr("Support requests", "Solicitudes de ayuda") + " · " + x.support.length, x.support.length ? '<ul class="cc-list">' + x.support.map((t) => "<li>" + esc(t.title) + " · " + esc(t.status) + "</li>").join("") + "</ul>" : '<p class="muted">—</p>');
      }
      const list = d.list;
      return search(tr("Name, email or phone", "Nombre, correo o teléfono")) + (!list ? loading() : list.rows.length ?
        tbl([tr("Customer", "Cliente"), tr("Contact", "Contacto"), tr("Bookings", "Pedidos"), tr("Completed", "Completados"), tr("Spent", "Gastado"), tr("Last booking", "Último pedido")],
          list.rows.map((r) => '<tr class="cc-row" data-act="cc_open" data-id="' + esc(r.id) + '" tabindex="0"><td><b>' + esc(r.name || tr("Guest", "Invitado")) + "</b>" + (r.guest ? " " + pill(tr("guest", "invitado")) : "") + "</td><td>" + esc(r.email || (r.phone_last4 ? "…" + r.phone_last4 : "—")) + "</td><td>" + esc(r.bookings) + "</td><td>" + esc(r.completed) + "</td><td>" + esc(money(r.spent)) + "</td><td>" + esc(r.last_booking ? when(r.last_booking) : "—") + "</td></tr>")) + pager(list)
        : empty("users", tr("No customers match", "Ningún cliente coincide"), ""));
    }

    function providerTable(list) {
      return list.rows.length ? tbl([tr("Name", "Nombre"), tr("Status", "Estado"), tr("Skills", "Servicios"), tr("Area", "Zona"), tr("Insurance", "Seguro"), tr("Jobs · rating", "Trabajos · calif."), tr("Earned · paid", "Ganado · pagado"), tr("Payouts", "Pagos")],
        list.rows.map((w) => "<tr><td><b>" + esc(w.company || w.name) + "</b><br><small class=\"muted\">" + esc(w.type + (w.team_size > 1 ? " · " + w.team_size + " " + tr("people", "personas") : "")) + "</small></td>" +
          "<td>" + statusPill(w.status) + (w.status === "approved" ? " " + pill(w.available ? tr("online", "activo") : tr("offline", "desconectado"), w.available ? "ok" : "") : "") + "</td>" +
          "<td>" + (w.services.length ? esc(w.services.map(SVC).join(", ")) : pill(tr("none set", "sin servicios"), "warn")) + "</td>" +
          "<td>" + (w.zips.length ? esc(w.zips.length + " ZIP") : pill(tr("none set", "sin zona"), "warn")) + "</td>" +
          "<td>" + (w.insurance_valid ? pill(tr("valid", "vigente"), "ok") : pill(tr("none on file", "no registrado"))) + "</td>" +
          "<td>" + esc(w.jobs_done + " · " + (w.ratings ? w.rating : "—")) + "</td><td>" + esc(cents(w.earned_cents) + " · " + cents(w.paid_cents)) + "</td>" +
          "<td>" + (w.payout_block ? pill(reasonText(w.payout_block), "warn") : pill(tr("ready", "listo"), "ok")) + "</td></tr>")) + pager(list)
        : empty("broom", tr("No cleaners match", "Ningún limpiador coincide"), "");
    }
    function vWorkforce(d) {
      return search(tr("Name, company or ZIP", "Nombre, empresa o ZIP")) + chips("st", [["", tr("All", "Todos")], ["pending", tr("Waiting for approval", "Esperando aprobación")], ["approved", tr("Approved", "Aprobados")], ["suspended", tr("Suspended", "Suspendidos")]]) +
        (d.list ? providerTable(d.list) : loading()) + '<p class="muted cc-asof">' + esc(tr("Approve or suspend cleaners in the Workers tab (unchanged).", "Aprueba o suspende limpiadores en la pestaña Limpiadores (sin cambios).")) + "</p>";
    }
    function vCompanies(d) {
      return search(tr("Company name or ZIP", "Nombre de empresa o ZIP")) + (d.list ? card(tr("Cleaning companies", "Empresas de limpieza"), providerTable(d.list)) : loading()) +
        (d.sales ? card(tr("Active commercial contracts", "Contratos comerciales activos") + " · " + d.sales.total, d.sales.rows.length ? tbl([tr("Account", "Cuenta"), tr("Terms", "Términos"), tr("Locations", "Ubicaciones")], d.sales.rows.map((a) => "<tr><td>" + esc(a.name) + "</td><td>" + esc(a.terms) + "</td><td>" + esc(a.locations) + "</td></tr>")) : '<p class="muted">' + esc(tr("No active contracts yet.", "Aún no hay contratos activos.")) + "</p>") : "");
    }

    function vAI(d) {
      const o = d.ai; if (!o) return loading();
      const b = o.budget || {};
      return '<div class="tiles">' + kpi(tr("AI spend this month", "Gasto IA este mes"), money(b.spent), tr("cap ", "tope ") + money(b.cap), b.ok === false ? "bad" : "") + kpi(tr("Calls", "Llamadas"), n0(b.calls), o.settings.ai_model) +
        kpi(tr("Open tasks", "Tareas abiertas"), n0(o.open_tasks), "") + kpi(tr("Waiting for your approval", "Esperando tu aprobación"), n0(d.pending.length), "", d.pending.length ? "warn" : "") + "</div>" +
        card(tr("Approval queue", "Cola de aprobación"), d.pending.length ? '<ul class="cc-list">' + d.pending.map((p) => "<li><b>" + esc(p.agent) + "</b> " + esc(p.action) + ' <span class="row" style="gap:6px;display:inline-flex"><button class="btn small solid" data-act="cc_decide" data-id="' + esc(p.id) + '" data-s="approved">' + esc(tr("Approve", "Aprobar")) + '</button><button class="btn ghost small" data-act="cc_decide" data-id="' + esc(p.id) + '" data-s="rejected">' + esc(tr("Reject", "Rechazar")) + "</button></span></li>").join("") + "</ul>" : '<p class="muted">' + esc(tr("Nothing waiting. Payments, refunds, payouts, contracts and market launches always come here first.", "Nada pendiente. Pagos, reembolsos, pagos a limpiadores, contratos y lanzamientos de mercado siempre pasan por aquí.")) + "</p>") +
        card(tr("Agents", "Agentes"), tbl([tr("Agent", "Agente"), tr("Job", "Función"), tr("Allowed actions", "Acciones permitidas"), tr("Limit", "Límite"), tr("Status", "Estado")],
          o.agents.map((a) => "<tr><td><b>" + esc(a.agent) + "</b></td><td>" + esc(a.role_description) + "</td><td><small>" + esc((a.allowed_actions || []).join(", ")) + "</small></td><td>" + esc(tr("class ", "clase ") + a.max_class) + "</td><td>" + pill(a.live ? tr("live", "activo") : a.status, a.live ? "ok" : "") + "</td></tr>"))) +
        card(tr("Recent agent work", "Trabajo reciente de agentes"), o.tasks.length ? '<ul class="cc-list">' + o.tasks.slice(0, 15).map((t) => "<li><b>" + esc(t.agent) + "</b> " + esc(t.title) + ' <small class="muted">' + esc(t.status + " · " + when(t.created_at)) + "</small></li>").join("") + "</ul>" : '<p class="muted">—</p>');
    }

    function vRobotics() {
      return card(tr("Robotics", "Robótica"), '<p>' + esc(tr("No robot is connected and no manufacturer integration exists yet. This module stays empty on purpose: it never shows simulated fleets as real.", "No hay robots conectados ni integraciones con fabricantes todavía. Este módulo está vacío a propósito: nunca muestra flotas simuladas como reales.")) + "</p>" +
        '<ul class="cc-list"><li>' + esc(tr("Next: robot registry and a clearly labeled SIMULATOR on staging (planned phase 9).", "Siguiente: registro de robots y un SIMULADOR claramente etiquetado en staging (fase 9).")) + "</li><li>" +
        esc(tr("Real robots only after a manufacturer agreement, a verified integration and a field test, with a human supervisor on every mission.", "Robots reales solo con acuerdo de fabricante, integración verificada y prueba en campo, con un supervisor humano en cada misión.")) + "</li></ul>", pill(tr("not started", "no iniciado")));
    }

    function vFinance(d) {
      const f = d.fin; if (!f) return loading();
      const lg = f.ledger, p = f.payments;
      return '<div class="tiles">' + kpi(tr("Our fees collected", "Tarifas cobradas"), cents(lg.platform_fees_cents), f.settings.fee_pct + "% " + tr("client service fee", "tarifa de servicio")) +
        kpi(tr("Owed to cleaners", "Por pagar a limpiadores"), cents(lg.owed_to_cleaners_cents), n0(f.held_payouts) + " " + tr("payouts held", "pagos retenidos"), f.held_payouts ? "warn" : "") +
        kpi(tr("Paid to cleaners", "Pagado a limpiadores"), cents(lg.paid_to_cleaners_cents), "") +
        kpi(tr("Reconciliation", "Conciliación"), lg.unbalanced_groups ? n0(lg.unbalanced_groups) + " ✕" : "✓", tr("refunded ", "reembolsado ") + cents(lg.refunded_cents), lg.unbalanced_groups ? "bad" : "lime") + "</div>" +
        (lg.livemode_payments ? '<p class="cc-note bad">' + esc(tr("LIVE payments recorded: " + lg.livemode_payments, "Pagos REALES registrados: " + lg.livemode_payments)) + "</p>" : '<p class="cc-note">' + esc(tr("Test mode only. Live payments are refused by the system.", "Solo modo prueba. El sistema rechaza pagos reales.")) + "</p>") +
        chips("st", [["", tr("All", "Todos")], ["requires_payment", tr("Unpaid", "Sin pagar")], ["authorized", tr("Card held", "Tarjeta retenida")], ["captured", tr("Charged", "Cobrado")], ["refund_pending", tr("Refund pending", "Reembolso pendiente")], ["refunded", tr("Refunded", "Reembolsado")], ["cancelled", tr("Released", "Liberado")]]) +
        card(tr("Payments", "Pagos") + " · " + p.total, p.rows.length ? tbl([tr("Booking", "Pedido"), tr("Status", "Estado"), tr("Total", "Total"), tr("Cleaner gets", "Recibe el limpiador"), tr("Paid out", "Pagado")],
          p.rows.map((r) => "<tr><td>" + esc(r.code) + "</td><td>" + esc(r.status) + "</td><td>" + esc(cents(r.amount_cents)) + "</td><td>" + esc(cents(r.cleaner_cents)) + "</td><td>" + esc(r.paid_out ? "✓" : "—") + "</td></tr>")) : '<p class="muted">' + esc(tr("No card payments yet. Payments start when a market is switched to Stripe.", "Aún no hay pagos con tarjeta. Empiezan cuando un mercado pasa a Stripe.")) + "</p>") +
        card(tr("Refunds", "Reembolsos") + " · " + f.refunds.length, f.refunds.length ? tbl([tr("Booking", "Pedido"), tr("Amount", "Monto"), tr("Reason", "Motivo"), tr("Status", "Estado")], f.refunds.map((r) => "<tr><td>" + esc(r.code) + "</td><td>" + esc(cents(r.cents)) + "</td><td>" + esc(r.reason) + "</td><td>" + esc(r.status) + "</td></tr>")) : '<p class="muted">—</p>') +
        card(tr("Money audit trail", "Registro de auditoría de dinero"), f.audit.length ? '<ul class="cc-list">' + f.audit.map((a) => "<li><b>" + esc(a.action) + "</b> <small class=\"muted\">" + esc(when(a.at)) + "</small></li>").join("") + "</ul>" : '<p class="muted">—</p>');
    }

    function vSales(d) {
      const x = d.sales;
      const stages = x ? Object.entries(x.stages).map(([k, v]) => pill(k + " · " + v)).join(" ") : "";
      return '<div class="row between cc-actions">' + search(tr("Business name", "Nombre del negocio")) + '<button class="btn small solid" data-act="cc_lead">' + esc(tr("+ New lead", "+ Nuevo cliente potencial")) + "</button></div>" +
        chips("st", [["", tr("All", "Todos")], ["prospect", tr("Lead", "Prospecto")], ["proposal", tr("Proposal", "Propuesta")], ["active", tr("Active contract", "Contrato activo")], ["paused", tr("Paused", "Pausado")], ["closed", tr("Closed", "Cerrado")]]) +
        (!x ? loading() : (stages ? '<p class="row" style="gap:6px;flex-wrap:wrap">' + stages + "</p>" : "") +
          '<p class="muted">' + esc(tr("Recurring commercial revenue (completed, 30 days): ", "Ingresos comerciales recurrentes (completados, 30 días): ") + cents(x.recurring_cents_30d)) + "</p>" +
          (x.rows.length ? tbl([tr("Business", "Negocio"), tr("Stage", "Etapa"), tr("Terms", "Términos"), tr("Locations", "Ubicaciones"), tr("Notes", "Notas"), ""],
            x.rows.map((a) => "<tr><td><b>" + esc(a.name) + "</b><br><small class=\"muted\">" + esc(a.billing_email || "") + "</small></td><td>" + statusPill(a.status) + "</td><td>" + esc(a.terms) + "</td><td>" + esc(a.locations) + "</td><td><small>" + esc(a.notes) + "</small></td>" +
              '<td><button class="btn ghost small" data-act="cc_stage" data-id="' + esc(a.id) + '" data-n="' + esc(a.name) + '" data-t="' + esc(a.terms) + '" data-e="' + esc(a.billing_email) + '" data-x="' + esc(a.notes) + '">' + esc(tr("Change stage", "Cambiar etapa")) + "</button></td></tr>")) + pager(x)
            : empty("bell", tr("No commercial leads yet", "Aún no hay clientes comerciales"), tr("Add offices, restaurants, hotels and buildings you're talking to.", "Agrega oficinas, restaurantes, hoteles y edificios con los que estás hablando."))));
    }

    function vMarkets(d) {
      const ms = d.markets; if (!ms) return loading();
      return ms.map((m) => {
        const done = m.checklist.filter((c) => c.done).length;
        const btn = m.status === "active" ? '<button class="btn ghost small" data-act="cc_market" data-id="' + esc(m.id) + '" data-s="paused" data-cl="' + (done < m.checklist.length ? "1" : "") + '">' + esc(tr("Pause market", "Pausar mercado")) + "</button>"
          : '<button class="btn small solid" data-act="cc_market" data-id="' + esc(m.id) + '" data-s="active">' + esc(tr("Activate", "Activar")) + "</button>";
        return card(m.name + " · " + m.state, '<div class="cc-kv"><span>' + esc(tr("Status", "Estado")) + "</span>" + pill(m.status, m.status === "active" ? "ok" : "") +
          "<span>" + esc(tr("ZIP coverage", "Cobertura ZIP")) + "</span><b>" + esc(m.zips + " " + (m.zips === 1 ? tr("area", "zona") : tr("areas", "zonas"))) + "</b><span>" + esc(tr("Cleaners", "Limpiadores")) + "</span><b>" + esc(m.providers) + "</b>" +
          "<span>" + esc(tr("Bookings · 30 days", "Pedidos · 30 días")) + "</span><b>" + esc(m.bookings_30d + " (" + m.completed_30d + " " + tr("done", "hechos") + ")") + "</b>" +
          "<span>" + esc(tr("Dispatch", "Despacho")) + "</span><b>" + esc(m.dispatch_mode + (m.dispatch_paused ? " · " + tr("paused", "pausado") : "")) + "</b>" +
          "<span>" + esc(tr("Launch checklist", "Lista de lanzamiento")) + "</span><b>" + done + " / " + m.checklist.length + "</b></div>" +
          '<details class="cc-areas"><summary>' + esc(tr("ZIP codes and checklist", "Códigos ZIP y lista")) + "</summary><p><small>" + esc(m.areas.join(" · ")) + "</small></p>" +
          '<ul class="cc-list">' + m.checklist.map((c) => "<li>" + (c.done ? "✓ " : "○ ") + esc(c.label) + "</li>").join("") + "</ul></details>", btn);
      }).join("") + '<p class="muted cc-asof">' + esc(tr("Activating a market needs its full launch checklist; the database refuses otherwise.", "Activar un mercado requiere su lista completa; la base de datos lo rechaza si falta algo.")) + "</p>";
    }

    function vReports(d) {
      const r = d.rep; if (!r) return loading();
      const s = st();
      const dayChips = '<div class="chips scroll">' + [7, 30, 90].map((n) => '<button class="chip-btn' + (s.days === n ? " on" : "") + '" data-act="cc_days" data-d="' + n + '">' + n + " " + esc(tr("days", "días")) + "</button>").join("") + "</div>";
      const MKN = { "miami-dade": "Miami-Dade", broward: "Broward", "palm-beach": "Palm Beach", orlando: "Orlando", tampa: "Tampa Bay" };
      const obj = (o, name) => Object.keys(o).length ? '<ul class="cc-list">' + Object.entries(o).map(([k, v]) => "<li>" + esc((name || SVC)(k)) + " · <b>" + esc(v) + "</b></li>").join("") + "</ul>" : '<p class="muted">—</p>';
      return dayChips + marketChips() +
        '<div class="tiles">' + kpi(tr("Booking conversion", "Conversión"), r.conversion_pct == null ? "—" : r.conversion_pct + "%", n0(r.completed) + " / " + n0(r.created) + " " + tr("completed", "completados")) +
        kpi(tr("Cancelled", "Cancelados"), n0(r.cancelled), "") + kpi(tr("Minutes to assign", "Minutos para asignar"), n0(r.avg_minutes_to_assign), tr("average", "promedio")) +
        kpi(tr("Average rating", "Calificación promedio"), r.avg_rating == null ? "—" : r.avg_rating, n0(r.low_ratings) + " " + tr("low (1–2★)", "bajas (1–2★)"), r.low_ratings ? "warn" : "") + "</div>" +
        '<div class="tiles">' + kpi(tr("Cleaner pay", "Pago a limpiadores"), money(r.gmv), tr("completed jobs", "trabajos completados")) + kpi(tr("Our fees", "Nuestras tarifas"), money(r.fees), tr("from completed jobs", "de trabajos completados")) +
        kpi(tr("Repeat customers", "Clientes que repiten"), n0(r.repeat_customers), tr("of ", "de ") + n0(r.customers_with_completed) + tr(" with a finished job", " con trabajo terminado")) + "</div>" +
        card(tr("By service", "Por servicio"), obj(r.by_service)) + card(tr("By market", "Por mercado"), obj(r.by_market, (k) => MKN[k] || k)) +
        card(tr("Cleaner performance", "Rendimiento de limpiadores"), r.providers.length ? tbl([tr("Cleaner", "Limpiador"), tr("Jobs", "Trabajos"), tr("Rating", "Calificación"), tr("Accepts offers", "Acepta ofertas")], r.providers.map((p) => "<tr><td>" + esc(p.name) + "</td><td>" + esc(p.jobs) + "</td><td>" + esc(p.rating || "—") + "</td><td>" + esc(p.accept_pct == null ? "—" : p.accept_pct + "%") + "</td></tr>")) : '<p class="muted">' + esc(tr("No completed jobs in this period.", "No hay trabajos completados en este periodo.")) + "</p>") +
        '<p class="muted cc-asof">' + esc(tr("Every number is counted from records. Profit after Stripe fees appears once card payments are live.", "Cada número se cuenta de los registros. La ganancia después de las comisiones de Stripe aparece cuando los pagos con tarjeta estén activos.")) + "</p>";
    }

    // ───────── screen ─────────
    function view() {
      const s = st(), d = S.data || {};
      const nav = '<nav class="cc-nav" aria-label="' + esc(tr("Command Center modules", "Módulos del centro de mando")) + '">' + MODS.map(([k, ic, en, es]) =>
        '<button data-act="cc_mod" data-m="' + k + '"' + (s.mod === k ? ' class="on" aria-current="page"' : "") + ">" + icon(ic) + "<span>" + esc(tr(en, es)) + "</span></button>").join("") + "</nav>";
      const title = MODS.find((m) => m[0] === s.mod);
      let body;
      if (d.ccError) body = '<div class="cc-error" role="alert"><b>' + esc(tr("Couldn't load this module", "No se pudo cargar este módulo")) + "</b><p class=\"muted\">" + esc(d.ccError) + '</p><button class="btn small solid" data-act="cc_retry">' + esc(tr("Try again", "Intentar de nuevo")) + "</button></div>";
      else if (d.loading && !d.ccReady) body = loading();
      else body = ({ overview: vOverview, bookings: vBookings, dispatch: vDispatch, customers: vCustomers, workforce: vWorkforce, companies: vCompanies, ai: vAI, robotics: vRobotics,
        finance: vFinance, sales: vSales, markets: vMarkets, reports: vReports }[s.mod] || vOverview)(d);
      return '<div class="cc"><header class="cc-head"><p class="eyebrow">' + icon("shield") + esc(tr("Command Center", "Centro de mando")) + "</p><h1 class=\"title\">" + esc(tr(title[2], title[3])) + "</h1></header>" + nav + '<div class="cc-body">' + body + "</div></div>";
    }

    // ───────── actions (every change is checked and logged by the database) ─────────
    async function reload() { c.reload(); }
    async function act(a, el) {
      const s = st();
      const run = async (fn, args, ok) => { try { await API.cc(fn, args); if (ok) toast(ok, "ok"); reload(); } catch (e) { toast(c.errMsg(e) || String(e.message || e), "bad"); } };
      if (a === "cc_mod") { S.cc = { mod: el.dataset.m, q: "", st: "", mk: s.mk, page: 1, sel: null, days: s.days }; S.data = {}; reload(); }
      else if (a === "cc_filter") { s[el.dataset.k] = el.dataset.v; s.page = 1; s.sel = null; reload(); }
      else if (a === "cc_page") { s.page = Math.max(1, Number(el.dataset.p) || 1); reload(); }
      else if (a === "cc_days") { s.days = Number(el.dataset.d) || 30; reload(); }
      else if (a === "cc_open") { s.sel = el.dataset.id; reload(); }
      else if (a === "cc_back") { s.sel = null; reload(); }
      else if (a === "cc_retry") { reload(); }
      else if (a === "cc_dispatch_open") { s.mod = "dispatch"; s.sel = el.dataset.id; reload(); }
      else if (a === "cc_assign") {
        if (!window.confirm(tr("Assign " + el.dataset.n + " to this job? They'll be told right away.", "¿Asignar a " + el.dataset.n + " a este trabajo? Se le avisará enseguida."))) return;
        await run("admin_assign", { p_booking: el.dataset.id, p_worker: el.dataset.w }, tr("Assigned", "Asignado"));
      } else if (a === "cc_reschedule") {
        const w = window.prompt(tr("New date and time (YYYY-MM-DD HH:MM, Eastern)", "Nueva fecha y hora (AAAA-MM-DD HH:MM, hora del Este)")); if (!w) return;
        const d = new Date(w.replace(" ", "T")); if (isNaN(d)) { toast(tr("That date isn't valid.", "Esa fecha no es válida."), "bad"); return; }
        const why = window.prompt(tr("Reason (shared in the history)", "Motivo (queda en el historial)")); if (!why) return;
        await run("cc_reschedule", { p_booking: el.dataset.id, p_when: d.toISOString(), p_reason: why }, tr("Rescheduled", "Reprogramado"));
      } else if (a === "cc_cancel") {
        const why = window.prompt(tr("Why are you cancelling? The customer and cleaner are told; a card hold is released.", "¿Por qué cancelas? Se avisa al cliente y al limpiador; se libera la retención de la tarjeta.")); if (!why) return;
        await run("cc_cancel", { p_booking: el.dataset.id, p_reason: why }, tr("Cancelled", "Cancelado"));
      } else if (a === "cc_decide") {
        const ok = el.dataset.s === "approved";
        const why = ok ? null : window.prompt(tr("Reason for rejecting", "Motivo del rechazo")); if (!ok && !why) return;
        await run("admin_decide_approval", { p_id: el.dataset.id, p_status: el.dataset.s, p_reason: why }, ok ? tr("Approved", "Aprobado") : tr("Rejected", "Rechazado"));
      } else if (a === "cc_lead") {
        const name = window.prompt(tr("Business name", "Nombre del negocio")); if (!name) return;
        const email = window.prompt(tr("Billing email (optional)", "Correo de facturación (opcional)")) || "";
        const notes = window.prompt(tr("Notes: walkthrough date, size, contact (optional)", "Notas: fecha de visita, tamaño, contacto (opcional)")) || "";
        await run("cc_save_account", { p_id: null, p_name: name, p_status: "prospect", p_terms: "per_job", p_billing_email: email, p_notes: notes }, tr("Lead saved", "Guardado"));
      } else if (a === "cc_stage") {
        const stg = window.prompt(tr("New stage: prospect, proposal, active, paused or closed", "Nueva etapa: prospect, proposal, active, paused o closed")); if (!stg) return;
        if (stg.trim() === "active" && !window.confirm(tr("Mark this as an ACTIVE contract? This commits the company to the service.", "¿Marcar como contrato ACTIVO? Compromete a la empresa con el servicio."))) return;
        await run("cc_save_account", { p_id: el.dataset.id, p_name: el.dataset.n, p_status: stg.trim(), p_terms: el.dataset.t, p_billing_email: el.dataset.e, p_notes: el.dataset.x }, tr("Saved", "Guardado"));
      } else if (a === "cc_market") {
        const on = el.dataset.s === "active";
        if (!window.confirm(on ? tr("Activate this market? Customers there can book right away. The full launch checklist is required.", "¿Activar este mercado? Los clientes podrán reservar enseguida. Se requiere la lista completa.") : tr("Pause this market? New bookings there will be refused.", "¿Pausar este mercado? Se rechazarán pedidos nuevos allí.") +
          (el.dataset.cl ? "\n\n" + tr("Warning: its launch checklist isn't complete, so you won't be able to turn it back on until every item is checked.", "Atención: su lista de lanzamiento no está completa; no podrás reactivarlo hasta marcar todos los puntos.") : ""))) return;
        await run("admin_set_market_status", { p_market: el.dataset.id, p_status: el.dataset.s }, tr("Market updated", "Mercado actualizado"));
      }
    }
    function searchSubmit(q) { const s = st(); s.q = (q || "").trim(); s.page = 1; s.sel = null; reload(); }

    return { load, view, act, searchSubmit };
  };
})();
