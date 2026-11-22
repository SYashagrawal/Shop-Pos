'use strict';
/* =====================================================================
   SHOP POS - core: login, layout, routing, ordering (admin + salesman), orders list
   ===================================================================== */
const CFG = window.SHOPPOS_CONFIG || {};
const S = { profile: null, outlets: [], settings: {}, cleanups: [], charts: [] };
let sb = null;

/* ---------------- tiny helpers ---------------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const inr = (n) => '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const inr0 = (n) => '₹' + Math.round(Number(n || 0)).toLocaleString('en-IN');
const fmtDT = (d) => new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const fmtD = (d) => new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
const localISO = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const isAdmin = () => S.profile && S.profile.role === 'admin';
const must = (res) => { if (res.error) throw res.error; return res.data; };
const debounce = (fn, ms = 400) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const emptyCard = (msg) => `<div class="card"><div class="empty">${esc(msg)}</div></div>`;

const STATES = ['Andaman and Nicobar Islands', 'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chandigarh', 'Chhattisgarh', 'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jammu and Kashmir', 'Jharkhand', 'Karnataka', 'Kerala', 'Ladakh', 'Lakshadweep', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Puducherry', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal'];
const PAY = { cash: 'Cash', upi: 'UPI', card: 'Card', credit: 'Credit' };

function toast(msg, type = '') {
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.textContent = msg;
  $('#toast-root').appendChild(el);
  setTimeout(() => el.remove(), type === 'err' ? 5200 : 2600);
}

function modal(title, body, opts = {}) {
  const back = document.createElement('div');
  back.className = 'modal-back';
  back.innerHTML = `<div class="modal ${opts.wide ? 'wide' : ''}" role="dialog" aria-modal="true">
    <div class="modal-head"><h3>${esc(title)}</h3><button class="icon-btn" data-close aria-label="Close">✕</button></div>
    <div class="modal-body">${body}</div></div>`;
  $('#modal-root').appendChild(back);
  const close = () => back.remove();
  back.addEventListener('mousedown', (e) => { if (e.target === back) close(); });
  back.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) close(); });
  if (opts.onMount) opts.onMount(back, close);
  return { el: back, close };
}
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { const m = $$('.modal-back'); if (m.length) m[m.length - 1].remove(); }
});

function confirmBox(title, message, okLabel = 'Confirm', danger = false, withReason = false) {
  return new Promise((resolve) => {
    let done = false;
    const m = modal(title, `<p style="margin-top:0">${esc(message)}</p>
      ${withReason ? '<label>Reason (optional)<input id="cb-reason" maxlength="200"></label>' : ''}
      <div class="row" style="justify-content:flex-end;margin-top:10px">
        <button class="btn" data-close>Cancel</button>
        <button class="btn ${danger ? 'danger' : 'primary'}" id="cb-ok">${esc(okLabel)}</button></div>`, {
      onMount: (el, close) => {
        $('#cb-ok', el).onclick = () => { done = true; resolve(withReason ? ($('#cb-reason', el).value || '') || true : true); close(); };
      },
    });
    const obs = new MutationObserver(() => { if (!document.body.contains(m.el)) { obs.disconnect(); if (!done) resolve(false); } });
    obs.observe($('#modal-root'), { childList: true });
  });
}

async function busy(btn, fn) {
  const old = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = 'Please wait…';
  try { return await fn(); } finally { btn.disabled = false; btn.innerHTML = old; }
}

function segHtml(id, options, value) {
  return `<div class="seg" id="${id}">${options.map(([v, l]) => `<button type="button" data-v="${v}" class="${v === value ? 'on' : ''}">${esc(l)}</button>`).join('')}</div>`;
}
function bindSeg(root, id, cb) {
  const seg = $('#' + id, root);
  seg.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    $$('button', seg).forEach((x) => x.classList.toggle('on', x === b));
    cb(b.dataset.v);
  });
}

function downloadCSV(filename, rows) {
  const csv = rows.map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }));
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 3000);
}

function subscribe(table, filter, cb) {
  const ch = sb.channel('rt-' + table + '-' + Math.random().toString(36).slice(2))
    .on('postgres_changes', { event: '*', schema: 'public', table, ...(filter ? { filter } : {}) }, cb)
    .subscribe();
  S.cleanups.push(() => sb.removeChannel(ch));
}
function cleanup() {
  S.cleanups.forEach((f) => { try { f(); } catch (e) { /* ignore */ } });
  S.cleanups = [];
  S.charts.forEach((c) => { try { c.destroy(); } catch (e) { /* ignore */ } });
  S.charts = [];
}
function mkChart(id, cfg) {
  const c = document.getElementById(id);
  if (!c || typeof Chart === 'undefined') return;
  S.charts.push(new Chart(c, cfg));
}

function rangeFor(preset) {
  const d = new Date(); const t = localISO(d);
  const add = (n) => { const x = new Date(); x.setDate(x.getDate() + n); return localISO(x); };
  switch (preset) {
    case 'today': return [t, t];
    case 'yesterday': return [add(-1), add(-1)];
    case '7': return [add(-6), t];
    case '30': return [add(-29), t];
    case 'month': return [localISO(new Date(d.getFullYear(), d.getMonth(), 1)), t];
    case 'lastmonth': return [localISO(new Date(d.getFullYear(), d.getMonth() - 1, 1)), localISO(new Date(d.getFullYear(), d.getMonth(), 0))];
    case 'fy': { const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1; return [`${y}-04-01`, t]; }
    case 'all': return ['2000-01-01', t];
    default: return [add(-29), t];
  }
}
const PRESETS = [['today', 'Today'], ['yesterday', 'Yesterday'], ['7', 'Last 7 days'], ['30', 'Last 30 days'], ['month', 'This month'], ['lastmonth', 'Last month'], ['fy', 'This financial year'], ['all', 'All time'], ['custom', 'Custom dates']];

/* ---------------- boot / auth ---------------- */
async function boot() {
  if (!CFG.SUPABASE_URL || CFG.SUPABASE_URL.includes('PASTE')) {
    $('#app').innerHTML = `<div class="login"><div class="login-card"><div class="logo-mark">SP</div><h2>Almost ready</h2>
      <p>Open <b>config.js</b> and paste your Supabase <b>Project URL</b>, then reload this page.</p></div></div>`;
    return;
  }
  sb = supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_KEY);
  const { data } = await sb.auth.getSession();
  if (data.session) await enterApp(); else showLogin();
  sb.auth.onAuthStateChange((ev) => { if (ev === 'SIGNED_OUT') { cleanup(); showLogin(); } });
}
window.addEventListener('DOMContentLoaded', boot);

function showLogin(msg) {
  $('#app').innerHTML = `<div class="login"><form class="login-card" id="lf" autocomplete="on">
    <div class="logo-mark">SP</div><h2>Shop Pos</h2><p>Sign in to continue</p>
    ${msg ? `<div class="badge err" style="display:block;margin-bottom:12px;padding:8px 12px;white-space:normal">${esc(msg)}</div>` : ''}
    <label>Username<input id="lu" autocomplete="username" autocapitalize="none" required></label>
    <label>Password<input id="lp" type="password" autocomplete="current-password" required></label>
    <button class="btn primary block" type="submit">Sign in</button></form></div>`;
  $('#lf').onsubmit = async (e) => {
    e.preventDefault();
    const btn = $('#lf button');
    await busy(btn, async () => {
      const username = $('#lu').value.trim().toLowerCase();
      const { error } = await sb.auth.signInWithPassword({ email: `${username}@${CFG.LOGIN_DOMAIN}`, password: $('#lp').value });
      if (error) { toast('Wrong username or password', 'err'); return; }
      await enterApp();
    });
  };
}

async function enterApp() {
  try {
    const { data: { user } } = await sb.auth.getUser();
    const { data: prof } = await sb.from('profiles').select('*').eq('id', user.id).maybeSingle();
    if (!prof || !prof.active) {
      await sb.auth.signOut();
      showLogin(prof ? 'This account is switched off. Please contact the admin.' : 'This login is not set up for Shop Pos. Please contact the admin.');
      return;
    }
    S.profile = prof;
    await loadBase();
    renderShell();
    route();
  } catch (e) {
    showLogin('Could not load your account: ' + (e.message || e));
  }
}

async function loadBase() {
  const [o, st] = await Promise.all([
    sb.from('outlets').select('*').order('created_at'),
    sb.from('settings').select('*'),
  ]);
  S.outlets = must(o);
  S.settings = Object.fromEntries(must(st).map((r) => [r.key, r.value]));
}

/* ---------------- shell + routing ---------------- */
const ICONS = {
  dashboard: '<rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/>',
  neworder: '<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>',
  orders: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h8"/>',
  products: '<path d="M21 8l-9-5-9 5v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
  stock: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
  customers: '<circle cx="9" cy="8" r="3.5"/><path d="M2 20c0-3.5 3-6 7-6s7 2.5 7 6"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14c2.5.7 4 2.7 4 6"/>',
  users: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.5-7 8-7s8 3 8 7"/>',
  outlets: '<path d="M3 9l1.5-5h15L21 9"/><path d="M4 9v11h16V9"/><path d="M9 20v-6h6v6"/>',
  settings: '<path d="M4 6h10M18 6h2M4 12h2M10 12h10M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="8" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
  account: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.5-7 8-7s8 3 8 7"/>',
};
const ROUTES = {
  dashboard: { title: 'Dashboard', admin: true, fn: () => pageDashboard },
  neworder: { title: 'New Order', fn: () => pageNewOrder },
  orders: { title: 'Orders', fn: () => pageOrders },
  products: { title: 'Products', admin: true, fn: () => pageProducts },
  stock: { title: 'Stock', admin: true, fn: () => pageStock },
  customers: { title: 'Customers', admin: true, fn: () => pageCustomers },
  users: { title: 'Salesmen', admin: true, fn: () => pageUsers },
  outlets: { title: 'Outlets', admin: true, fn: () => pageOutlets },
  settings: { title: 'Settings', admin: true, fn: () => pageSettings },
  account: { title: 'My Account', fn: () => pageAccount },
};
const navFor = () => isAdmin()
  ? ['dashboard', 'neworder', 'orders', 'products', 'stock', 'customers', 'users', 'outlets', 'settings', 'account']
  : ['neworder', 'orders', 'account'];

function renderShell() {
  const nav = navFor().map((k) => `<a href="#/${k}" data-r="${k}"><svg viewBox="0 0 24 24">${ICONS[k]}</svg>${ROUTES[k].title === 'Orders' && !isAdmin() ? 'My Orders' : ROUTES[k].title}</a>`).join('');
  $('#app').innerHTML = `<div class="shell">
    <aside class="side" id="side">
      <div class="brand"><div class="logo-mark">SP</div><span id="brand-name">${esc(S.settings.shop_name || 'Shop Pos')}</span></div>
      <nav>${nav}</nav>
      <div class="userbox"><b>${esc(S.profile.full_name)}</b>${isAdmin() ? 'Administrator' : 'Salesman'}
        <button class="btn sm" id="logout">Sign out</button></div>
    </aside>
    <div class="scrim" id="scrim"></div>
    <div class="main">
      <header class="top"><button class="icon-btn" id="menu-btn" aria-label="Menu"><svg viewBox="0 0 24 24"><path d="M3 6h18M3 12h18M3 18h18"/></svg></button>
        <h1 id="page-title"></h1><span class="who">${esc(S.profile.full_name)}</span></header>
      <main class="page" id="page"></main>
    </div></div>`;
  $('#menu-btn').onclick = () => { $('#side').classList.add('open'); $('#scrim').classList.add('show'); };
  $('#scrim').onclick = closeDrawer;
  $('#logout').onclick = () => sb.auth.signOut();
}
const closeDrawer = () => { const s = $('#side'); if (s) { s.classList.remove('open'); $('#scrim').classList.remove('show'); } };
window.addEventListener('hashchange', () => { if (S.profile) route(); });

async function route() {
  cleanup();
  let r = (location.hash || '').replace('#/', '');
  const def = isAdmin() ? 'dashboard' : 'neworder';
  if (!ROUTES[r] || (ROUTES[r].admin && !isAdmin())) r = def;
  if (!location.hash || location.hash !== '#/' + r) history.replaceState(null, '', '#/' + r);
  $$('.side a').forEach((a) => a.classList.toggle('active', a.dataset.r === r));
  $('#page-title').textContent = ROUTES[r].title === 'Orders' && !isAdmin() ? 'My Orders' : ROUTES[r].title;
  closeDrawer();
  const el = $('#page');
  el.onclick = el.oninput = el.onchange = null;
  el.innerHTML = '<div class="loading">Loading…</div>';
  window.scrollTo(0, 0);
  try { await ROUTES[r].fn()(el); }
  catch (e) { console.error(e); el.innerHTML = `<div class="card err"><b>Something went wrong</b><br>${esc(e.message || e)}</div>`; }
}

/* ---------------- customers (shared) ---------------- */
function customerModal(c, onSaved) {
  const isEdit = !!c; c = c || { type: 'URD', state: S.settings.state || 'Maharashtra' };
  let type = c.type;
  const stateOpts = STATES.map((s) => `<option ${s === c.state ? 'selected' : ''}>${esc(s)}</option>`).join('');
  modal(isEdit ? 'Edit customer' : 'New customer', `<form id="cf" class="form">
    ${segHtml('ctype', [['URD', 'URD · Unregistered'], ['RD', 'RD · Registered (GST)']], type)}
    <div class="two-col">
      <label>Name *<input name="name" required maxlength="120" value="${esc(c.name)}"></label>
      <label>Phone *<input name="phone" inputmode="tel" required maxlength="15" value="${esc(c.phone)}"></label>
    </div>
    <div id="rdbox">
      <div class="two-col">
        <label>GSTIN *<input name="gstin" maxlength="15" style="text-transform:uppercase" value="${esc(c.gstin)}"></label>
        <label>Business / legal name<input name="business_name" maxlength="150" value="${esc(c.business_name)}"></label>
      </div>
      <label>Address *<textarea name="address" maxlength="300">${esc(c.address)}</textarea></label>
      <label>State *<select name="state">${stateOpts}</select></label>
    </div>
    <div class="actions"><button class="btn" type="button" data-close>Cancel</button><button class="btn primary" type="submit">Save customer</button></div></form>`, {
    onMount: (root, close) => {
      const sync = () => { $('#rdbox', root).style.display = type === 'RD' ? '' : 'none'; };
      bindSeg(root, 'ctype', (v) => { type = v; sync(); }); sync();
      $('#cf', root).onsubmit = async (e) => {
        e.preventDefault();
        const f = new FormData(e.target);
        const row = { type, name: f.get('name').trim(), phone: f.get('phone').trim() };
        if (!/^[0-9+\-\s]{10,15}$/.test(row.phone)) return toast('Enter a valid phone number', 'err');
        if (type === 'RD') {
          row.gstin = (f.get('gstin') || '').trim().toUpperCase();
          row.business_name = (f.get('business_name') || '').trim() || null;
          row.address = (f.get('address') || '').trim();
          row.state = f.get('state');
          if (!/^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z0-9]Z[A-Z0-9]$/.test(row.gstin)) return toast('Enter a valid 15-character GSTIN', 'err');
          if (!row.address) return toast('Address is required for registered customers', 'err');
        } else {
          row.gstin = null; row.business_name = null; row.address = null; row.state = null;
        }
        await busy($('button[type=submit]', root), async () => {
          const q = isEdit ? sb.from('customers').update(row).eq('id', c.id) : sb.from('customers').insert(row);
          const { data, error } = await q.select().single();
          if (error) return toast(error.message, 'err');
          toast('Customer saved', 'ok'); close(); onSaved && onSaved(data);
        });
      };
    },
  });
}

/* ---------------- invoice helpers ---------------- */
async function fetchOrderFull(id) {
  return must(await sb.from('orders').select('*, outlets(name,address,phone), profiles(full_name), order_items(*)').eq('id', id).single());
}
async function downloadInvoice(id) {
  try {
    const o = await fetchOrderFull(id);
    makeInvoicePDF(o, S.settings).save(o.bill_no.replace(/[\/\\]/g, '-') + '.pdf');
  } catch (e) { toast('Could not create the PDF: ' + (e.message || e), 'err'); }
}

/* =====================================================================
   NEW ORDER  (admin + salesman)
   ===================================================================== */
let ORD = null;
function resetOrder() { ORD = { outlet: null, customer: null, cart: {}, pay: 'cash', days: 30, discount: '', notes: '', q: '', cat: '', products: [], pmap: {}, cats: [], stock: {}, customers: [] }; }
resetOrder();

async function pageNewOrder(el) {
  const outlets = S.outlets.filter((o) => o.active);
  if (!outlets.length) { el.innerHTML = emptyCard('No outlet is available for your account. Please ask the admin to assign one.'); return; }
  if (!ORD.outlet || !outlets.find((o) => o.id === ORD.outlet)) {
    el.innerHTML = `<div class="card"><h3>Select outlet</h3><p class="muted" style="margin-top:0">Choose the outlet you are placing this order for.</p>
      <div class="outlet-grid">${outlets.map((o) => `<button class="outlet-card" data-id="${o.id}"><b>${esc(o.name)}</b><span>${esc(o.address || '')}</span></button>`).join('')}</div></div>`;
    el.onclick = (e) => { const b = e.target.closest('.outlet-card'); if (!b) return; ORD.outlet = b.dataset.id; ORD.cart = {}; route(); };
    return;
  }
  await renderOrderScreen(el);
}

async function loadOrderData() {
  const [p, s, c, cat] = await Promise.all([
    sb.from('products').select('id,name,brand,model,sku,price,gst_rate,category_id').eq('active', true).order('name'),
    sb.from('stock').select('product_id,qty').eq('outlet_id', ORD.outlet),
    sb.from('customers').select('*').order('name').limit(3000),
    sb.from('categories').select('*').order('name'),
  ]);
  ORD.products = must(p); ORD.pmap = Object.fromEntries(ORD.products.map((x) => [x.id, x]));
  ORD.stock = Object.fromEntries(must(s).map((r) => [r.product_id, r.qty]));
  ORD.customers = must(c); ORD.cats = must(cat);
}

async function renderOrderScreen(el) {
  await loadOrderData();
  const outlet = S.outlets.find((o) => o.id === ORD.outlet);
  el.innerHTML = `
    <div class="card"><div class="row"><div class="spacer"><div class="muted small">Outlet</div><b>${esc(outlet.name)}</b></div>
      <button class="btn sm" id="chg-outlet">Change outlet</button></div></div>
    <div class="card"><h3>Customer</h3><div id="cust-box"></div></div>
    <div class="card"><h3>Products</h3>
      <input id="psearch" placeholder="Search name, brand, model or SKU" value="${esc(ORD.q)}" style="margin:0 0 8px">
      <div class="chips" id="pcats"></div><div id="plist"></div></div>
    <div class="cartbar" id="cartbar"></div>`;
  drawCustomer(); drawCats(); drawProducts(); drawCart();

  el.onclick = (e) => {
    const t = e.target;
    if (t.closest('#chg-outlet')) { ORD.outlet = null; ORD.cart = {}; route(); return; }
    const chip = t.closest('.chip'); if (chip) { ORD.cat = chip.dataset.id; drawCats(); drawProducts(); return; }
    const st = t.closest('[data-act]');
    if (st) {
      const id = st.dataset.id; const cur = ORD.cart[id] || 0; const max = ORD.stock[id] || 0;
      if (st.dataset.act === 'inc') {
        if (cur + 1 > max) return toast('Only ' + max + ' in stock', 'err');
        ORD.cart[id] = cur + 1;
      } else { if (cur <= 1) delete ORD.cart[id]; else ORD.cart[id] = cur - 1; }
      drawProducts(); drawCart(); return;
    }
    if (t.closest('#cust-change')) { ORD.customer = null; drawCustomer(); return; }
    if (t.closest('#cust-new')) { customerModal(null, (row) => { ORD.customers.unshift(row); ORD.customer = row; drawCustomer(); }); return; }
    const cr = t.closest('[data-cid]'); if (cr) { ORD.customer = ORD.customers.find((x) => x.id === cr.dataset.cid); drawCustomer(); return; }
    if (t.closest('#review')) openReview();
  };
  el.oninput = (e) => {
    if (e.target.id === 'psearch') { ORD.q = e.target.value; drawProducts(); }
    if (e.target.id === 'cq') drawCustResults(e.target.value);
  };

  const refresh = debounce(async () => {
    if (!$('#plist')) return;
    try { await loadOrderData(); } catch (e) { return; }
    let changed = false;
    Object.keys(ORD.cart).forEach((id) => {
      const max = ORD.stock[id] || 0; const p = ORD.pmap[id];
      if (!p) { delete ORD.cart[id]; changed = true; }
      else if (ORD.cart[id] > max) { if (max <= 0) delete ORD.cart[id]; else ORD.cart[id] = max; changed = true; toast('Stock changed for ' + p.name, 'err'); }
    });
    if (changed) toast('Your cart was adjusted to the latest stock', 'err');
    drawCats(); drawProducts(); drawCart();
  }, 350);
  subscribe('stock', `outlet_id=eq.${ORD.outlet}`, refresh);
  subscribe('products', null, refresh);
}

function drawCustomer() {
  const box = $('#cust-box'); if (!box) return;
  const c = ORD.customer;
  if (c) {
    box.innerHTML = `<div class="cust-sel"><div class="spacer"><b>${esc(c.name)}</b> <span class="badge ${c.type === 'RD' ? 'blue' : ''}">${c.type}</span><br>
      <span class="small muted">${esc(c.phone)}${c.gstin ? ' · GSTIN ' + esc(c.gstin) : ''}</span></div>
      <button class="btn sm" id="cust-change">Change</button></div>`;
  } else {
    box.innerHTML = `<div class="row"><input id="cq" placeholder="Search customer by name or phone" style="margin:0" autocomplete="off">
      <button class="btn primary" id="cust-new" style="flex:none">+ New</button></div><div id="cres"></div>`;
    drawCustResults('');
  }
}
function drawCustResults(q) {
  const box = $('#cres'); if (!box) return;
  q = q.trim().toLowerCase();
  const list = ORD.customers.filter((c) => !q || c.name.toLowerCase().includes(q) || (c.phone || '').includes(q)).slice(0, 8);
  box.innerHTML = list.length ? `<div class="cust-res">${list.map((c) => `<button data-cid="${c.id}"><b>${esc(c.name)}</b> <span class="badge ${c.type === 'RD' ? 'blue' : ''}">${c.type}</span><br><span class="small muted">${esc(c.phone)}</span></button>`).join('')}</div>`
    : `<p class="muted small" style="margin:8px 0 0">No customer found. Tap “+ New” to add one.</p>`;
}
function drawCats() {
  const box = $('#pcats'); if (!box) return;
  const used = new Set(ORD.products.map((p) => p.category_id));
  const cats = ORD.cats.filter((c) => used.has(c.id));
  box.innerHTML = `<button class="chip ${!ORD.cat ? 'on' : ''}" data-id="">All</button>` + cats.map((c) => `<button class="chip ${ORD.cat === c.id ? 'on' : ''}" data-id="${c.id}">${esc(c.name)}</button>`).join('');
}
function drawProducts() {
  const box = $('#plist'); if (!box) return;
  const q = ORD.q.trim().toLowerCase();
  const list = ORD.products.filter((p) => (!ORD.cat || p.category_id === ORD.cat) &&
    (!q || [p.name, p.brand, p.model, p.sku].some((v) => (v || '').toLowerCase().includes(q))));
  if (!list.length) { box.innerHTML = '<div class="empty">No products found</div>'; return; }
  box.innerHTML = list.map((p) => {
    const stock = ORD.stock[p.id] || 0; const q2 = ORD.cart[p.id] || 0;
    const cls = stock <= 0 ? 'out' : stock <= 5 ? 'low' : 'ok';
    return `<div class="prow ${stock <= 0 ? 'out' : ''}"><div class="pinfo"><div class="pname">${esc(p.name)}</div>
      <div class="pmeta">${esc([p.brand, p.model].filter(Boolean).join(' · '))}${p.brand || p.model ? ' · ' : ''}GST ${Number(p.gst_rate)}%</div></div>
      <div class="pright"><div class="pprice">${inr0(p.price)}</div><div class="stk ${cls}">${stock <= 0 ? 'Out of stock' : stock + ' in stock'}</div></div>
      <div class="stepper">${q2 ? `<button data-act="dec" data-id="${p.id}">−</button><span>${q2}</span>` : ''}
      <button class="plus" data-act="inc" data-id="${p.id}" ${stock <= 0 ? 'disabled' : ''}>+</button></div></div>`;
  }).join('');
}
const cartLines = () => Object.entries(ORD.cart).map(([id, q]) => ORD.pmap[id] ? { p: ORD.pmap[id], q } : null).filter(Boolean);
const cartTotal = () => cartLines().reduce((s, l) => s + l.p.price * l.q, 0);
function drawCart() {
  const bar = $('#cartbar'); if (!bar) return;
  const n = cartLines().reduce((s, l) => s + l.q, 0);
  bar.innerHTML = `<div class="info"><span class="muted small">${n} item${n === 1 ? '' : 's'}</span><b>${inr(cartTotal())}</b></div>
    <button class="btn primary" id="review" ${n ? '' : 'disabled'}>Review &amp; place order</button>`;
}

function openReview() {
  if (!ORD.customer) return toast('Please select a customer first', 'err');
  const lines = cartLines(); if (!lines.length) return;
  const admin = isAdmin(); const gross = cartTotal();
  modal('Review order', `
    <div class="muted small">Customer</div><div style="margin-bottom:10px"><b>${esc(ORD.customer.name)}</b> <span class="badge ${ORD.customer.type === 'RD' ? 'blue' : ''}">${ORD.customer.type}</span> · ${esc(ORD.customer.phone)}</div>
    <div class="table-wrap"><table><tbody>${lines.map((l) => `<tr><td>${esc(l.p.name)}<div class="small muted">${inr0(l.p.price)} × ${l.q}</div></td><td class="num bold">${inr(l.p.price * l.q)}</td></tr>`).join('')}</tbody></table></div>
    ${admin ? `<label style="margin-top:12px">Discount (₹) — admin only<input id="rv-disc" type="number" inputmode="decimal" min="0" step="0.01" value="${esc(ORD.discount)}" placeholder="0"></label>` : ''}
    <div class="totals"><div><span>Amount (GST included)</span><b>${inr(gross)}</b></div>${admin ? '<div><span>Discount</span><b id="rv-d">- ₹0.00</b></div>' : ''}
      <div class="grand"><span>Total payable</span><span id="rv-total">${inr(gross)}</span></div></div>
    <div style="margin-top:14px"><div class="muted small" style="margin-bottom:6px">Payment mode</div>
      ${segHtml('rv-pay', [['cash', 'Cash'], ['upi', 'UPI'], ['card', 'Card'], ['credit', 'Credit']], ORD.pay)}</div>
    <div id="rv-credit" style="display:none"><label>Credit days<input id="rv-days" type="number" min="1" max="365" value="${esc(ORD.days)}"></label>
      <div class="quick">${[7, 15, 30, 45, 60, 90].map((d) => `<button type="button" class="chip" data-d="${d}">${d} days</button>`).join('')}</div></div>
    <label style="margin-top:12px">Note (optional)<input id="rv-notes" maxlength="200" value="${esc(ORD.notes)}"></label>
    <button class="btn primary block" id="rv-place" style="margin-top:6px">Place order</button>`, {
    onMount: (root, close) => {
      const sync = () => { $('#rv-credit', root).style.display = ORD.pay === 'credit' ? '' : 'none'; };
      const upd = () => {
        if (!admin) return;
        let d = Number($('#rv-disc', root).value || 0); if (d < 0) d = 0; if (d > gross) d = gross;
        ORD.discount = $('#rv-disc', root).value;
        $('#rv-d', root).textContent = '- ' + inr(d); $('#rv-total', root).textContent = inr(gross - d);
      };
      bindSeg(root, 'rv-pay', (v) => { ORD.pay = v; sync(); }); sync();
      if (admin) { $('#rv-disc', root).oninput = upd; upd(); }
      $('#rv-days', root).oninput = (e) => { ORD.days = e.target.value; };
      $('#rv-notes', root).oninput = (e) => { ORD.notes = e.target.value; };
      root.addEventListener('click', (e) => { const c = e.target.closest('[data-d]'); if (c) { $('#rv-days', root).value = c.dataset.d; ORD.days = c.dataset.d; } });
      $('#rv-place', root).onclick = async (e) => {
        if (ORD.pay === 'credit' && !(Number(ORD.days) > 0)) return toast('Enter the credit days', 'err');
        await busy(e.currentTarget, async () => {
          const { data, error } = await sb.rpc('place_order', {
            p_outlet: ORD.outlet, p_customer: ORD.customer.id,
            p_items: lines.map((l) => ({ product_id: l.p.id, qty: l.q })),
            p_payment_mode: ORD.pay, p_credit_days: ORD.pay === 'credit' ? Number(ORD.days) : null,
            p_discount: admin ? Number(ORD.discount || 0) : 0, p_notes: (ORD.notes || '').trim() || null,
          });
          if (error) { toast(error.message, 'err'); if (/stock/i.test(error.message)) { await loadOrderData(); drawProducts(); drawCart(); } return; }
          close(); orderPlaced(data);
        });
      };
    },
  });
}

async function orderPlaced(orderId) {
  ORD.cart = {}; ORD.customer = null; ORD.discount = ''; ORD.notes = ''; ORD.pay = 'cash';
  await loadOrderData().catch(() => { });
  drawCustomer(); drawCats(); drawProducts(); drawCart();
  let o = null; try { o = await fetchOrderFull(orderId); } catch (e) { /* ignore */ }
  modal('Order placed', `<div class="success-ico">✓</div>
    <div style="text-align:center"><div class="muted small">Bill number</div><h2 style="margin:2px 0 6px">${esc(o ? o.bill_no : '')}</h2>
    <div style="font-size:22px;font-weight:800">${o ? inr(o.total) : ''}</div>
    ${o && o.payment_mode === 'credit' ? `<div class="muted" style="margin-top:4px">Credit — due ${fmtD(o.due_date)}</div>` : ''}</div>
    <div class="row" style="margin-top:18px"><button class="btn primary spacer" id="pd-pdf">Download PDF bill</button><button class="btn spacer" data-close>New order</button></div>`, {
    onMount: (root) => { $('#pd-pdf', root).onclick = (e) => busy(e.currentTarget, () => downloadInvoice(orderId)); },
  });
}

/* =====================================================================
   ORDERS LIST + DETAIL
   ===================================================================== */
async function pageOrders(el) {
  const admin = isAdmin();
  const F = { preset: '30', from: '', to: '', status: '', outlet: '', pay: '', q: '' };
  let rows = [];
  el.innerHTML = `<div class="card"><div class="filters">
      <label>Period<select id="f-preset">${PRESETS.map(([v, l]) => `<option value="${v}" ${v === F.preset ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label class="f-custom" style="display:none">From<input type="date" id="f-from"></label>
      <label class="f-custom" style="display:none">To<input type="date" id="f-to"></label>
      <label>Status<select id="f-status"><option value="">All</option><option value="placed">Placed</option><option value="cancelled">Cancelled</option></select></label>
      ${admin ? `<label>Outlet<select id="f-outlet"><option value="">All outlets</option>${S.outlets.map((o) => `<option value="${o.id}">${esc(o.name)}</option>`).join('')}</select></label>` : ''}
      <label>Payment<select id="f-pay"><option value="">All</option>${Object.entries(PAY).map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></label>
      <label>Search<input id="f-q" placeholder="Bill no / customer / phone"></label></div>
      <div class="row" style="margin-top:10px"><span class="muted small spacer" id="o-count"></span>${admin ? '<button class="btn sm" id="o-csv">Export CSV</button>' : ''}</div></div>
    <div class="card" id="olist"><div class="loading">Loading…</div></div>`;

  async function load() {
    let [from, to] = F.preset === 'custom' ? [F.from || rangeFor('30')[0], F.to || rangeFor('30')[1]] : rangeFor(F.preset);
    let q = sb.from('orders').select('*, outlets(name), profiles(full_name)')
      .gte('created_at', `${from}T00:00:00+05:30`).lte('created_at', `${to}T23:59:59.999+05:30`)
      .order('created_at', { ascending: false }).limit(2000);
    if (F.status) q = q.eq('status', F.status);
    if (F.outlet) q = q.eq('outlet_id', F.outlet);
    if (F.pay) q = q.eq('payment_mode', F.pay);
    rows = must(await q);
    draw();
  }
  function filtered() {
    const s = F.q.trim().toLowerCase();
    return rows.filter((o) => !s || o.bill_no.toLowerCase().includes(s) || (o.customer_snapshot.name || '').toLowerCase().includes(s) || (o.customer_snapshot.phone || '').includes(s));
  }
  function draw() {
    const list = filtered(); const today = localISO(new Date());
    const total = list.filter((o) => o.status === 'placed').reduce((s, o) => s + Number(o.total), 0);
    $('#o-count').textContent = `${list.length} order${list.length === 1 ? '' : 's'} · ${inr(total)} (excluding cancelled)`;
    $('#olist').innerHTML = list.length ? `<div class="list">${list.map((o) => {
      const overdue = o.status === 'placed' && o.payment_status === 'pending' && o.due_date < today;
      return `<button class="li" data-id="${o.id}"><div class="main-col"><div class="t">${esc(o.bill_no)} · ${esc(o.customer_snapshot.name)}</div>
        <div class="s">${fmtDT(o.created_at)}${admin ? ' · ' + esc(o.outlets?.name || '') + ' · ' + esc(o.profiles?.full_name || '') : ''}</div></div>
        <div style="text-align:right"><div class="amt" style="${o.status === 'cancelled' ? 'text-decoration:line-through;color:#98a2b3' : ''}">${inr(o.total)}</div>
        <div>${o.status === 'cancelled' ? '<span class="badge err">Cancelled</span>' : o.payment_status === 'pending' ? `<span class="badge ${overdue ? 'err' : 'warn'}">${overdue ? 'Overdue' : 'Credit due'} ${fmtD(o.due_date)}</span>` : `<span class="badge ok">${PAY[o.payment_mode]}</span>`}</div></div></button>`;
    }).join('')}</div>` : '<div class="empty">No orders found for these filters</div>';
  }
  el.onchange = (e) => {
    const id = e.target.id;
    if (id === 'f-preset') { F.preset = e.target.value; $$('.f-custom', el).forEach((x) => x.style.display = F.preset === 'custom' ? '' : 'none'); if (F.preset !== 'custom') load(); }
    else if (id === 'f-from') { F.from = e.target.value; load(); }
    else if (id === 'f-to') { F.to = e.target.value; load(); }
    else if (id === 'f-status') { F.status = e.target.value; load(); }
    else if (id === 'f-outlet') { F.outlet = e.target.value; load(); }
    else if (id === 'f-pay') { F.pay = e.target.value; load(); }
  };
  el.oninput = (e) => { if (e.target.id === 'f-q') { F.q = e.target.value; draw(); } };
  el.onclick = (e) => {
    const b = e.target.closest('.li'); if (b) { openOrderDetail(b.dataset.id, load); return; }
    if (e.target.closest('#o-csv')) {
      const list = filtered();
      downloadCSV(`orders-${localISO(new Date())}.csv`, [['Bill no', 'Date', 'Outlet', 'Salesman', 'Customer', 'Phone', 'Type', 'GSTIN', 'Payment', 'Payment status', 'Due date', 'Status', 'Gross', 'Discount', 'Taxable', 'CGST', 'SGST', 'IGST', 'Total']]
        .concat(list.map((o) => [o.bill_no, fmtDT(o.created_at), o.outlets?.name, o.profiles?.full_name, o.customer_snapshot.name, o.customer_snapshot.phone, o.customer_snapshot.type, o.customer_snapshot.gstin, PAY[o.payment_mode], o.payment_status, o.due_date, o.status, o.gross_total, o.discount, o.taxable_value, o.cgst, o.sgst, o.igst, o.total])));
    }
  };
  subscribe('orders', null, debounce(() => load().catch(() => { }), 500));
  await load();
}

async function openOrderDetail(id, onChange) {
  let o;
  try { o = await fetchOrderFull(id); } catch (e) { return toast(e.message, 'err'); }
  const c = o.customer_snapshot; const admin = isAdmin();
  const today = localISO(new Date());
  const m = modal(o.bill_no, `
    <div class="row wrap" style="margin-bottom:10px">${o.status === 'cancelled' ? '<span class="badge err">Cancelled</span>' : '<span class="badge ok">Placed</span>'}
      ${o.payment_status === 'pending' && o.status === 'placed' ? `<span class="badge ${o.due_date < today ? 'err' : 'warn'}">Credit — due ${fmtD(o.due_date)}</span>` : `<span class="badge">${PAY[o.payment_mode]}</span>`}</div>
    <div class="info-grid"><div><div class="l">Date</div>${fmtDT(o.created_at)}</div><div><div class="l">Outlet</div>${esc(o.outlets?.name)}</div>
      <div><div class="l">Placed by</div>${esc(o.profiles?.full_name || '-')}</div><div><div class="l">Payment</div>${PAY[o.payment_mode]}${o.credit_days ? ' · ' + o.credit_days + ' days' : ''}</div></div>
    <div class="card" style="box-shadow:none;background:#f8fafd"><b>${esc(c.name)}</b> <span class="badge ${c.type === 'RD' ? 'blue' : ''}">${c.type}</span><br>
      <span class="small muted">${esc(c.phone)}${c.gstin ? ' · GSTIN ' + esc(c.gstin) : ''}${c.address ? '<br>' + esc(c.address) : ''}${c.state ? ' · ' + esc(c.state) : ''}</span></div>
    <div class="table-wrap"><table><thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Amount</th></tr></thead><tbody>
      ${o.order_items.map((i) => `<tr><td>${esc(i.name)}<div class="small muted">${inr(i.unit_price)} · GST ${Number(i.gst_rate)}%</div></td><td class="num">${i.qty}</td><td class="num">${inr(i.line_total)}</td></tr>`).join('')}</tbody></table></div>
    <div class="totals"><div><span>Amount (GST incl.)</span><span>${inr(o.gross_total)}</span></div>
      ${Number(o.discount) ? `<div><span>Discount</span><span>- ${inr(o.discount)}</span></div>` : ''}
      <div class="muted small"><span>Taxable value</span><span>${inr(o.taxable_value)}</span></div>
      ${Number(o.cgst) ? `<div class="muted small"><span>CGST</span><span>${inr(o.cgst)}</span></div><div class="muted small"><span>SGST</span><span>${inr(o.sgst)}</span></div>` : ''}
      ${Number(o.igst) ? `<div class="muted small"><span>IGST</span><span>${inr(o.igst)}</span></div>` : ''}
      <div class="grand"><span>Total</span><span>${inr(o.total)}</span></div></div>
    ${o.notes ? `<p class="small"><b>Note:</b> ${esc(o.notes)}</p>` : ''}
    ${o.status === 'cancelled' ? `<p class="small" style="color:var(--err)">Cancelled on ${fmtDT(o.cancelled_at)}${o.cancel_reason ? ' — ' + esc(o.cancel_reason) : ''}</p>` : ''}
    <div class="row wrap" style="margin-top:14px"><button class="btn primary spacer" id="od-pdf">PDF bill</button>
      ${admin && o.status === 'placed' && o.payment_status === 'pending' ? '<button class="btn ok spacer" id="od-paid">Mark as paid</button>' : ''}
      ${admin && o.status === 'placed' ? '<button class="btn danger spacer" id="od-cancel">Cancel order</button>' : ''}</div>`, {
    wide: true,
    onMount: (root, close) => {
      $('#od-pdf', root).onclick = (e) => busy(e.currentTarget, () => downloadInvoice(id));
      const paid = $('#od-paid', root);
      if (paid) paid.onclick = async (e) => {
        if (!(await confirmBox('Mark as paid', 'Confirm that the customer has paid this credit bill?', 'Yes, paid'))) return;
        await busy(e.currentTarget, async () => {
          const { error } = await sb.rpc('mark_paid', { p_order: id });
          if (error) return toast(error.message, 'err');
          toast('Marked as paid', 'ok'); close(); onChange && onChange();
        });
      };
      const cancel = $('#od-cancel', root);
      if (cancel) cancel.onclick = async (e) => {
        const reason = await confirmBox('Cancel this order?', 'The stock of all items will be added back to the outlet. This cannot be undone.', 'Cancel order', true, true);
        if (!reason) return;
        await busy(e.currentTarget, async () => {
          const { error } = await sb.rpc('cancel_order', { p_order: id, p_reason: reason === true ? null : reason });
          if (error) return toast(error.message, 'err');
          toast('Order cancelled and stock restored', 'ok'); close(); onChange && onChange();
        });
      };
    },
  });
}

/* =====================================================================
   ACCOUNT (everyone)
   ===================================================================== */
async function pageAccount(el) {
  el.innerHTML = `<div class="card"><h3>${esc(S.profile.full_name)}</h3>
    <p class="muted" style="margin-top:0">Username: <b>${esc(S.profile.username)}</b> · ${isAdmin() ? 'Administrator' : 'Salesman'}</p></div>
    <div class="card"><h3>Change password</h3><form id="pf" class="form">
      <label>New password<input type="password" id="np" minlength="6" autocomplete="new-password" required></label>
      <label>Repeat new password<input type="password" id="np2" minlength="6" autocomplete="new-password" required></label>
      <div class="actions"><button class="btn primary" type="submit">Update password</button></div></form></div>
    <button class="btn block" id="lo">Sign out</button>`;
  $('#lo').onclick = () => sb.auth.signOut();
  $('#pf').onsubmit = async (e) => {
    e.preventDefault();
    if ($('#np').value !== $('#np2').value) return toast('Passwords do not match', 'err');
    await busy($('#pf button'), async () => {
      const { error } = await sb.auth.updateUser({ password: $('#np').value });
      if (error) return toast(error.message, 'err');
      toast('Password updated', 'ok'); e.target.reset();
    });
  };
}
