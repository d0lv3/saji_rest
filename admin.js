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

  // ─── Navbar View Switching ──────────────────────────────────
  $$('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('.nav-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const view = btn.dataset.view;
      $('#dashboardView').classList.toggle('active', view === 'dashboard');
      $('#previewView').classList.toggle('active', view === 'preview');
    });
  });

  // ─── Tab Switching ──────────────────────────────────────────
  $$('.admin-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      $$('.admin-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const target = tab.dataset.tab;
      $('#ordersSection').classList.toggle('active', target === 'orders');
      $('#completedSection').classList.toggle('active', target === 'completed');
      $('#menuSection').classList.toggle('active', target === 'menu');
      if (target === 'completed') renderCompletedOrders();
    });
  });

  // ─── Browser Notifications ─────────────────────────────────
  // Push notifications are now handled by Firebase Cloud Messaging (server-side).
  // Admin receives push via FCM when new orders arrive.

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
  let _lastOrdersHash = '';

  async function renderOrders() {
    const orders = await getOrders();

    // Quick hash to check if data actually changed
    const hash = JSON.stringify(orders.map(o => o.id + ':' + o.status));
    if (hash === _lastOrdersHash) return; // No change — skip DOM work
    _lastOrdersHash = hash;

    const pending = orders.filter(o => o.status === 'pending');
    const cooking = orders.filter(o => o.status === 'cooking');
    const delivery = orders.filter(o => o.status === 'delivery');

    $('#pendingCount').textContent = pending.length;
    $('#cookingCount').textContent = cooking.length;
    $('#deliveryCount').textContent = delivery.length;

    const activeCount = pending.length + cooking.length + delivery.length;
    $('#orderCountBadge').textContent = activeCount + ' طلبات نشطة';

    const emptyMsg = '<p style="color:var(--text-muted);font-size:13px;text-align:center;padding:40px 0;">لا توجد طلبات</p>';

    $('#pendingOrders').innerHTML = pending.length ? pending.map(o => renderOrderCard(o, 'pending')).join('') : emptyMsg;
    $('#cookingOrders').innerHTML = cooking.length ? cooking.map(o => renderOrderCard(o, 'cooking')).join('') : emptyMsg;
    $('#deliveryOrders').innerHTML = delivery.length ? delivery.map(o => renderOrderCard(o, 'delivery')).join('') : emptyMsg;

    // Check for new orders & play sound + send notification
    if (orders.length > lastOrderCount && lastOrderCount > 0) {
      const newCount = orders.length - lastOrderCount;
      playNotificationSound();
      sendBrowserNotification(
        '🔔 طلب جديد!',
        `وصل ${newCount} طلب جديد — اضغط للمراجعة`
      );
    }
    lastOrderCount = orders.length;

    // Attach action buttons
    document.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        btn.textContent = '...جاري التحديث';
        await updateOrder(btn.dataset.orderId, btn.dataset.action);
        _lastOrdersHash = ''; // Force re-render after status change
        await renderOrders();
      });
    });

    // Attach decline buttons
    document.querySelectorAll('.decline-toggle-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const orderId = btn.dataset.orderId;
        const form = document.getElementById('decline-form-' + orderId);
        if (form) {
          const isVisible = form.style.display !== 'none';
          form.style.display = isVisible ? 'none' : 'block';
        }
      });
    });

    document.querySelectorAll('.decline-confirm-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const orderId = btn.dataset.orderId;
        const noteEl = document.getElementById('decline-note-' + orderId);
        const note = noteEl ? noteEl.value.trim() : '';
        if (!note) {
          noteEl.style.borderColor = 'var(--danger)';
          noteEl.setAttribute('placeholder', 'يرجى كتابة سبب الرفض');
          return;
        }
        btn.disabled = true;
        btn.textContent = '...جاري الإلغاء';
        await declineOrder(orderId, note);
        _lastOrdersHash = '';
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
        <strong>${escapeHtml(item.name)}</strong> × ${parseInt(item.qty) || 0} — ${formatPrice(item.unitPrice * item.qty)}
        ${item.addons && item.addons.length ? `<div class="item-addons">+ ${item.addons.map(a => escapeHtml(a)).join('، ')}</div>` : ''}
        ${item.notes ? `<div class="item-notes">📝 ${escapeHtml(item.notes)}</div>` : ''}
      </li>`;
    });
    itemsHtml += '</ul>';

    let actionsHtml = '<div class="order-actions">';
    if (currentStatus === 'pending') {
      actionsHtml += `<button class="order-action-btn cooking" data-action="cooking" data-order-id="${order.id}">🔥 بدء التحضير</button>`;
      actionsHtml += `<button class="order-action-btn decline decline-toggle-btn" data-order-id="${order.id}">❌ رفض</button>`;
    } else if (currentStatus === 'cooking') {
      actionsHtml += `<button class="order-action-btn delivery" data-action="delivery" data-order-id="${order.id}">🚗 إرسال للتوصيل</button>`;
      actionsHtml += `<button class="order-action-btn decline decline-toggle-btn" data-order-id="${order.id}">❌ رفض</button>`;
    } else if (currentStatus === 'delivery') {
      actionsHtml += `<button class="order-action-btn done" data-action="done" data-order-id="${order.id}">✅ تم التسليم</button>`;
      actionsHtml += `<button class="order-action-btn decline decline-toggle-btn" data-order-id="${order.id}">❌ رفض</button>`;
    }
    actionsHtml += '</div>';

    // Decline form (hidden by default)
    actionsHtml += `
      <div class="decline-form" id="decline-form-${order.id}" style="display:none;">
        <textarea id="decline-note-${order.id}" class="decline-note" placeholder="سبب رفض الطلب..." rows="2"></textarea>
        <button class="order-action-btn decline-confirm decline-confirm-btn" data-order-id="${order.id}">تأكيد رفض الطلب</button>
      </div>
    `;

    return `
      <div class="order-card">
        <div class="order-card-header">
          <span class="order-num">${order.id}</span>
          <span class="order-time">${time} · ${date}</span>
        </div>
        <div class="order-card-body">
          <div class="order-field"><span class="field-label">📞 الهاتف:</span><span>${escapeHtml(order.phone)}</span></div>
          <div class="order-field"><span class="field-label">📍 العنوان:</span><span>${escapeHtml(order.address)}</span></div>
          ${order.name ? `<div class="order-field"><span class="field-label">👤 الاسم:</span><span>${escapeHtml(order.name)}</span></div>` : ''}
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

  // ─── Completed Orders + Stats Dashboard ─────────────────────
  async function renderCompletedOrders() {
    const orders = await getCompletedOrders();

    // Calculate stats
    const totalOrders = orders.length;
    const totalRevenue = orders.reduce((sum, o) => sum + o.total, 0);
    const avgOrder = totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0;

    // Most sold item
    const itemFreq = {};
    orders.forEach(o => {
      o.items.forEach(item => {
        itemFreq[item.name] = (itemFreq[item.name] || 0) + item.qty;
      });
    });
    let topItem = '—';
    let topCount = 0;
    Object.entries(itemFreq).forEach(([name, count]) => {
      if (count > topCount) { topItem = name; topCount = count; }
    });

    // Update stat cards
    $('#statTotalOrders').textContent = totalOrders;
    $('#statTotalRevenue').textContent = formatPrice(totalRevenue);
    $('#statTopItem').textContent = topItem;
    $('#statAvgOrder').textContent = formatPrice(avgOrder);

    // Render completed orders list
    const list = $('#completedOrdersList');
    if (orders.length === 0) {
      list.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:40px 0;">لا توجد طلبات مكتملة بعد</p>';
      return;
    }

    list.innerHTML = orders.map(order => {
      const time = getTimeString(order.timestamp);
      const date = getDateString(order.timestamp);
      const itemsSummary = order.items.map(i => `${escapeHtml(i.name)} ×${parseInt(i.qty) || 0}`).join('، ');
      return `
        <div class="completed-order-row">
          <div class="cor-header">
            <span class="cor-id">${escapeHtml(order.id)}</span>
            <span class="cor-time">${time} · ${date}</span>
          </div>
          <div class="cor-items">${itemsSummary}</div>
          <div class="cor-footer">
            <span>${escapeHtml(order.name || order.phone)}</span>
            <span class="cor-total">${formatPrice(order.total)}</span>
          </div>
        </div>
      `;
    }).join('');
  }

  // Reset completed orders
  $('#resetCompletedBtn').addEventListener('click', async () => {
    if (!confirm('هل أنت متأكد من مسح جميع الطلبات المكتملة؟ لا يمكن التراجع عن هذا الإجراء.')) return;
    const btn = $('#resetCompletedBtn');
    btn.disabled = true;
    btn.textContent = '...جاري المسح';
    await apiPost({ action: 'clearCompleted' });
    btn.disabled = false;
    btn.textContent = '🗑️ مسح الكل';
    await renderCompletedOrders();
  });

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
    setInterval(() => { renderOrders(); }, 3000);
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
    // Load orders + menu + status all in parallel
    const [ordersResult] = await Promise.allSettled([
      getOrders(),
      renderMenuTable(),
      loadRestaurantStatus(),
    ]);

    if (ordersResult.status === 'fulfilled') {
      lastOrderCount = ordersResult.value.length;
    }
    await renderOrders();
    setupStatusToggle();
    startPolling();

    // Initialize Firebase push for admin new-order alerts
    initFirebaseMessaging().then(token => {
      if (token) {
        savePushToken('ADMIN', token).catch(() => {});
      }
    }).catch(() => {});
  }

  // ─── Restaurant Status ──────────────────────────────────────
  async function loadRestaurantStatus() {
    const result = await apiGet('getStatus');
    if (result && result.success) {
      const sw = $('#statusSwitch');
      sw.checked = result.isOpen;
      updateStatusLabel(result.isOpen);
    }
  }

  function updateStatusLabel(isOpen) {
    const label = $('#statusLabel');
    label.textContent = isOpen ? 'مفتوح' : 'مغلق';
    label.style.color = isOpen ? 'var(--success)' : 'var(--danger)';
  }

  function setupStatusToggle() {
    $('#statusSwitch').addEventListener('change', async (e) => {
      const isOpen = e.target.checked;
      updateStatusLabel(isOpen);
      await apiPost({ action: 'setStatus', isOpen: isOpen });
    });
  }

  // Check session on load
  if (isLoggedIn()) {
    loginOverlay.classList.add('hidden');
    startDashboard();
  } else {
    passInput.focus();
  }
})();
