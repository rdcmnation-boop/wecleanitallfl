// We Clean It All — DoorDash-style layer for all three roles:
// side menu (☰) with Log out, a log-out sheet, full-page Notifications and Messages,
// the customer's live order tracker, and the cleaner's screens (Home with zones and one big
// "Go active" button, Earnings with a weekly goal, Ratings with tiers, Account, Help).
// Plain JS, no build step. app.js passes its helpers in, the same way it does for owner.js.
(function () {
  "use strict";
  const I = window.WCIA_I18N;
  Object.assign(I.es, {
    m_home: "Inicio", m_schedule: "Agenda", m_ratings: "Calificaciones", m_career: "Capacitación y carrera", m_tips: "Consejos",
    m_help: "Ayuda", m_menu: "Menú", tab_home: "Inicio", tab_more: "Más",
    fee_cleaner: "Para tu limpiador", fee_service: "Tarifa de servicio ({p}%)", fee_total: "Total",
    payout_title: "Cómo te pagan", payout_keep: "Te quedas con el 100% del precio del trabajo y de las propinas.", payout_weekly: "Pago semanal", payout_free: "Gratis, cada lunes a tu banco",
    payout_instant: "Pago el mismo día", payout_per: "por retiro", payout_soon: "Los pagos en la app empiezan cuando se activen los pagos con tarjeta.",
    price_label: "Precio", price_hint: "Precio justo para este tamaño: {p} · tu limpiador gana unos {h} por hora. Puedes agregar más, no menos.",
    price_low: "El precio no puede ser menos de {p}: es lo que el limpiador necesita para este trabajo.", open_all: "Abrir todo", close_all: "Cerrar todo", price_too_low: "El precio está por debajo de lo justo para el limpiador. Súbelo e intenta de nuevo.",
    brain_off_owner: "La IA se activa al agregar la clave de Claude (máximo $10 al mes). Mientras tanto, usa el resumen del panel.",
    sign_out: "Cerrar sesión", log_out: "Cerrar sesión", sign_out_q: "¿Cerrar sesión?",
    sign_out_all: "Cerrar sesión en todos mis dispositivos",
    sign_out_guest: "Estás usando la app sin cuenta. Si cierras sesión, pierdes el acceso a tus pedidos en este teléfono. Guarda tu cuenta primero.",
    this_week: "Esta semana", go_active: "Ponerme activo", go_offline: "Dejar de recibir trabajos",
    dash_hot: "Hay trabajo en {zip}. Ponte activo.", dash_ready: "¿Listo para limpiar? Ponte activo.",
    dash_looking: "Buscando trabajos cerca de ti…", dash_looking_sub: "Quédate cerca de tus zonas. Las ofertas llegan aquí y a tus avisos.",
    dash_pending: "Tu cuenta está en revisión", jobs_waiting: "Trabajos esperando", time_to_match: "Tiempo promedio para asignar",
    no_data_yet: "Aún sin datos", n_jobs_short: "{n} trabajos", n_job_one: "1 trabajo", your_zone: "Tu zona", add_zones: "Agrega tus ZIP",
    next_job: "Próximo trabajo", cleaning_now: "Limpiando", navigate: "Navegar", on_my_way: "Voy en camino",
    onway_sent: "Le avisamos al cliente que vas en camino.", new_offer: "Nueva oferta", more_offers: "+{n} ofertas más",
    messages: "Mensajes", current_task: "Trabajo actual {code}", current_order: "Pedido actual {code}",
    no_messages: "Cuando tengas un trabajo, aquí hablas con el cliente.", no_messages_c: "Cuando tengas limpiador asignado, aquí hablas con él.",
    support_name: "Soporte de We Clean It All", tag_customer: "Cliente", tag_cleaner: "Limpiador", tag_support: "Soporte",
    jobs_completed_n: "{n} trabajos completados", just_now: "Ahora",
    tier_none: "Estándar", tier_silver: "Plata", tier_gold: "Oro", tier_platinum: "Platino", score_new: "Nuevo",
    overall_rating: "Puntuación general", rating_factors: "Lo que cuenta en tu puntuación",
    f_accept: "Aceptación", f_ontime: "Puntualidad", f_rating: "Calificación de clientes", f_quality: "Calidad", f_jobs30: "Trabajos en 30 días",
    pts: "{a} de {b} puntos", lvl_vhigh: "Muy alto", lvl_high: "Alto", lvl_mid: "Medio", lvl_low: "Bajo", lvl_none: "Sin datos",
    score_how: "Acepta ofertas, empieza a tiempo y cuida la calidad para subir de nivel: Plata desde 55, Oro desde 75 y Platino desde 85.",
    week_goal: "Meta semanal", goal_prompt: "¿Cuánto quieres ganar esta semana? (en dólares)", goal_left: "Faltan {m}",
    goal_set: "Poner meta", goal_done: "¡Meta cumplida!", earn_history: "Historial de ganancias",
    acct_profile: "Perfil, servicios y documentos", acct_lang: "Idioma de la app", acct_version: "Versión",
    help_title: "Ayuda", help_faq: "Preguntas frecuentes", help_contact: "Habla con nosotros",
    trk_finding: "Buscando limpiador", trk_assigned: "Limpiador asignado", trk_onway: "En camino", trk_cleaning: "Limpiando", trk_done: "Listo",
    trk_h_finding: "Buscando al mejor limpiador cerca de ti", trk_h_assigned: "{name} va a limpiar tu lugar", trk_h_onway: "{name} va en camino",
    trk_h_cleaning: "{name} está limpiando", trk_h_done: "¡Limpieza completa!", trk_since: "desde {t}",
    n_cleaner_on_way: "Tu limpiador va en camino ({code})", n_job_started: "Tu limpiador empezó a limpiar ({code})",
    nb_cleaner_on_way: "Síguelo en vivo en Mis pedidos.", nb_job_started: "El tiempo de limpieza corre desde ahora.",
    nb_booking_assigned: "Ya puedes escribirle o llamarle desde Mis pedidos.", nb_booking_completed: "Califica el servicio en Mis pedidos.",
    nb_job_offer: "Ábrela en Inicio para aceptarla.", nb_job_assigned: "Mira los detalles en tu Agenda.", nb_worker_approved: "Ya puedes ponerte activo y recibir trabajos.",
    order_progress: "Progreso de pedidos",
    door_customer: "Clientes", door_worker: "Limpiadores", door_admin: "Dueños",
    door_customer_sub: "Pedir y seguir", door_worker_sub: "Trabajos y ganancias", door_admin_sub: "Requiere aprobación · código 2 pasos",
    owner_signin_note: "El acceso de dueño lo aprueba We Clean It All. Después de tu contraseña te pedimos tu código de 2 pasos para entrar a las aprobaciones.",
    sign_in_as: "entra como", sign_in_role: "Entrar como {r}", signed_as: "Entraste como {r}",
    signed_other: "Esta cuenta es de {r}. Te llevamos a ese lado de la app.", out_as: "Cuenta de {r} · {name}",
    want_work_sub: "Personas y compañías · trabajo y carrera",
    faq_w1_q: "¿Por qué no puedo ponerme activo?", faq_w1_a: "El dueño tiene que aprobar tu cuenta, y tu perfil necesita tus ZIP, tus servicios y tu teléfono. Si ya está completo, escríbenos por WhatsApp.",
    faq_w2_q: "¿Cómo recibo más ofertas?", faq_w2_a: "Agrega más ZIP y servicios en tu perfil, ponte activo cuando hay trabajo en tus zonas y cuida tus calificaciones.",
    faq_w3_q: "¿Cómo me pagan?", faq_w3_a: "Por ahora el pago de cada trabajo completado se coordina fuera de la app con We Clean It All. Escríbenos para conocer los días y la forma de pago.",
    faq_w4_q: "¿Qué hago si no puedo llegar a un trabajo?", faq_w4_a: "Avísale al cliente y a nosotros desde Mensajes lo antes posible.",
    faq_w5_q: "¿Puedo trabajar como compañía?", faq_w5_a: "Sí. En tu perfil elige Compañía y pon el nombre y el tamaño de tu equipo. Recibes ofertas igual que una persona.",
    faq_c1_q: "¿Cómo se elige a mi limpiador?", faq_c1_a: "La app envía tu pedido a los limpiadores aprobados y disponibles de tu zona que hacen ese servicio. El primero que acepta se queda con el trabajo.",
    faq_c2_q: "¿Quién ve mi dirección?", faq_c2_a: "Solo el limpiador que acepta tu pedido. Antes de aceptar, los limpiadores ven solo tu zona.",
    faq_c3_q: "¿Cómo sigo a mi limpiador?", faq_c3_a: "En Mis pedidos ves cada paso: asignado, en camino, limpiando y listo. Te llega un aviso en cada paso.",
    faq_c4_q: "¿Puedo cancelar?", faq_c4_a: "Sí, antes de que empiece la limpieza, desde Mis pedidos. Para cambios o reembolsos escribe a wecleanitallfl@gmail.com.",
    faq_c5_q: "¿Cuánto cuesta?", faq_c5_a: "La app sugiere un precio según el servicio, las habitaciones y los baños. Tú lo puedes ajustar y la empresa lo confirma."
  });
  Object.assign(I.en, {
    m_home: "Home", m_schedule: "Schedule", m_ratings: "Ratings", m_career: "Training & career", m_tips: "Tips",
    m_help: "Help", m_menu: "Menu", tab_home: "Home", tab_more: "More",
    fee_cleaner: "For your cleaner", fee_service: "Service fee ({p}%)", fee_total: "Total",
    payout_title: "How you get paid", payout_keep: "You keep 100% of the job price and tips.", payout_weekly: "Weekly payout", payout_free: "Free, every Monday to your bank",
    payout_instant: "Same-day payout", payout_per: "per cash-out", payout_soon: "In-app payouts start when card payments are turned on.",
    price_label: "Price", price_hint: "Fair price for this size: {p} · your cleaner earns about {h} an hour. You can add more, not less.",
    price_low: "The price can't be below {p}: that's what your cleaner needs for this job.", open_all: "Open all", close_all: "Close all", price_too_low: "The price is below fair pay for the cleaner. Raise it and try again.",
    brain_off_owner: "AI turns on when the Claude key is added ($10/month max). For now, use the panel summary.",
    sign_out: "Log out", log_out: "Log out", sign_out_q: "Log out?",
    sign_out_all: "Log out on all my devices",
    sign_out_guest: "You're using the app without an account. If you log out, you lose access to your orders on this phone. Save your account first.",
    this_week: "This week", go_active: "Go active", go_offline: "Stop getting jobs",
    dash_hot: "Jobs waiting in {zip}. Go active.", dash_ready: "Ready to clean? Go active.",
    dash_looking: "Looking for jobs near you…", dash_looking_sub: "Stay near your zones. Offers show up here and in your alerts.",
    dash_pending: "Your account is being reviewed", jobs_waiting: "Jobs waiting", time_to_match: "Avg. time to match",
    no_data_yet: "No data yet", n_jobs_short: "{n} jobs", n_job_one: "1 job", your_zone: "Your zone", add_zones: "Add your ZIPs",
    next_job: "Next job", cleaning_now: "Cleaning", navigate: "Navigate", on_my_way: "I'm on my way",
    onway_sent: "We told the customer you're on the way.", new_offer: "New offer", more_offers: "+{n} more offers",
    messages: "Messages", current_task: "Current task {code}", current_order: "Current order {code}",
    no_messages: "When you have a job, you talk to the customer here.", no_messages_c: "Once a cleaner is assigned, you talk to them here.",
    support_name: "We Clean It All support", tag_customer: "Customer", tag_cleaner: "Cleaner", tag_support: "Support",
    jobs_completed_n: "{n} jobs completed", just_now: "Just now",
    tier_none: "Standard", tier_silver: "Silver", tier_gold: "Gold", tier_platinum: "Platinum", score_new: "New",
    overall_rating: "Overall rating", rating_factors: "Your rating factors",
    f_accept: "Acceptance rate", f_ontime: "On-time rate", f_rating: "Customer rating", f_quality: "Quality rate", f_jobs30: "Last 30-day jobs",
    pts: "{a} of {b} points", lvl_vhigh: "Very high", lvl_high: "High", lvl_mid: "Medium", lvl_low: "Low", lvl_none: "No data",
    score_how: "Accept offers, start on time and keep quality high to move up: Silver from 55, Gold from 75 and Platinum from 85.",
    week_goal: "Weekly goal", goal_prompt: "How much do you want to earn this week? (dollars)", goal_left: "{m} remaining",
    goal_set: "Set goal", goal_done: "Goal reached!", earn_history: "Earnings history",
    acct_profile: "Profile, services & documents", acct_lang: "App language", acct_version: "Version",
    help_title: "Help", help_faq: "Frequent questions", help_contact: "Talk to us",
    trk_finding: "Finding a cleaner", trk_assigned: "Cleaner assigned", trk_onway: "On the way", trk_cleaning: "Cleaning", trk_done: "Done",
    trk_h_finding: "Finding the best cleaner near you", trk_h_assigned: "{name} will clean your place", trk_h_onway: "{name} is on the way",
    trk_h_cleaning: "{name} is cleaning", trk_h_done: "Cleaning complete!", trk_since: "since {t}",
    n_cleaner_on_way: "Your cleaner is on the way ({code})", n_job_started: "Your cleaner started cleaning ({code})",
    nb_cleaner_on_way: "Track them live in My orders.", nb_job_started: "The cleaning timer is running.",
    nb_booking_assigned: "You can message or call them from My orders.", nb_booking_completed: "Rate the service in My orders.",
    nb_job_offer: "Open Home to accept it.", nb_job_assigned: "See the details in your Schedule.", nb_worker_approved: "You can go active and get jobs now.",
    order_progress: "Order progress",
    door_customer: "Clients", door_worker: "Cleaners", door_admin: "Owners",
    door_customer_sub: "Book & track", door_worker_sub: "Jobs & earnings", door_admin_sub: "Approval required · 2-step code",
    owner_signin_note: "Owner access is approved by We Clean It All. After your password we ask for your 2-step code to open approvals.",
    sign_in_as: "sign in as", sign_in_role: "Sign in as {r}", signed_as: "Signed in as {r}",
    signed_other: "This is a {r} account. We took you to that side of the app.", out_as: "{r} account · {name}",
    role_customer: "Client",
    want_work_sub: "Individuals & companies · jobs and a career",
    faq_w1_q: "Why can't I go active?", faq_w1_a: "The owner has to approve your account, and your profile needs your ZIPs, services and phone. If it's complete, message us on WhatsApp.",
    faq_w2_q: "How do I get more offers?", faq_w2_a: "Add more ZIPs and services to your profile, go active when your zones are busy, and keep your ratings high.",
    faq_w3_q: "How do I get paid?", faq_w3_a: "For now, pay for each completed job is arranged outside the app with We Clean It All. Message us for pay days and method.",
    faq_w4_q: "What if I can't make it to a job?", faq_w4_a: "Tell the customer and us from Messages as soon as you can.",
    faq_w5_q: "Can I work as a company?", faq_w5_a: "Yes. In your profile pick Company and add your company name and team size. You get offers the same way as an individual.",
    faq_c1_q: "How is my cleaner chosen?", faq_c1_a: "The app sends your order to approved, available cleaners in your area who do that service. The first one to accept gets the job.",
    faq_c2_q: "Who sees my address?", faq_c2_a: "Only the cleaner who accepts your order. Before that, cleaners see only your area.",
    faq_c3_q: "How do I track my cleaner?", faq_c3_a: "My orders shows every step: assigned, on the way, cleaning and done. You get an alert at each step.",
    faq_c4_q: "Can I cancel?", faq_c4_a: "Yes, before the cleaning starts, from My orders. For changes or refunds email wecleanitallfl@gmail.com.",
    faq_c5_q: "How much does it cost?", faq_c5_a: "The app suggests a price from the service, bedrooms and bathrooms. You can adjust it and the company confirms it."
  });

  const DAY = 864e5;
  const MENU = {
    customer: [["book", "home", "m_home"], ["orders", "list", "tab_orders"], ["account", "user", "tab_account"], ["learn", "bulb", "m_tips"], ["help", "help", "m_help"]],
    worker: [["dash", "home", "m_home"], ["myjobs", "calendar", "m_schedule"], ["earnings", "cash", "tab_earnings"], ["ratings", "star", "m_ratings"], ["account", "user", "tab_account"], ["learn", "bulb", "m_career"], ["help", "help", "m_help"]],
    admin: [["panel", "grid", "tab_panel"], ["bookings", "list", "tab_bookings"], ["workers", "users", "tab_workers"], ["analytics", "chart", "tab_analytics"], ["system", "spark", "tab_more"], ["learn", "bulb", "tab_learn"], ["account", "user", "tab_account"]]
  };
  const FAQ = { worker: ["w1", "w2", "w3", "w4", "w5"], customer: ["c1", "c2", "c3", "c4", "c5"] };
  const TRK = ["finding", "assigned", "onway", "cleaning", "done"];
  // Icons for each kind of alert on the Notifications page.
  const N_ICON = { job_offer: "spark", booking_assigned: "user", job_assigned: "calendar", cleaner_on_way: "nav", job_started: "clock", booking_completed: "check", booking_cancelled: "x", worker_approved: "shield" };

  window.WCIA_DASH = function (c) {
    const { t, esc, icon, money, when, svcName, S, CFG, wa, tel, empty, loading, jobTimer, statusBanner, reviewsPanel, role, brainCard, store, tile } = c;
    const L = () => c.lang() === "es";
    const loc = () => (L() ? "es-US" : "en-US");
    const has = (k) => !!(I.es[k] || I.en[k]);

    const firstName = (n) => { const p = String(n || "").trim().split(/\s+/); return p[0] ? p[0] + (p[1] ? " " + p[1][0] : "") : ""; };
    const money2 = (n) => "$" + Number(n || 0).toLocaleString(loc(), { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const hhmm = (iso) => new Date(iso).toLocaleTimeString(loc(), { hour: "numeric", minute: "2-digit" });
    function ago(iso) {
      const d = (Date.now() - Date.parse(iso)) / 1000;
      if (!isFinite(d) || d < 45) return t("just_now");
      const rtf = new Intl.RelativeTimeFormat(L() ? "es" : "en", { numeric: "auto" });
      for (const [u, s] of [["year", 31536000], ["month", 2592000], ["week", 604800], ["day", 86400], ["hour", 3600], ["minute", 60]]) if (d >= s) return rtf.format(-Math.floor(d / s), u);
      return t("just_now");
    }
    // Weeks start on Monday, like a pay week.
    const weekStart = () => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.getTime(); };
    const earned = (jobs, from, to) => jobs.filter((b) => { const x = Date.parse(b.completed_at); return b.status === "completed" && x >= from && (to == null || x < to); }).reduce((s, b) => s + (Number(b.budget) || 0), 0);
    const goalKey = () => "wcia_goal_" + ((S.me && S.me.profile && S.me.profile.id) || "");

    // ───────── shared: side menu, log out, notifications, messages ─────────
    const menuBtn = () => '<button class="round-btn" data-act="menu" aria-label="' + esc(t("m_menu")) + '">' + icon("menu") + "</button>";

    function drawer() {
      if (!S.menuOpen || !S.me) return "";
      const r = role(), p = S.me.profile || {}, w = S.me.worker;
      const sub = r === "worker" ? t("jobs_completed_n", { n: (w && w.jobs_done) || 0 }) : t("role_" + r);
      const tier = r === "worker" && S.tier ? '<button class="tier-chip t-' + S.tier + '" data-act="tab" data-tab="ratings">' + icon("star") + esc(t("tier_" + S.tier)) + icon("chev") + "</button>" : "";
      const items = (MENU[r] || []).map(([k, ic, lab]) => '<button class="dr-item' + (S.tab === k ? " on" : "") + '" data-act="tab" data-tab="' + k + '">' + icon(ic) + "<span>" + esc(t(lab)) + "</span></button>").join("");
      return '<div class="dr-wrap" data-act="menuclose"><nav class="drawer" data-act="noop" aria-label="' + esc(t("m_menu")) + '">' +
        '<div class="dr-head"><b>' + esc(firstName(p.full_name) || t("role_" + r)) + "</b><small>" + esc(sub) + "</small>" + tier + "</div>" +
        '<div class="dr-list">' + items + "</div>" +
        '<div class="dr-foot"><button class="dr-item" data-act="lang">' + icon("globe") + "<span>" + esc(L() ? "English" : "Español") + "</span></button>" +
        '<button class="dr-item out" data-act="signout">' + icon("out") + "<span>" + esc(t("log_out")) + "</span></button></div></nav></div>";
    }

    function signOutSheet() {
      if (!S.outSheet || !S.me) return "";
      const guest = !S.me.isAdmin && (S.me.isGuest || S.me.needsAccount);
      return '<div class="modal" role="dialog" aria-modal="true" aria-label="' + esc(t("sign_out_q")) + '"><div class="modal-card stack out-card">' +
        '<div class="out-ic">' + icon("out", "xl") + "</div><h2>" + esc(t("sign_out_q")) + "</h2>" +
        '<p class="role-chip r-' + role() + '">' + esc(t("out_as", { r: t("role_" + role()), name: firstName((S.me.profile || {}).full_name) || "—" })) + "</p>" +
        (guest ? '<p class="muted">' + esc(t("sign_out_guest")) + '</p><button class="btn solid block" data-act="tab" data-tab="account">' + esc(t("guest_save")) + "</button>" : "") +
        '<button class="btn ' + (guest ? "ghost" : "solid") + ' block" data-act="signout-yes">' + icon("out") + esc(t("log_out")) + "</button>" +
        (guest ? "" : '<button class="btn ghost block" data-act="signout-all">' + esc(t("sign_out_all")) + "</button>") +
        '<button class="link-btn center" data-act="signout-cancel">' + esc(t("cancel")) + "</button></div></div>";
    }

    function notesPage() {
      if (!S.notesOpen) return "";
      const items = S.notes || [];
      const row = (n) => {
        const code = (n.payload && n.payload.code) || "";
        const body = has("nb_" + n.template) ? t("nb_" + n.template, { code }) : "";
        return '<li class="' + (S.notesNew && S.notesNew.has(n.id) ? "new" : "") + '"><span class="nic">' + icon(N_ICON[n.template] || "bulb") + "<i></i></span><div><b>" + esc(t("n_" + n.template, { code })) + "</b>" +
          (body ? "<p>" + esc(body) + "</p>" : "") + "<small>" + esc(ago(n.created_at)) + "</small></div></li>";
      };
      return '<div class="page" role="dialog" aria-modal="true" aria-label="' + esc(t("notifications")) + '"><div class="page-top"><button class="round-btn" data-act="notesclose" aria-label="' + esc(t("back")) + '">' + icon("back") + "</button></div>" +
        '<h1 class="page-title">' + esc(t("notifications")) + "</h1>" +
        (items.length ? '<ul class="nlist">' + items.map(row).join("") + "</ul>" : empty("bell", t("no_notifications"))) + "</div>";
    }

    function messagesPage() {
      const m = S.msgs; if (!m) return "";
      const r = role();
      const contact = (phone, text) => phone ? '<div class="row gap"><a class="btn wa small" target="_blank" rel="noopener" href="' + esc(wa(phone, text || "")) + '">' + icon("chat") + 'WhatsApp</a><a class="btn ghost small" href="' + esc(tel(phone)) + '">' + icon("phone") + esc(t("call")) + "</a></div>" : "";
      const rows = (m.items || []).map((x) => '<li class="mrow"><span class="mtag">' + icon(x.tag === "customer" ? "home" : "broom") + esc(t("tag_" + x.tag)) + "</span><b>" + esc(firstName(x.name)) + "</b><small>" +
        esc(t(r === "worker" ? "current_task" : "current_order", { code: x.code })) + "</small>" + contact(x.phone, x.text) + "</li>").join("");
      const support = '<li class="mrow"><span class="mtag">' + icon("shield") + esc(t("tag_support")) + "</span><b>" + esc(t("support_name")) + "</b>" + contact(CFG.BUSINESS_PHONE, "") + "</li>";
      return '<div class="page" role="dialog" aria-modal="true" aria-label="' + esc(t("messages")) + '"><div class="page-top"><button class="round-btn" data-act="msgsclose" aria-label="' + esc(t("close")) + '">' + icon("x") + "</button></div>" +
        '<h1 class="page-title">' + esc(t("messages")) + "</h1>" +
        (m.loading ? loading() : '<ul class="mlist">' + (rows || (r !== "admin" ? '<li class="muted mrow">' + esc(t(r === "worker" ? "no_messages" : "no_messages_c")) + "</li>" : "")) + support + "</ul>") + "</div>";
    }

    // ───────── customer: live order tracker ─────────
    const stage = (b) => b.status === "completed" ? 4 : b.status === "in_progress" ? 3 : b.status === "assigned" ? (b.on_way_at ? 2 : 1) : 0;
    function tracker(b) {
      if (b.status === "cancelled") return '<div class="pill bad">' + esc(t("st_cancelled")) + "</div>";
      const i = stage(b), name = firstName(b.worker && b.worker.name) || t("your_cleaner");
      const at = [b.created_at, b.assigned_at, b.on_way_at, b.started_at, b.completed_at][i];
      return '<div class="trk s' + i + '"><p class="trk-h">' + esc(t("trk_h_" + TRK[i], { name })) + "</p>" +
        '<div class="trk-bar" role="progressbar" aria-valuemin="0" aria-valuemax="4" aria-valuenow="' + i + '">' + [0, 1, 2, 3].map((j) => '<i class="' + (j < i ? "done" : j === i ? "now" : "") + '"></i>').join("") + "</div>" +
        '<p class="trk-s"><b>' + esc(t("trk_" + TRK[i])) + "</b>" + (at ? " · " + esc(t("trk_since", { t: hhmm(at) })) : "") + "</p></div>";
    }

    // ───────── cleaner: Home (zones + one big button) ─────────
    function zonesFor(w, dem) {
      const mine = w.zips || [], map = new Map();
      ((dem && dem.zones) || []).forEach((z) => map.set(z.zip, { zip: z.zip, city: z.city || "", n: Number(z.n) || 0, mine: mine.includes(z.zip) }));
      mine.forEach((z) => { if (map.has(z)) map.get(z).mine = true; else map.set(z, { zip: z, city: "", n: 0, mine: true }); });
      return [...map.values()].sort((a, b) => (b.n - a.n) || (b.mine - a.mine) || a.zip.localeCompare(b.zip)).slice(0, 12);
    }
    function zoneBoard(w, dem) {
      const zs = zonesFor(w, dem);
      if (!zs.length) return '<div class="zones"><button class="hex add" data-act="tab" data-tab="profile"><b>+</b><small>' + esc(t("add_zones")) + "</small></button></div>";
      const you = zs.find((z) => z.mine);
      return '<div class="zones">' + zs.map((z) => '<div class="hex' + (z.n ? " hot" : "") + (z.mine ? " mine" : "") + '">' +
        (z.n ? '<span class="zbadge">' + esc(t(z.n === 1 ? "n_job_one" : "n_jobs_short", { n: z.n })) + "</span>" : "") + "<b>" + esc(z.zip) + "</b>" +
        (z.city ? "<small>" + esc(z.city) + "</small>" : z.mine ? "<small>" + esc(t("your_zone")) + "</small>" : "") +
        (z === you ? '<i class="you" aria-hidden="true"></i>' : "") + "</div>").join("") + "</div>";
    }
    function bigButton(enabled, on) {
      return '<div class="dash-cta"><button class="btn ' + (on ? "ghost" : "solid") + ' xl grow" data-act="' + (on ? "gooffline" : "goactive") + '"' + (enabled ? "" : " disabled") + ">" +
        esc(on ? t("go_offline") : t("go_active")) + '</button><button class="round-btn big" data-act="tab" data-tab="myjobs" aria-label="' + esc(t("m_schedule")) + '">' + icon("calendar") + "</button></div>";
    }
    function idleSheet(w, dem, next) {
      const busy = ((dem && dem.zones) || []).filter((z) => Number(z.n) > 0);
      const hot = busy.find((z) => (w.zips || []).includes(z.zip)) || busy[0];
      const waiting = busy.reduce((s, z) => s + Number(z.n), 0);
      const head = w.available ? t("dash_looking") : hot ? t("dash_hot", { zip: hot.city ? hot.city + " · " + hot.zip : hot.zip }) : t("dash_ready");
      return '<h2 class="dash-h">' + esc(head) + "</h2>" +
        (w.available ? '<div class="looking" aria-hidden="true"><i></i><i></i><i></i></div><p class="muted">' + esc(t("dash_looking_sub")) + "</p>" : "") +
        '<div class="stat-row"><div class="stat-box"><small>' + esc(t("jobs_waiting")) + "</small><b>" + waiting + '</b></div><div class="stat-box"><small>' + esc(t("time_to_match")) + "</small><b>" +
        esc(dem && dem.avg_wait_min != null ? "~" + dem.avg_wait_min + " min" : t("no_data_yet")) + "</b></div></div>" +
        (next ? '<button class="next-line" data-act="tab" data-tab="myjobs">' + icon("calendar") + "<span>" + esc(t("next_job")) + ": <b>" + esc(next.urgency === "asap" ? t("asap") : when(next.scheduled_at)) + "</b></span>" + icon("chev") + "</button>" : "") +
        bigButton(true, w.available);
    }
    function offerSheet(offers) {
      const o = offers[0];
      const place = o.segment === "residential"
        ? t("bedrooms") + " " + (o.bedrooms || 0) + " · " + t("bathrooms") + " " + (o.bathrooms || 0)
        : (o.property_type || t("commercial")) + (o.sqft ? " · " + Number(o.sqft).toLocaleString() + " ft²" : "");
      return '<p class="eyebrow">' + icon("spark") + esc(t("new_offer")) + (o.urgency === "asap" ? ' · <span class="hot-tag">' + esc(t("asap")) + "</span>" : "") + "</p>" +
        '<div class="offer-pay">' + esc(money(o.budget)) + (o.hours_est ? "<small>" + esc(o.hours_est + " h") + "</small>" : "") + "</div>" +
        '<h2 class="dash-h">' + esc(svcName(o.service)) + (o.frequency && o.frequency !== "once" ? " · " + esc(t("freq_" + o.frequency)) : "") + "</h2>" +
        '<ul class="offer-facts"><li>' + icon("pin") + esc((o.city ? o.city + ", " : "") + o.zip) + "</li><li>" + icon("clock") + esc(o.urgency === "asap" ? t("asap") : when(o.scheduled_at)) +
        "</li><li>" + icon(o.segment === "commercial" ? "building" : "home") + esc(place) + "</li></ul>" +
        (o.notes ? '<p class="bio">' + esc(o.notes) + "</p>" : "") +
        '<div class="dash-cta"><button class="btn solid xl grow" data-act="accept" data-id="' + esc(o.offer_id) + '">' + icon("check") + esc(t("accept_job")) + "</button>" +
        '<button class="btn ghost xl" data-act="decline" data-id="' + esc(o.offer_id) + '">' + esc(t("decline")) + "</button></div>" +
        (offers.length > 1 ? '<p class="muted center">' + esc(t("more_offers", { n: offers.length - 1 })) + "</p>" : "");
    }
    function jobSheet(b, live) {
      const addr = [b.address, b.city, b.zip].filter(Boolean).join(", ");
      const dest = [b.address, b.city, b.zip, "FL"].filter(Boolean).join(", ");
      const cust = b.customer || {};
      const nav = '<a class="btn solid xl grow" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(dest) + '&travelmode=driving">' + icon("nav") + esc(t("navigate")) + "</a>";
      const contact = '<div class="row gap wrap-row"><a class="btn ghost small" href="' + esc(tel(cust.phone)) + '">' + icon("phone") + esc(t("call")) + "</a>" +
        '<a class="btn wa small" target="_blank" rel="noopener" href="' + esc(wa(cust.phone, t("wa_msg_customer", { name: S.me.profile.full_name, code: b.code }))) + '">' + icon("chat") + "WhatsApp</a></div>";
      const actions = live
        ? jobTimer(b) + '<div class="dash-cta">' + nav + "</div>" + '<div class="job-actions">' +
          (b.paused_at ? '<button class="btn ghost" data-act="resume" data-id="' + esc(b.id) + '">' + icon("clock") + esc(t("timer_resume")) + "</button>" : '<button class="btn ghost" data-act="pause" data-id="' + esc(b.id) + '">' + esc(t("timer_pause")) + "</button>") +
          '<button class="btn solid" data-act="complete" data-id="' + esc(b.id) + '">' + icon("check") + esc(t("finish_job")) + "</button></div>"
        : '<div class="dash-cta">' + (b.on_way_at ? nav : '<button class="btn solid xl grow" data-act="onway" data-id="' + esc(b.id) + '">' + icon("nav") + esc(t("on_my_way")) + "</button>") + "</div>" +
          '<button class="btn ghost block" data-act="start" data-id="' + esc(b.id) + '">' + esc(t("start_job")) + "</button>";
      return '<p class="eyebrow">' + esc(live ? t("cleaning_now") : b.on_way_at ? t("trk_onway") : t("next_job")) + " · " + esc(b.code) + "</p>" +
        '<h2 class="dash-h">' + esc(svcName(b.service)) + "</h2>" +
        '<p class="addr">' + icon("pin") + "<span>" + esc(addr) + "</span></p>" +
        '<p class="meta">' + icon("clock") + esc(b.urgency === "asap" ? t("asap") : when(b.scheduled_at)) + " · " + esc(money(b.budget)) + (b.hours_est ? " · " + esc(b.hours_est + " h") : "") + "</p>" +
        '<div class="person"><div class="avatar">' + esc((cust.name || "?")[0]) + "</div><div><small>" + esc(t("customer")) + "</small><b>" + esc(cust.name || "") + "</b></div></div>" +
        (b.notes ? '<p class="bio">' + esc(b.notes) + "</p>" : "") + actions + contact;
    }
    function vDash() {
      const w = S.me.worker || {}, d = S.data, ok = w.status === "approved";
      const jobs = d.jobs || [], offers = ok ? d.offers || [] : [];
      const live = jobs.find((b) => b.status === "in_progress");
      const next = jobs.filter((b) => b.status === "assigned").sort((a, b) => String(a.scheduled_at || a.assigned_at || "").localeCompare(String(b.scheduled_at || b.assigned_at || "")))[0];
      const soon = next && (next.on_way_at || next.urgency === "asap" || !next.scheduled_at || Date.parse(next.scheduled_at) - Date.now() < 3 * 36e5);
      const top = '<div class="dash-top">' + menuBtn() +
        '<button class="earn-pill" data-act="tab" data-tab="earnings"><b>' + esc(money2(earned(jobs, weekStart()))) + "</b><small>" + esc(t("this_week")) + "</small></button>" +
        '<span class="dash-top-r"><button class="round-btn bell" data-act="notes" aria-label="' + esc(t("notifications")) + '">' + icon("bell") + '<b class="dot" id="bell-dot" hidden></b></button>' +
        '<button class="round-btn" data-act="msgs" aria-label="' + esc(t("messages")) + '">' + icon("chat") + "</button></span></div>";
      let sheet;
      if (d.loading && !d.jobs) sheet = loading();
      else if (!ok) sheet = '<h2 class="dash-h">' + esc(w.status === "pending" ? t("dash_pending") : t(w.status + "_title")) + "</h2>" + statusBanner(w) + bigButton(false, false);
      else if (live) sheet = jobSheet(live, true);
      else if (offers.length) sheet = offerSheet(offers);
      else if (next && soon) sheet = jobSheet(next, false);
      else sheet = idleSheet(w, d.demand, next);
      return '<div class="dash' + (w.available ? " is-on" : "") + '"><div class="dash-map">' + zoneBoard(w, ok ? d.demand : null) + "</div>" + top +
        '<section class="dash-sheet"><span class="grab" aria-hidden="true"></span>' + sheet + "</section></div>";
    }

    // ───────── cleaner: Earnings ─────────
    function vEarnings() {
      const jobs = (S.data.jobs || []).filter((b) => b.status === "completed");
      const ws = weekStart(), week = earned(jobs, ws);
      const goal = Number(store.get(goalKey(), "")) || 0;
      const weeks = [];
      for (let i = 11; i >= 0; i--) { const from = ws - i * 7 * DAY; weeks.push({ from, sum: earned(jobs, from, from + 7 * DAY) }); }
      const max = Math.max(1, ...weeks.map((x) => x.sum));
      const fmtD = (ms) => new Date(ms).toLocaleDateString(loc(), { month: "short", day: "numeric" });
      const pct = goal ? Math.min(100, Math.round((week / goal) * 100)) : 0;
      const w = S.me.worker || {};
      return '<h1 class="title">' + esc(t("tab_earnings")) + "</h1>" +
        '<section class="earn-hero"><small>' + esc(t("this_week")) + "</small><b>" + esc(money2(week)) + '</b><p class="fine">' + esc(t("earn_note")) + "</p></section>" +
        (S.pay ? '<section class="card payout"><p class="label">' + icon("cash") + esc(t("payout_title")) + '</p><p>' + esc(t("payout_keep")) + '</p><div class="ag-row"><div><b>' + esc(t("payout_weekly")) + '</b><small>' + esc(t("payout_free")) + '</small></div></div><div class="ag-row"><div><b>' + esc(t("payout_instant")) + '</b><small>' + esc("$" + Number(S.pay.instant_fee || 0).toFixed(2) + " " + t("payout_per")) + "</small></div></div>" +
          (S.pay.payments_on ? "" : '<p class="fine">' + esc(t("payout_soon")) + "</p>") + "</section>" : "") +
        '<section class="card"><div class="row between"><p class="label">' + esc(t("week_goal")) + '</p><button class="round-btn sm" data-act="goal" aria-label="' + esc(t("goal_set")) + '">' + icon("pen") + "</button></div>" +
        (goal ? '<div class="goal-bar"><i style="width:' + pct + '%"></i></div><div class="row between"><b>' + esc(money(week)) + " / " + esc(money(goal)) + '</b><span class="muted">' + esc(week >= goal ? t("goal_done") : t("goal_left", { m: money(goal - week) })) + "</span></div>"
          : '<button class="btn ghost small" data-act="goal">' + esc(t("goal_set")) + "</button>") + "</section>" +
        '<section class="card"><p class="label">' + esc(t("earn_history")) + '</p><div class="wbars">' +
        weeks.map((x) => '<i class="' + (x.from === ws ? "cur" : "") + '" style="height:' + Math.max(3, Math.round((x.sum / max) * 100)) + '%" data-tip="' + esc(fmtD(x.from) + " · " + money(x.sum)) + '"></i>').join("") + "</div>" +
        weeks.slice().reverse().filter((x) => x.sum > 0).map((x) => '<div class="line"><span>' + esc(fmtD(x.from) + " – " + fmtD(x.from + 6 * DAY)) + "</span><b>" + esc(money(x.sum)) + "</b></div>").join("") + "</section>" +
        '<div class="tiles">' + tile(t("earn_total"), money(earned(jobs, 0))) + tile(t("jobs_done"), w.jobs_done || 0) + tile(t("rating"), w.rating_count ? Number(w.rating_avg).toFixed(1) + " ★" : "—") + "</div>";
    }

    // ───────── cleaner: Ratings (points and tiers) ─────────
    // Points add up to 100: acceptance 30, on time 30, customer rating 20, quality 15, jobs in 30 days 5.
    // Factors with no data yet are left out of the score instead of counting as zero.
    function scoreOf(s) {
      if (!s) return null;
      const f = [];
      const add = (key, max, have, rate, value) => f.push({ key, max, have, rate: Math.max(0, Math.min(1, rate || 0)), value, pts: have ? Math.round(max * Math.max(0, Math.min(1, rate || 0))) : 0 });
      const ans = Number(s.offers_answered) || 0, st = Number(s.started) || 0, rc = Number(s.rating_count) || 0, j = Number(s.jobs_30d) || 0;
      add("accept", 30, ans > 0, ans ? s.accepted / ans : 0, ans ? Math.round((s.accepted / ans) * 100) + "%" : "—");
      add("ontime", 30, st > 0, st ? s.on_time / st : 0, st ? Math.round((s.on_time / st) * 100) + "%" : "—");
      add("rating", 20, rc > 0, rc ? Number(s.rating_avg) - 4 : 0, rc ? Number(s.rating_avg).toFixed(1) + " ★" : "—");
      add("quality", 15, rc > 0, rc ? s.good_reviews / rc : 0, rc ? Math.round((s.good_reviews / rc) * 100) + "%" : "—");
      f.push({ key: "jobs30", max: 5, have: true, rate: Math.min(1, j / 20), value: String(j), pts: j >= 20 ? 5 : j >= 10 ? 3 : j >= 3 ? 1 : 0 });
      const have = f.filter((x) => x.have), maxHave = have.reduce((a, x) => a + x.max, 0);
      const overall = maxHave >= 30 ? Math.round((have.reduce((a, x) => a + x.pts, 0) / maxHave) * 100) : null;
      const tier = overall == null ? null : overall >= 85 ? "platinum" : overall >= 75 ? "gold" : overall >= 55 ? "silver" : "none";
      return { f, overall, tier };
    }
    const tierOf = (s) => { const x = scoreOf(s); return x && x.tier && x.tier !== "none" ? x.tier : null; };
    function vRatings() {
      if (S.data.loading && !S.data.score) return loading();
      const sc = scoreOf(S.data.score);
      if (!sc) return empty("star", t("no_data_yet"));
      const key = sc.tier || "none", pos = sc.overall == null ? 0 : sc.overall;
      const lvl = (x) => !x.have ? "none" : x.rate >= 0.9 ? "vhigh" : x.rate >= 0.75 ? "high" : x.rate >= 0.5 ? "mid" : "low";
      return '<section class="tier-hero t-' + key + '"><div class="medal">' + icon("star", "xl") + "</div><h1>" + esc(sc.overall == null ? t("score_new") : t("tier_" + key)) + "</h1>" +
        "<p>" + esc(t("overall_rating")) + " <b>" + (sc.overall == null ? "—" : sc.overall) + "</b></p>" +
        '<div class="tier-track"><i style="width:' + pos + '%"></i>' + [55, 75, 85].map((m) => '<span class="mk' + (pos >= m ? " on" : "") + '" style="left:' + m + '%"><em>' + m + "</em></span>").join("") + "</div></section>" +
        '<h2 class="sub-h">' + esc(t("rating_factors")) + '</h2><div class="factors">' +
        sc.f.map((x) => '<div class="factor"><small>' + esc(t("f_" + x.key)) + "</small><b>" + esc(x.value) + "</b><span>" + esc(t("pts", { a: x.pts, b: x.max })) + '</span><em class="lv-' + lvl(x) + '">' + esc(t("lvl_" + lvl(x))) + "</em></div>").join("") + "</div>" +
        '<p class="fine">' + esc(t("score_how")) + "</p>" +
        '<section class="card"><p class="label">' + esc(t("reviews_mine")) + "</p>" + reviewsPanel(S.data.myReviews) + "</section>";
    }

    // ───────── cleaner: Account (list, like the Dasher app) ─────────
    function vAccount() {
      const p = S.me.profile || {};
      const row = (ic, label, attrs, sub) => '<button class="arow" ' + attrs + ">" + icon(ic) + "<span>" + esc(label) + (sub ? "<small>" + esc(sub) + "</small>" : "") + "</span>" + icon("chev") + "</button>";
      return '<h1 class="title">' + esc(t("tab_account")) + '</h1><div class="alist">' +
        row("user", t("acct_profile"), 'data-act="tab" data-tab="profile"', firstName(p.full_name)) +
        row("star", t("m_ratings"), 'data-act="tab" data-tab="ratings"') +
        row("cash", t("tab_earnings"), 'data-act="tab" data-tab="earnings"') +
        row("bulb", t("m_career"), 'data-act="tab" data-tab="learn"') +
        row("globe", t("acct_lang"), 'data-act="lang"', L() ? "Español" : "English") +
        row("help", t("m_help"), 'data-act="tab" data-tab="help"') +
        row("out", t("log_out"), 'data-act="signout"') + "</div>" +
        '<p class="fine center">' + esc(t("acct_version")) + " " + esc(c.version) + "</p>";
    }

    // ───────── Help (cleaners and customers) ─────────
    function vHelp() {
      const r = role() === "worker" ? "worker" : "customer";
      return '<h1 class="title">' + esc(t("help_title")) + "</h1>" +
        '<section class="card"><p class="label">' + esc(t("help_contact")) + '</p><div class="row gap wrap-row">' +
        '<a class="btn wa" target="_blank" rel="noopener" href="' + esc(wa(CFG.BUSINESS_PHONE, "")) + '">' + icon("chat") + "WhatsApp</a>" +
        '<a class="btn ghost" href="' + esc(tel(CFG.BUSINESS_PHONE)) + '">' + icon("phone") + esc(t("call")) + "</a>" +
        '<a class="btn ghost" href="mailto:' + esc(CFG.BUSINESS_EMAIL) + '">Email</a></div></section>' +
        '<h2 class="sub-h">' + esc(t("help_faq")) + '</h2><div class="faq">' +
        FAQ[r].map((k) => "<details><summary>" + esc(t("faq_" + k + "_q")) + icon("chev") + "</summary><p>" + esc(t("faq_" + k + "_a")) + "</p></details>").join("") + "</div>" +
        (brainCard ? brainCard(r) : "");
    }

    return { MENU, menuBtn, drawer, signOutSheet, notesPage, messagesPage, tracker, stage, vDash, vEarnings, vRatings, vAccount, vHelp, scoreOf, tierOf, goalKey, firstName };
  };
})();
