'use strict';
// Read-only data tools for the agents. They run on the OWNER's session (owner JWT, 2-step),
// through the existing admin_* functions, so an agent can never see more than the owner and
// no service key is involved. They return minimal fields: no customer phone, email or address.
// `rpc(fn, args)` is injected (the app's own API caller); this module never touches the network itself.

function createTools({ rpc, now = () => Date.now() }) {
  const rows = async (fn, args) => {
    const r = await rpc(fn, args);
    return Array.isArray(r) ? r : [];
  };
  const brief = (b) => ({ id: b.id, service: b.service, zip: b.zip, status: b.status, urgency: b.urgency, scheduled_at: b.scheduled_at, created_at: b.created_at, offers: Array.isArray(b.offers) ? b.offers.length : 0 });

  return {
    // Bookings nobody has been assigned to yet.
    async list_unassigned() {
      const all = await rows('admin_bookings');
      const data = all.filter((b) => b.status === 'requested').map(brief);
      return { data, evidence: [`admin_bookings: ${all.length} rows read, ${data.length} unassigned`] };
    },

    // Overdue = still open (requested/offered) for longer than `minutes` (default 60), or an assigned
    // booking whose scheduled time passed more than `minutes` ago without being started.
    async list_overdue({ minutes = 60 } = {}) {
      const limit = minutes * 60000, t = now();
      const all = await rows('admin_bookings');
      const data = all.filter((b) => {
        if (b.status === 'requested' || b.status === 'offered') return t - Date.parse(b.created_at) > limit;
        if (b.status === 'assigned' && b.scheduled_at) return t - Date.parse(b.scheduled_at) > limit;
        return false;
      }).map(brief);
      return { data, evidence: [`admin_bookings: ${all.length} rows read, ${data.length} overdue (> ${minutes} min)`] };
    },

    // Plain counts from admin_stats. Nothing is estimated.
    async ops_report() {
      const s = await rpc('admin_stats');
      if (!s || typeof s !== 'object') return { data: null, evidence: [] };
      const keys = ['workers_pending', 'workers_approved', 'workers_online', 'bookings_open', 'bookings_unmatched', 'bookings_active', 'bookings_completed_30d', 'bookings_cancelled_30d', 'low_reviews_30d', 'whatsapp_queued'];
      const data = Object.fromEntries(keys.map((k) => [k, s[k] ?? null]));
      return { data, evidence: ['admin_stats'] };
    },

    // Revenue facts only (completed-job value). Margin is NOT computed: costs are not stored yet.
    async revenue_report() {
      const s = await rpc('admin_stats');
      if (!s || typeof s !== 'object') return { data: null, evidence: [] };
      return { data: { gmv_30d: s.gmv_30d ?? null, bookings_completed_30d: s.bookings_completed_30d ?? null, bookings_cancelled_30d: s.bookings_cancelled_30d ?? null, note: 'Completed-job budget totals only; no margin (costs not recorded).' }, evidence: ['admin_stats'] };
    },
  };
}

if (typeof module !== 'undefined' && module.exports) module.exports = { createTools };
else if (typeof window !== 'undefined') window.WCIA_TOOLS = { createTools };
