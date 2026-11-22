'use strict';
/* =====================================================================
   SHOP POS - admin pages: dashboard, products, stock, customers, salesmen, outlets, settings
   ===================================================================== */

/* =====================================================================
   DASHBOARD
   ===================================================================== */
async function pageDashboard(el) {
  const F = { preset: '30', from: '', to: '', outlet: '', salesman: '', pay: '' };
  const people = must(await sb.from('profiles').select('id,full_name,role').order('full_name'));
  el.innerHTML = `<div class="card"><div class="filters">
      <label>Period<select id="d-preset">${PRESETS.map(([v, l]) => `<option value="${v}" ${v === F.preset ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label class="d-custom" style="display:none">From<input type="date" id="d-from"></label>
      <label class="d-custom" style="display:none">To<input type="date" id="d-to"></label>
      <label>Outlet<select id="d-outlet"><option value="">All outlets</option>${S.outlets.map((o) => `<option value="${o.id}">${esc(o.name)}</option>`).join('')}</select></label>
      <label>Salesman<select id="d-sm"><option value="">Everyone</option>${people.map((p) => `<option value="${p.id}">${esc(p.full_name)}</option>`).join('')}</select></label>
      <label>Payment<select id="d-pay"><option value="">All modes</option>${Object.entries(PAY).map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></label>
    </div></div><div id="dash"><div class="loading">Loading…</div></div>`;

  async function load() {
    const [from, to] = F.preset === 'custom' ? [F.from || rangeFor('30')[0], F.to || rangeFor('30')[1]] : rangeFor(F.preset);
    const { data, error } = await sb.rpc('dashboard', { p_from: from, p_to: to, p_outlet: F.outlet || null, p_salesman: F.salesman || null, p_payment: F.pay || null });
    if (error) { $('#dash').innerHTML = `<div class="card err">${esc(error.message)}</div>`; return; }
    draw(data, from, to);
  }

  function draw(d, from, to) {
    S.charts.forEach((c) => c.destroy()); S.charts = [];
    const s = d.summary;
    const maxSm = Math.max(1, ...d.by_salesman.map((x) => Number(x.sales)));
    $('#dash').innerHTML = `
      <p class="muted small" style="margin:0 2px 10px">Showing ${fmtD(from)} – ${fmtD(to)}. Cancelled orders are not counted in sales.</p>
      <div class="grid kpis" style="margin-bottom:14px">
        <div class="kpi accent"><div class="l">Total sales</div><div class="v">${inr0(s.sales)}</div><div class="s">${s.orders} orders</div></div>
        <div class="kpi"><div class="l">Orders</div><div class="v">${s.orders}</div><div class="s">Avg ${inr0(s.avg)} / order</div></div>
        <div class="kpi"><div class="l">Taxable value</div><div class="v">${inr0(s.taxable)}</div><div class="s">Before GST</div></div>
        <div class="kpi"><div class="l">GST collected</div><div class="v">${inr0(s.tax)}</div><div class="s">CGST + SGST + IGST</div></div>
        <div class="kpi"><div class="l">Discount given</div><div class="v">${inr0(s.discount)}</div><div class="s">&nbsp;</div></div>
        <div class="kpi"><div class="l">Credit outstanding</div><div class="v" style="color:${Number(d.credit_outstanding.amount) ? 'var(--warn)' : 'inherit'}">${inr0(d.credit_outstanding.amount)}</div><div class="s">${d.credit_outstanding.count} unpaid bills</div></div>
        <div class="kpi"><div class="l">Cancelled</div><div class="v">${d.cancelled.count}</div><div class="s">${inr0(d.cancelled.amount)}</div></div>
        <div class="kpi"><div class="l">Low-stock items</div><div class="v" style="color:${d.low_stock.length ? 'var(--err)' : 'inherit'}">${d.low_stock.length}</div><div class="s">At or below alert level</div></div>
      </div>
      <div class="card"><h3>Sales by day</h3><div class="chartbox"><canvas id="ch-day"></canvas></div></div>
      <div class="grid two">
        <div class="card"><h3>Outlet-wise sales</h3><div class="chartbox"><canvas id="ch-outlet"></canvas></div></div>
        <div class="card"><h3>Payment modes</h3><div class="chartbox"><canvas id="ch-pay"></canvas></div></div>
      </div>
      <div class="grid two">
        <div class="card"><h3>Top products</h3>${d.top_products.length ? `<div class="table-wrap"><table><thead><tr><th>Product</th><th class="num">Qty</th><th class="num">Sales</th></tr></thead><tbody>
          ${d.top_products.map((p) => `<tr><td>${esc(p.name)}</td><td class="num">${p.qty}</td><td class="num">${inr0(p.sales)}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">No sales in this period</div>'}</div>
        <div class="card"><h3>Salesman performance</h3>${d.by_salesman.length ? d.by_salesman.map((x) => `<div style="margin-bottom:12px"><div class="row"><b class="spacer">${esc(x.name)}</b><span>${inr0(x.sales)}</span></div>
          <div class="bar"><i style="width:${Math.round(Number(x.sales) / maxSm * 100)}%"></i></div><div class="small muted">${x.orders} orders</div></div>`).join('') : '<div class="empty">No sales in this period</div>'}</div>
      </div>
      <div class="card"><h3>Low stock</h3>${d.low_stock.length ? `<div class="table-wrap"><table><thead><tr><th>Product</th><th>Outlet</th><th class="num">In stock</th><th class="num">Alert at</th></tr></thead><tbody>
        ${d.low_stock.map((x) => `<tr class="${x.qty <= 0 ? 'low' : ''}"><td>${esc(x.product)}</td><td>${esc(x.outlet)}</td><td class="num bold">${x.qty}</td><td class="num">${x.low_level}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">All products are above their alert level 👍</div>'}</div>`;

    const accent = '#2563eb';
    const palette = ['#2563eb', '#0f9d58', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4'];
    const money = { ticks: { callback: (v) => inr0(v) }, beginAtZero: true };
    mkChart('ch-day', { type: 'bar', data: { labels: d.by_day.map((x) => fmtD(x.day)), datasets: [{ label: 'Sales', data: d.by_day.map((x) => Number(x.sales)), backgroundColor: accent, borderRadius: 6 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => inr(c.parsed.y) + ' · ' + d.by_day[c.dataIndex].orders + ' orders' } } }, scales: { y: money } } });
    mkChart('ch-outlet', { type: 'bar', data: { labels: d.by_outlet.map((x) => x.name), datasets: [{ data: d.by_outlet.map((x) => Number(x.sales)), backgroundColor: palette, borderRadius: 6 }] },
      options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => inr(c.parsed.x) + ' · ' + d.by_outlet[c.dataIndex].orders + ' orders' } } }, scales: { x: money } } });
    mkChart('ch-pay', { type: 'doughnut', data: { labels: d.by_payment.map((x) => PAY[x.mode]), datasets: [{ data: d.by_payment.map((x) => Number(x.sales)), backgroundColor: palette }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: (c) => ' ' + inr(c.parsed) } } } } });
  }

  el.onchange = (e) => {
    const id = e.target.id;
    if (id === 'd-preset') { F.preset = e.target.value; $$('.d-custom', el).forEach((x) => x.style.display = F.preset === 'custom' ? '' : 'none'); if (F.preset !== 'custom') load(); }
    else if (id === 'd-from') { F.from = e.target.value; load(); }
    else if (id === 'd-to') { F.to = e.target.value; load(); }
    else if (id === 'd-outlet') { F.outlet = e.target.value; load(); }
    else if (id === 'd-sm') { F.salesman = e.target.value; load(); }
    else if (id === 'd-pay') { F.pay = e.target.value; load(); }
  };
  subscribe('orders', null, debounce(() => load().catch(() => { }), 800));
  subscribe('stock', null, debounce(() => load().catch(() => { }), 1200));
  await load();
}

/* =====================================================================
   PRODUCTS + CATEGORIES
   ===================================================================== */
async function pageProducts(el) {
  let tab = 'products'; let showInactive = false; let q = ''; let cat = '';
  let products = [], cats = [], stockSum = {};

  async function load() {
    const [p, c, st] = await Promise.all([
      sb.from('products').select('*, categories(name)').order('name'),
      sb.from('categories').select('*').order('name'),
      sb.from('stock').select('product_id,qty'),
    ]);
    products = must(p); cats = must(c); stockSum = {};
    must(st).forEach((r) => { stockSum[r.product_id] = (stockSum[r.product_id] || 0) + r.qty; });
    draw();
  }

  function draw() {
    el.innerHTML = `${segHtml('ptab', [['products', 'Products'], ['categories', 'Categories']], tab)}<div id="pbody"></div>`;
    bindSeg(el, 'ptab', (v) => { tab = v; draw(); });
    tab === 'products' ? drawProducts() : drawCats();
  }

  function drawProducts() {
    const s = q.trim().toLowerCase();
    const list = products.filter((p) => (showInactive || p.active) && (!cat || p.category_id === cat) &&
      (!s || [p.name, p.brand, p.model, p.sku].some((v) => (v || '').toLowerCase().includes(s))));
    $('#pbody').innerHTML = `<div class="card"><div class="row wrap">
        <input id="p-q" placeholder="Search products" style="flex:1;min-width:150px;margin:0" value="${esc(q)}">
        <select id="p-cat" style="width:auto;margin:0"><option value="">All categories</option>${cats.map((c) => `<option value="${c.id}" ${c.id === cat ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>
        <button class="btn primary" id="p-add">+ Add product</button></div>
      <label class="inline" style="margin-top:10px"><input type="checkbox" id="p-inactive" ${showInactive ? 'checked' : ''}> Show removed products</label></div>
      <div class="card">${list.length ? `<div class="list">${list.map((p) => `<div class="li"><div class="main-col"><div class="t">${esc(p.name)} ${p.active ? '' : '<span class="badge err">Removed</span>'}</div>
        <div class="s">${esc(p.categories?.name || 'No category')}${p.brand || p.model ? ' · ' + esc([p.brand, p.model].filter(Boolean).join(' ')) : ''} · GST ${Number(p.gst_rate)}% · Stock ${stockSum[p.id] || 0}</div></div>
        <div class="amt">${inr(p.price)}</div>
        <div class="li-actions"><button class="btn sm" data-edit="${p.id}">Edit</button>
        <button class="btn sm ${p.active ? 'danger' : ''}" data-toggle="${p.id}">${p.active ? 'Remove' : 'Restore'}</button></div></div>`).join('')}</div>`
      : '<div class="empty">No products yet. Tap “+ Add product”.</div>'}</div>`;
    const qi = $('#p-q'); qi.oninput = (e) => { q = e.target.value; const pos = e.target.selectionStart; drawProducts(); const n = $('#p-q'); n.focus(); n.setSelectionRange(pos, pos); };
    $('#p-cat').onchange = (e) => { cat = e.target.value; drawProducts(); };
    $('#p-inactive').onchange = (e) => { showInactive = e.target.checked; drawProducts(); };
    $('#p-add').onclick = () => {
      if (!cats.length) return toast('Create a category first (Categories tab)', 'err');
      productModal(null, cats, load);
    };
    $('#pbody').onclick = async (e) => {
      const ed = e.target.closest('[data-edit]');
      if (ed) return productModal(products.find((p) => p.id === ed.dataset.edit), cats, load);
      const tg = e.target.closest('[data-toggle]');
      if (tg) {
        const p = products.find((x) => x.id === tg.dataset.toggle);
        const ok = await confirmBox(p.active ? 'Remove product?' : 'Restore product?',
          p.active ? `“${p.name}” will be hidden from ordering. Old bills stay correct and you can restore it any time.` : `“${p.name}” will be available for ordering again.`,
          p.active ? 'Remove' : 'Restore', p.active);
        if (!ok) return;
        const { error } = await sb.from('products').update({ active: !p.active }).eq('id', p.id);
        if (error) return toast(error.message, 'err');
        toast(p.active ? 'Product removed' : 'Product restored', 'ok'); load();
      }
    };
  }

  function drawCats() {
    $('#pbody').innerHTML = `<div class="card"><form id="cat-f" class="row"><input id="cat-n" placeholder="New category name (e.g. Mobiles)" maxlength="60" required style="margin:0">
      <button class="btn primary" type="submit" style="flex:none">Add</button></form></div>
      <div class="card">${cats.length ? `<div class="list">${cats.map((c) => `<div class="li"><div class="main-col"><div class="t">${esc(c.name)}</div>
        <div class="s">${products.filter((p) => p.category_id === c.id).length} products</div></div>
        <div class="li-actions"><button class="btn sm" data-ren="${c.id}">Rename</button><button class="btn sm danger" data-del="${c.id}">Delete</button></div></div>`).join('')}</div>` : '<div class="empty">No categories yet</div>'}</div>`;
    $('#cat-f').onsubmit = async (e) => {
      e.preventDefault();
      const { error } = await sb.from('categories').insert({ name: $('#cat-n').value.trim() });
      if (error) return toast(/duplicate/i.test(error.message) ? 'This category already exists' : error.message, 'err');
      toast('Category added', 'ok'); load();
    };
    $('#pbody').onclick = async (e) => {
      const r = e.target.closest('[data-ren]'); const d = e.target.closest('[data-del]');
      if (r) {
        const c = cats.find((x) => x.id === r.dataset.ren);
        modal('Rename category', `<form id="rn" class="form"><label>Name<input id="rn-n" value="${esc(c.name)}" maxlength="60" required></label>
          <div class="actions"><button class="btn primary" type="submit">Save</button></div></form>`, {
          onMount: (root, close) => {
            $('#rn', root).onsubmit = async (ev) => {
              ev.preventDefault();
              const { error } = await sb.from('categories').update({ name: $('#rn-n', root).value.trim() }).eq('id', c.id);
              if (error) return toast(error.message, 'err');
              close(); toast('Renamed', 'ok'); load();
            };
          },
        });
      }
      if (d) {
        const c = cats.find((x) => x.id === d.dataset.del);
        if (!(await confirmBox('Delete category?', `Delete “${c.name}”? It must have no products.`, 'Delete', true))) return;
        const { error } = await sb.from('categories').delete().eq('id', c.id);
        if (error) return toast(/foreign|violates/i.test(error.message) ? 'This category still has products. Move or remove them first.' : error.message, 'err');
        toast('Category deleted', 'ok'); load();
      }
    };
  }
  await load();
}

function productModal(p, cats, onSaved) {
  const isEdit = !!p; p = p || { gst_rate: 18 };
  const outlets = S.outlets.filter((o) => o.active);
  modal(isEdit ? 'Edit product' : 'Add product', `<form id="pf" class="form">
    <label>Product name *<input name="name" required maxlength="150" value="${esc(p.name)}"></label>
    <div class="two-col">
      <label>Category *<select name="category_id" required><option value="">Select…</option>${cats.map((c) => `<option value="${c.id}" ${c.id === p.category_id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
      <label>Brand<input name="brand" maxlength="60" value="${esc(p.brand)}"></label>
      <label>Model<input name="model" maxlength="60" value="${esc(p.model)}"></label>
      <label>SKU / barcode<input name="sku" maxlength="60" value="${esc(p.sku)}"></label>
      <label>Selling price incl. GST (₹) *<input name="price" type="number" inputmode="decimal" min="0" step="0.01" required value="${p.price ?? ''}"></label>
      <label>GST rate (%) *<input name="gst_rate" type="number" inputmode="decimal" min="0" max="100" step="0.01" list="gstl" required value="${p.gst_rate}"></label>
      <label>HSN code<input name="hsn" maxlength="12" value="${esc(p.hsn)}"></label>
      <label>Warranty<input name="warranty" maxlength="60" placeholder="e.g. 1 year" value="${esc(p.warranty)}"></label>
    </div>
    <datalist id="gstl"><option value="0"><option value="5"><option value="12"><option value="18"><option value="28"></datalist>
    ${isEdit ? '<p class="muted small">To change stock, use the Stock page.</p>' : `<h3 style="margin:6px 0 8px">Opening stock</h3>${outlets.map((o) => `<label>${esc(o.name)}<input type="number" min="0" step="1" data-open="${o.id}" placeholder="0"></label>`).join('')}`}
    <div class="actions"><button class="btn" type="button" data-close>Cancel</button><button class="btn primary" type="submit">Save product</button></div></form>`, {
    wide: true,
    onMount: (root, close) => {
      $('#pf', root).onsubmit = async (e) => {
        e.preventDefault();
        const f = new FormData(e.target);
        const row = {
          name: f.get('name').trim(), category_id: f.get('category_id'), brand: f.get('brand').trim() || null, model: f.get('model').trim() || null,
          sku: f.get('sku').trim() || null, hsn: f.get('hsn').trim() || null, warranty: f.get('warranty').trim() || null,
          price: Number(f.get('price')), gst_rate: Number(f.get('gst_rate')),
        };
        await busy($('button[type=submit]', root), async () => {
          const q = isEdit ? sb.from('products').update(row).eq('id', p.id) : sb.from('products').insert(row);
          const { data, error } = await q.select().single();
          if (error) return toast(/duplicate/i.test(error.message) ? 'This SKU is already used by another product' : error.message, 'err');
          if (!isEdit) {
            for (const inp of $$('[data-open]', root)) {
              const n = parseInt(inp.value, 10);
              if (n > 0) await sb.rpc('adjust_stock', { p_outlet: inp.dataset.open, p_product: data.id, p_change: n, p_reason: 'Opening stock' });
            }
          }
          toast('Product saved', 'ok'); close(); onSaved && onSaved();
        });
      };
    },
  });
}

/* =====================================================================
   STOCK
   ===================================================================== */
async function pageStock(el) {
  let outletId = (S.outlets.find((o) => o.active) || {}).id; let q = ''; let rows = [];
  if (!outletId) { el.innerHTML = emptyCard('Create an outlet first.'); return; }

  async function load() {
    const [p, s] = await Promise.all([
      sb.from('products').select('id,name,brand,model,categories(name)').eq('active', true).order('name'),
      sb.from('stock').select('*').eq('outlet_id', outletId),
    ]);
    const sm = Object.fromEntries(must(s).map((r) => [r.product_id, r]));
    rows = must(p).map((x) => ({ ...x, qty: sm[x.id]?.qty ?? 0, low: sm[x.id]?.low_level ?? 5 }));
    drawList();
  }
  el.innerHTML = `<div class="card"><div class="row wrap">
      <select id="s-out" style="flex:1;min-width:140px;margin:0">${S.outlets.map((o) => `<option value="${o.id}" ${o.id === outletId ? 'selected' : ''}>${esc(o.name)}${o.active ? '' : ' (inactive)'}</option>`).join('')}</select>
      <input id="s-q" placeholder="Search products" style="flex:1;min-width:140px;margin:0"></div>
      <p class="muted small" style="margin:8px 0 0">Stock updates live when orders are placed or cancelled.</p></div><div class="card" id="s-list"></div>`;

  function drawList() {
    const s = q.trim().toLowerCase();
    const list = rows.filter((r) => !s || [r.name, r.brand, r.model].some((v) => (v || '').toLowerCase().includes(s)));
    $('#s-list').innerHTML = list.length ? `<div class="table-wrap"><table><thead><tr><th>Product</th><th class="num">In stock</th><th class="num">Alert at</th><th></th></tr></thead><tbody>
      ${list.map((r) => `<tr class="${r.qty <= r.low ? 'low' : ''}"><td><b>${esc(r.name)}</b><div class="small muted">${esc(r.categories?.name || '')}${r.brand ? ' · ' + esc(r.brand) : ''}</div></td>
        <td class="num bold">${r.qty}</td><td class="num">${r.low}</td>
        <td class="num"><button class="btn sm primary" data-adj="${r.id}">Adjust</button> <button class="btn sm" data-his="${r.id}">History</button></td></tr>`).join('')}</tbody></table></div>`
      : '<div class="empty">No products</div>';
  }

  el.onchange = (e) => { if (e.target.id === 's-out') { outletId = e.target.value; load(); } };
  el.oninput = (e) => { if (e.target.id === 's-q') { q = e.target.value; drawList(); } };
  el.onclick = (e) => {
    const a = e.target.closest('[data-adj]'); const h = e.target.closest('[data-his]');
    if (a) adjustModal(rows.find((r) => r.id === a.dataset.adj), outletId, load);
    if (h) historyModal(rows.find((r) => r.id === h.dataset.his), outletId);
  };
  subscribe('stock', `outlet_id=eq.${outletId}`, debounce(load, 300));
  await load();
}

function adjustModal(r, outletId, onSaved) {
  let mode = 'add';
  modal('Adjust stock', `<p style="margin-top:0"><b>${esc(r.name)}</b><br><span class="muted">Currently in stock: <b id="cur">${r.qty}</b></span></p>
    <form id="af" class="form">${segHtml('amode', [['add', 'Add stock'], ['remove', 'Remove'], ['set', 'Set exact count']], mode)}
      <label id="qlabel">Quantity to add<input name="qty" type="number" min="0" step="1" required inputmode="numeric"></label>
      <label>Reason<input name="reason" maxlength="120" placeholder="e.g. New purchase, damaged, stock count"></label>
      <label>Low-stock alert level<input name="low" type="number" min="0" step="1" value="${r.low}"></label>
      <div class="actions"><button class="btn primary" type="submit">Save</button></div></form>`, {
    onMount: (root, close) => {
      const labels = { add: 'Quantity to add', remove: 'Quantity to remove', set: 'New total count' };
      bindSeg(root, 'amode', (v) => { mode = v; $('#qlabel', root).firstChild.textContent = labels[v]; });
      $('#af', root).onsubmit = async (e) => {
        e.preventDefault();
        const f = new FormData(e.target); const n = parseInt(f.get('qty'), 10);
        if (isNaN(n) || n < 0) return toast('Enter a valid quantity', 'err');
        const change = mode === 'add' ? n : mode === 'remove' ? -n : n - r.qty;
        if (r.qty + change < 0) return toast('Cannot remove more than the stock available', 'err');
        await busy($('button[type=submit]', root), async () => {
          const { error } = await sb.rpc('adjust_stock', { p_outlet: outletId, p_product: r.id, p_change: change, p_reason: f.get('reason') || (mode === 'set' ? 'Stock count' : null), p_low_level: parseInt(f.get('low'), 10) || 0 });
          if (error) return toast(error.message, 'err');
          toast('Stock updated', 'ok'); close(); onSaved && onSaved();
        });
      };
    },
  });
}

async function historyModal(r, outletId) {
  const { data, error } = await sb.from('stock_log').select('*').eq('outlet_id', outletId).eq('product_id', r.id).order('created_at', { ascending: false }).limit(40);
  if (error) return toast(error.message, 'err');
  modal('Stock history · ' + r.name, data.length ? `<div class="table-wrap"><table><thead><tr><th>When</th><th class="num">Change</th><th class="num">Balance</th><th>Reason</th></tr></thead><tbody>
    ${data.map((x) => `<tr><td class="small">${fmtDT(x.created_at)}</td><td class="num bold" style="color:${x.change < 0 ? 'var(--err)' : 'var(--ok)'}">${x.change > 0 ? '+' : ''}${x.change}</td><td class="num">${x.qty_after}</td><td class="small">${esc(x.reason || '')}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">No movements yet</div>', { wide: true });
}

/* =====================================================================
   CUSTOMERS
   ===================================================================== */
async function pageCustomers(el) {
  let rows = []; let q = ''; let type = '';
  async function load() { rows = must(await sb.from('customers').select('*').order('name').limit(3000)); drawList(); }
  el.innerHTML = `<div class="card"><div class="row wrap"><input id="c-q" placeholder="Search name, phone or GSTIN" style="flex:1;min-width:150px;margin:0">
      <select id="c-t" style="width:auto;margin:0"><option value="">All types</option><option value="RD">RD</option><option value="URD">URD</option></select>
      <button class="btn primary" id="c-add">+ New customer</button></div></div><div class="card" id="c-list"></div>`;
  function drawList() {
    const s = q.trim().toLowerCase();
    const list = rows.filter((c) => (!type || c.type === type) && (!s || c.name.toLowerCase().includes(s) || (c.phone || '').includes(s) || (c.gstin || '').toLowerCase().includes(s)));
    $('#c-list').innerHTML = list.length ? `<div class="list">${list.map((c) => `<div class="li"><div class="main-col"><div class="t">${esc(c.name)} <span class="badge ${c.type === 'RD' ? 'blue' : ''}">${c.type}</span></div>
      <div class="s">${esc(c.phone)}${c.gstin ? ' · ' + esc(c.gstin) : ''}${c.state ? ' · ' + esc(c.state) : ''}</div></div>
      <div class="li-actions"><button class="btn sm" data-e="${c.id}">Edit</button><button class="btn sm danger" data-d="${c.id}">Delete</button></div></div>`).join('')}</div>` : '<div class="empty">No customers found</div>';
  }
  el.oninput = (e) => { if (e.target.id === 'c-q') { q = e.target.value; drawList(); } };
  el.onchange = (e) => { if (e.target.id === 'c-t') { type = e.target.value; drawList(); } };
  el.onclick = async (e) => {
    if (e.target.closest('#c-add')) return customerModal(null, load);
    const ed = e.target.closest('[data-e]'); const de = e.target.closest('[data-d]');
    if (ed) customerModal(rows.find((c) => c.id === ed.dataset.e), load);
    if (de) {
      const c = rows.find((x) => x.id === de.dataset.d);
      if (!(await confirmBox('Delete customer?', `Delete “${c.name}”?`, 'Delete', true))) return;
      const { error } = await sb.from('customers').delete().eq('id', c.id);
      if (error) return toast(/foreign|violates/i.test(error.message) ? 'This customer has orders and cannot be deleted.' : error.message, 'err');
      toast('Customer deleted', 'ok'); load();
    }
  };
  await load();
}

/* =====================================================================
   SALESMEN (login IDs - only admin can create)
   ===================================================================== */
async function callUsers(body) {
  const { data, error } = await sb.functions.invoke('manage-users', { body });
  if (error) {
    let msg = error.message;
    try { const j = await error.context.json(); if (j && j.error) msg = j.error; } catch (e) { /* ignore */ }
    throw new Error(msg === 'Failed to send a request to the Edge Function' ? 'The user-management function is not set up yet. Follow step 4 of SETUP.md.' : msg);
  }
  if (data && data.error) throw new Error(data.error);
  return data;
}

async function pageUsers(el) {
  let people = [], links = [];
  async function load() {
    const [p, l] = await Promise.all([sb.from('profiles').select('*').order('created_at'), sb.from('salesman_outlets').select('*')]);
    people = must(p); links = must(l); drawList();
  }
  el.innerHTML = `<div class="page-head"><h2>Salesman logins</h2><button class="btn primary" id="u-add">+ Add salesman</button></div><div class="card" id="u-list"></div>`;
  function drawList() {
    $('#u-list').innerHTML = `<div class="list">${people.map((u) => {
      const outs = links.filter((l) => l.user_id === u.id).map((l) => S.outlets.find((o) => o.id === l.outlet_id)?.name).filter(Boolean);
      const me = u.id === S.profile.id;
      return `<div class="li"><div class="main-col"><div class="t">${esc(u.full_name)} <span class="badge ${u.role === 'admin' ? 'blue' : ''}">${u.role}</span> ${u.active ? '' : '<span class="badge err">Switched off</span>'}</div>
        <div class="s">Username: ${esc(u.username)}${u.role === 'salesman' ? ' · ' + (outs.length ? esc(outs.join(', ')) : 'No outlet assigned') : ''}</div></div>
        ${u.role === 'salesman' ? `<div class="li-actions"><button class="btn sm" data-o="${u.id}">Outlets</button><button class="btn sm" data-pw="${u.id}">Password</button>
        <button class="btn sm ${u.active ? 'danger' : 'ok'}" data-act="${u.id}">${u.active ? 'Switch off' : 'Switch on'}</button></div>` : (me ? '<span class="small muted">You</span>' : '')}</div>`;
    }).join('')}</div>`;
  }
  el.onclick = async (e) => {
    if (e.target.closest('#u-add')) return addSalesmanModal(load);
    const o = e.target.closest('[data-o]'); const pw = e.target.closest('[data-pw]'); const ac = e.target.closest('[data-act]');
    if (o) outletsModal(people.find((u) => u.id === o.dataset.o), links, load);
    if (pw) {
      const u = people.find((x) => x.id === pw.dataset.pw);
      modal('Reset password · ' + u.full_name, `<form id="rp" class="form"><label>New password (min 6 characters)<input id="rp-p" type="text" minlength="6" required autocomplete="off"></label>
        <div class="actions"><button class="btn primary" type="submit">Set password</button></div></form>`, {
        onMount: (root, close) => {
          $('#rp', root).onsubmit = async (ev) => {
            ev.preventDefault();
            await busy($('button[type=submit]', root), async () => {
              try { await callUsers({ action: 'reset_password', user_id: u.id, password: $('#rp-p', root).value }); toast('Password changed', 'ok'); close(); }
              catch (err) { toast(err.message, 'err'); }
            });
          };
        },
      });
    }
    if (ac) {
      const u = people.find((x) => x.id === ac.dataset.act);
      if (!(await confirmBox(u.active ? 'Switch off login?' : 'Switch on login?', u.active ? `${u.full_name} will not be able to sign in. Their old orders are kept.` : `${u.full_name} will be able to sign in again.`, u.active ? 'Switch off' : 'Switch on', u.active))) return;
      try { await callUsers({ action: 'set_active', user_id: u.id, active: !u.active }); toast('Done', 'ok'); load(); } catch (err) { toast(err.message, 'err'); }
    }
  };
  await load();
}

function outletCheckboxes(selected) {
  const outs = S.outlets.filter((o) => o.active);
  return outs.length ? outs.map((o) => `<label class="inline" style="margin-bottom:8px"><input type="checkbox" name="outlet" value="${o.id}" ${selected.includes(o.id) ? 'checked' : ''}> ${esc(o.name)}</label>`).join('') : '<p class="muted">Create an outlet first.</p>';
}

function addSalesmanModal(onSaved) {
  modal('Add salesman', `<form id="sf" class="form">
    <label>Full name *<input name="full_name" required maxlength="80"></label>
    <div class="two-col"><label>Username *<input name="username" required maxlength="30" autocapitalize="none" autocomplete="off" placeholder="e.g. rahul"></label>
      <label>Password *<input name="password" type="text" required minlength="6" autocomplete="off"></label></div>
    <div class="muted small" style="margin:-4px 0 12px">Share the username and password with the salesman. They can change the password from “My Account”.</div>
    <div class="muted small" style="margin-bottom:6px;font-weight:600">Outlets this salesman can sell from *</div>${outletCheckboxes(S.outlets.filter((o) => o.active).length === 1 ? [S.outlets.find((o) => o.active).id] : [])}
    <div class="actions"><button class="btn" type="button" data-close>Cancel</button><button class="btn primary" type="submit">Create login</button></div></form>`, {
    onMount: (root, close) => {
      $('#sf', root).onsubmit = async (e) => {
        e.preventDefault();
        const f = new FormData(e.target);
        const outlet_ids = f.getAll('outlet');
        if (!outlet_ids.length) return toast('Select at least one outlet', 'err');
        await busy($('button[type=submit]', root), async () => {
          try {
            await callUsers({ action: 'create', username: f.get('username'), full_name: f.get('full_name'), password: f.get('password'), outlet_ids });
            toast('Salesman login created', 'ok'); close(); onSaved && onSaved();
          } catch (err) { toast(err.message, 'err'); }
        });
      };
    },
  });
}

function outletsModal(u, links, onSaved) {
  const sel = links.filter((l) => l.user_id === u.id).map((l) => l.outlet_id);
  modal('Outlets · ' + u.full_name, `<form id="of" class="form">${outletCheckboxes(sel)}
    <div class="actions"><button class="btn primary" type="submit">Save</button></div></form>`, {
    onMount: (root, close) => {
      $('#of', root).onsubmit = async (e) => {
        e.preventDefault();
        const ids = new FormData(e.target).getAll('outlet');
        if (!ids.length) return toast('Select at least one outlet', 'err');
        await busy($('button[type=submit]', root), async () => {
          const d = await sb.from('salesman_outlets').delete().eq('user_id', u.id);
          if (d.error) return toast(d.error.message, 'err');
          const i = await sb.from('salesman_outlets').insert(ids.map((outlet_id) => ({ user_id: u.id, outlet_id })));
          if (i.error) return toast(i.error.message, 'err');
          toast('Outlets updated', 'ok'); close(); onSaved && onSaved();
        });
      };
    },
  });
}

/* =====================================================================
   OUTLETS
   ===================================================================== */
async function pageOutlets(el) {
  async function load() {
    S.outlets = must(await sb.from('outlets').select('*').order('created_at'));
    el.innerHTML = `<div class="page-head"><h2>Outlets</h2><button class="btn primary" id="o-add">+ Add outlet</button></div>
      <div class="card"><div class="list">${S.outlets.map((o) => `<div class="li"><div class="main-col"><div class="t">${esc(o.name)} ${o.active ? '' : '<span class="badge err">Inactive</span>'}</div>
        <div class="s">${esc(o.address || '')}${o.phone ? ' · ' + esc(o.phone) : ''}</div></div>
        <div class="li-actions"><button class="btn sm" data-e="${o.id}">Edit</button></div></div>`).join('')}</div></div>
      <p class="muted small">Each outlet has its own stock. After adding an outlet, add stock for it on the Stock page and assign salesmen on the Salesmen page.</p>`;
  }
  el.onclick = (e) => {
    if (e.target.closest('#o-add')) return outletModal(null, load);
    const b = e.target.closest('[data-e]'); if (b) outletModal(S.outlets.find((o) => o.id === b.dataset.e), load);
  };
  await load();
}
function outletModal(o, onSaved) {
  const isEdit = !!o; o = o || { active: true };
  modal(isEdit ? 'Edit outlet' : 'Add outlet', `<form id="of" class="form">
    <label>Outlet name *<input name="name" required maxlength="80" value="${esc(o.name)}"></label>
    <label>Address<textarea name="address" maxlength="250">${esc(o.address)}</textarea></label>
    <label>Phone<input name="phone" maxlength="20" value="${esc(o.phone)}"></label>
    <label class="inline"><input type="checkbox" name="active" ${o.active ? 'checked' : ''}> Active</label>
    <div class="actions" style="margin-top:12px"><button class="btn" type="button" data-close>Cancel</button><button class="btn primary" type="submit">Save</button></div></form>`, {
    onMount: (root, close) => {
      $('#of', root).onsubmit = async (e) => {
        e.preventDefault();
        const f = new FormData(e.target);
        const row = { name: f.get('name').trim(), address: f.get('address').trim() || null, phone: f.get('phone').trim() || null, active: f.get('active') === 'on' };
        await busy($('button[type=submit]', root), async () => {
          const { error } = await (isEdit ? sb.from('outlets').update(row).eq('id', o.id) : sb.from('outlets').insert(row));
          if (error) return toast(error.message, 'err');
          toast('Outlet saved', 'ok'); close(); onSaved && onSaved();
        });
      };
    },
  });
}

/* =====================================================================
   SETTINGS + BACKUP
   ===================================================================== */
async function pageSettings(el) {
  const g = (k) => esc(S.settings[k] || '');
  el.innerHTML = `<div class="card"><h3>Shop details (printed on bills)</h3><form id="sf" class="form">
      <div class="two-col"><label>Shop name *<input name="shop_name" required maxlength="100" value="${g('shop_name')}"></label>
        <label>GSTIN<input name="gstin" maxlength="15" style="text-transform:uppercase" value="${g('gstin')}"></label>
        <label>Phone<input name="phone" maxlength="30" value="${g('phone')}"></label>
        <label>Email<input name="email" type="email" maxlength="80" value="${g('email')}"></label></div>
      <label>Address<textarea name="address" maxlength="300">${g('address')}</textarea></label>
      <div class="two-col"><label>Shop state * (decides CGST+SGST or IGST)<select name="state">${STATES.map((s) => `<option ${s === (S.settings.state || 'Maharashtra') ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select></label>
        <label>Bill number prefix<input name="invoice_prefix" maxlength="8" value="${g('invoice_prefix')}"></label></div>
      <label>Bank details (optional, printed on bill)<textarea name="bank_details" maxlength="300" placeholder="Bank name, A/c no, IFSC">${g('bank_details')}</textarea></label>
      <label>Terms &amp; conditions<textarea name="terms" maxlength="500">${g('terms')}</textarea></label>
      <div class="muted small" style="margin-bottom:10px">Bill numbers look like <b>${esc(S.settings.invoice_prefix || 'SP')}/2026-27/0001</b> and restart from 0001 every financial year (1 April).</div>
      <div class="actions"><button class="btn primary" type="submit">Save settings</button></div></form></div>
    <div class="card"><h3>Backup</h3><p class="muted" style="margin-top:0">Download all your shop data (products, customers, orders, stock) as a file. Please do this every week and keep it safe.</p>
      <button class="btn" id="bk">Download backup (JSON)</button></div>`;
  $('#sf').onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const rows = [...f.entries()].map(([key, value]) => ({ key, value: key === 'gstin' ? String(value).trim().toUpperCase() : String(value).trim() }));
    await busy($('#sf button[type=submit]'), async () => {
      const { error } = await sb.from('settings').upsert(rows);
      if (error) return toast(error.message, 'err');
      rows.forEach((r) => { S.settings[r.key] = r.value; });
      const bn = $('#brand-name'); if (bn) bn.textContent = S.settings.shop_name || 'Shop Pos';
      toast('Settings saved', 'ok');
    });
  };
  $('#bk').onclick = (e) => busy(e.currentTarget, async () => {
    const out = { exported_at: new Date().toISOString() };
    for (const t of ['settings', 'outlets', 'categories', 'products', 'stock', 'customers', 'orders', 'order_items', 'stock_log']) {
      let all = [], from = 0;
      for (;;) {
        const { data, error } = await sb.from(t).select('*').range(from, from + 999);
        if (error) return toast(error.message, 'err');
        all = all.concat(data);
        if (data.length < 1000) break;
        from += 1000;
      }
      out[t] = all;
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(out)], { type: 'application/json' }));
    a.download = `shop-pos-backup-${localISO(new Date())}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
    toast('Backup downloaded', 'ok');
  });
}
