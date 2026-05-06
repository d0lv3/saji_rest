/* ============================================================
   admin.js — Admin Dashboard Logic for مطعم صاجي
   Uses async API calls to Google Apps Script
   ============================================================ */

(function () {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  let lastOrderCount = 0;
  let audioCtx = null;
  let menuCache = [];

  // ─── Tab Switching ──────────────────────────────────────────
  $$('.admin-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      $$('.admin-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const target = tab.dataset.tab;
      $('#ordersSection').classList.toggle('active', target === 'orders');
      $('#menuSection').classList.toggle('active', target === 'menu');
    });
  });

  // ─── Audio Alert (Web Audio API) ────────────────────────────
  function playNotificationSound() {
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      [0, 150].forEach(delay => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.type = 'sine';
        osc.frequency.value = delay === 0 ? 880 : 1100;
        gain.gain.value = 0.3;
        const t = audioCtx.currentTime + delay / 1000;
        osc.start(t);
        osc.stop(t + 0.12);
      });
    } catch (e) {
      console.warn('Audio not available', e);
    }
  }

  // ─── Render Orders ──────────────────────────────────────────
  async function renderOrders() {
    const orders = await getOrders();
    const pending = orders.filter(o => o.status === 'pending');
    const cooking = orders.filter(o => o.status === 'cooking');
    const delivery = orders.filter(o => o.status === 'delivery');

    $('#pendingCount').textContent = pending.length;
    $('#cookingCount').textContent = cooking.length;
    $('#deliveryCount').textContent = delivery.length;

    const activeCount = pending.length + cooking.length + delivery.length;
    $('#orderCountBadge').textContent = activeCount + ' طلبات نشطة';

    const emptyMsg = '<p style="color:var(--text-light);font-size:13px;text-align:center;padding:40px 0;">لا توجد طلبات</p>';

    $('#pendingOrders').innerHTML = pending.length ? pending.map(o => renderOrderCard(o, 'pending')).join('') : emptyMsg;
    $('#cookingOrders').innerHTML = cooking.length ? cooking.map(o => renderOrderCard(o, 'cooking')).join('') : emptyMsg;
    $('#deliveryOrders').innerHTML = delivery.length ? delivery.map(o => renderOrderCard(o, 'delivery')).join('') : emptyMsg;

    // Check for new orders & play sound
    if (orders.length > lastOrderCount && lastOrderCount > 0) {
      playNotificationSound();
    }
    lastOrderCount = orders.length;

    // Attach action buttons
    document.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        btn.textContent = '...جاري التحديث';
        await updateOrder(btn.dataset.orderId, btn.dataset.action);
        await renderOrders();
      });
    });
  }

  function renderOrderCard(order, currentStatus) {
    const time = getTimeString(order.timestamp);
    const date = getDateString(order.timestamp);

    let itemsHtml = '<ul class="order-items">';
    order.items.forEach(item => {
      itemsHtml += `<li>
        <strong>${item.name}</strong> × ${item.qty} — ${formatPrice(item.unitPrice * item.qty)}
        ${item.addons && item.addons.length ? `<div class="item-addons">+ ${item.addons.join('، ')}</div>` : ''}
        ${item.notes ? `<div class="item-notes">📝 ${item.notes}</div>` : ''}
      </li>`;
    });
    itemsHtml += '</ul>';

    let actionsHtml = '<div class="order-actions">';
    if (currentStatus === 'pending') {
      actionsHtml += `<button class="order-action-btn cooking" data-action="cooking" data-order-id="${order.id}">🔥 بدء التحضير</button>`;
    } else if (currentStatus === 'cooking') {
      actionsHtml += `<button class="order-action-btn delivery" data-action="delivery" data-order-id="${order.id}">🚗 إرسال للتوصيل</button>`;
    } else if (currentStatus === 'delivery') {
      actionsHtml += `<button class="order-action-btn done" data-action="done" data-order-id="${order.id}">✅ تم التسليم</button>`;
    }
    actionsHtml += '</div>';

    return `
      <div class="order-card">
        <div class="order-card-header">
          <span class="order-num">${order.id}</span>
          <span class="order-time">${time} · ${date}</span>
        </div>
        <div class="order-card-body">
          <div class="order-field"><span class="field-label">📞 الهاتف:</span><span>${order.phone}</span></div>
          <div class="order-field"><span class="field-label">📍 العنوان:</span><span>${order.address}</span></div>
          ${order.name ? `<div class="order-field"><span class="field-label">👤 الاسم:</span><span>${order.name}</span></div>` : ''}
          ${itemsHtml}
        </div>
        <div class="order-card-total">
          <span>الإجمالي</span>
          <span class="total-val">${formatPrice(order.total)}</span>
        </div>
        ${actionsHtml}
      </div>
    `;
  }

  // ─── Render Menu Management ─────────────────────────────────
  async function renderMenuTable() {
    const menu = await getMenu();
    menuCache = menu;
    const body = $('#menuTableBody');
    body.innerHTML = menu.map(item => `
      <div class="menu-table-row">
        <div><span class="item-name">${item.name}</span></div>
        <span class="item-cat">${item.category}</span>
        <span class="item-price-cell">${formatPrice(item.price)}</span>
        <label class="toggle-switch">
          <input type="checkbox" ${item.inStock ? 'checked' : ''} data-item-id="${item.id}">
          <span class="toggle-slider"></span>
        </label>
      </div>
    `).join('');

    body.querySelectorAll('input[type="checkbox"]').forEach(toggle => {
      toggle.addEventListener('change', async () => {
        toggle.disabled = true;
        await toggleStock(toggle.dataset.itemId, toggle.checked);
        toggle.disabled = false;
      });
    });
  }

  // ─── Polling ────────────────────────────────────────────────
  function startPolling() {
    setInterval(() => { renderOrders(); }, 5000);
  }

  // ─── Login ──────────────────────────────────────────────────
  const loginOverlay = $('#loginOverlay');
  const loginForm = $('#loginForm');
  const loginBtn = $('#loginBtn');
  const loginError = $('#loginError');
  const passInput = $('#adminPassword');
  const togglePass = $('#togglePass');

  // Toggle password visibility
  togglePass.addEventListener('click', () => {
    const isPass = passInput.type === 'password';
    passInput.type = isPass ? 'text' : 'password';
    togglePass.querySelector('.eye-open').style.display = isPass ? 'none' : 'block';
    togglePass.querySelector('.eye-closed').style.display = isPass ? 'block' : 'none';
  });

  // Check if already logged in
  function isLoggedIn() {
    return sessionStorage.getItem('admin_token');
  }

  // Login handler
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const pass = passInput.value.trim();
    if (!pass) return;

    loginBtn.disabled = true;
    loginBtn.textContent = '...جاري التحقق';
    loginError.textContent = '';
    passInput.classList.remove('error');

    const result = await apiGet('adminLogin', { pass: pass });

    if (result && result.success) {
      sessionStorage.setItem('admin_token', result.token);
      loginOverlay.classList.add('hidden');
      startDashboard();
    } else {
      passInput.classList.add('error');
      loginError.textContent = 'كلمة المرور غير صحيحة';
      loginBtn.disabled = false;
      loginBtn.textContent = 'دخول';
    }
  });

  // ─── Init ───────────────────────────────────────────────────
  async function startDashboard() {
    const orders = await getOrders();
    lastOrderCount = orders.length;
    await renderOrders();
    await renderMenuTable();
    startPolling();
  }

  // Check session on load
  if (isLoggedIn()) {
    loginOverlay.classList.add('hidden');
    startDashboard();
  } else {
    passInput.focus();
  }
})();
