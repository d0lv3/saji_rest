/* ============================================================
   admin.js — Admin Dashboard Logic for مطعم صاجي
   Uses Supabase for auth, data, and real-time updates
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
      $('#offersSection').classList.toggle('active', target === 'offers');
      if (target === 'completed') renderCompletedOrders();
      if (target === 'offers') { renderOfferItemsGrid(); renderOffersList(); }
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

  // ─── Browser Notification ──────────────────────────────────
  function sendBrowserNotification(title, body) {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, { body: body, icon: 'asstes/saji_app_logo.png' });
    }
  }

  // ─── Render Orders ──────────────────────────────────────────
  let _lastOrdersHash = '';

  async function renderOrders() {
    const orders = await getOrders();

    const hash = JSON.stringify(orders.map(o => o.id + ':' + o.status));
    if (hash === _lastOrdersHash) return;
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

    if (orders.length > lastOrderCount && lastOrderCount > 0) {
      const newCount = orders.length - lastOrderCount;
      playNotificationSound();
      sendBrowserNotification(
        '🔔 طلب جديد!',
        `وصل ${newCount} طلب جديد — اضغط للمراجعة`
      );
    }
    lastOrderCount = orders.length;

    document.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        btn.textContent = '...جاري التحديث';
        await updateOrder(btn.dataset.orderId, btn.dataset.action);
        sendPushNotification(btn.dataset.orderId, btn.dataset.action);
        _lastOrdersHash = '';
        await renderOrders();
      });
    });

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
        sendPushNotification(orderId, 'cancelled');
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

    const totalOrders = orders.length;
    const totalRevenue = orders.reduce((sum, o) => sum + o.total, 0);
    const avgOrder = totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0;

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

    $('#statTotalOrders').textContent = totalOrders;
    $('#statTotalRevenue').textContent = formatPrice(totalRevenue);
    $('#statTopItem').textContent = topItem;
    $('#statAvgOrder').textContent = formatPrice(avgOrder);

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
    await clearCompletedOrders();
    btn.disabled = false;
    btn.textContent = '🗑️ مسح الكل';
    await renderCompletedOrders();
  });

  // ─── Render Menu Management ─────────────────────────────────
  let editingItemId = null;

  async function renderMenuTable() {
    const menu = await getMenu();
    menuCache = menu;
    const body = $('#menuTableBody');
    body.innerHTML = menu.map(item => {
      const isEditing = editingItemId === item.id;
      if (isEditing) {
        return `
          <div class="menu-table-row editing" data-item-id="${item.id}">
            <div class="edit-row-fields">
              <div class="edit-field">
                <label>الاسم</label>
                <input type="text" class="edit-input edit-name" value="${escapeHtml(item.name)}" data-item-id="${item.id}">
              </div>
              <div class="edit-field">
                <label>السعر (د.ع)</label>
                <input type="number" class="edit-input edit-price" value="${item.price}" min="0" data-item-id="${item.id}">
              </div>
              <div class="edit-field">
                <label>التصنيف</label>
                <select class="edit-input edit-category" data-item-id="${item.id}">
                  ${CATEGORIES.map(cat => `<option value="${cat}" ${cat === item.category ? 'selected' : ''}>${cat}</option>`).join('')}
                </select>
              </div>
            </div>
            <div class="edit-row-actions">
              <button class="edit-save-btn" data-item-id="${item.id}">حفظ</button>
              <button class="edit-cancel-btn" data-item-id="${item.id}">إلغاء</button>
              <label class="toggle-switch">
                <input type="checkbox" ${item.inStock ? 'checked' : ''} data-item-id="${item.id}">
                <span class="toggle-slider"></span>
              </label>
            </div>
          </div>
        `;
      }
      return `
        <div class="menu-table-row" data-item-id="${item.id}">
          <div><span class="item-name">${escapeHtml(item.name)}</span></div>
          <span class="item-cat">${escapeHtml(item.category)}</span>
          <span class="item-price-cell">${formatPrice(item.price)}</span>
          <div class="menu-row-controls">
            <button class="edit-btn" data-item-id="${item.id}" title="تعديل">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <label class="toggle-switch">
              <input type="checkbox" ${item.inStock ? 'checked' : ''} data-item-id="${item.id}">
              <span class="toggle-slider"></span>
            </label>
          </div>
        </div>
      `;
    }).join('');

    // Stock toggles
    body.querySelectorAll('input[type="checkbox"]').forEach(toggle => {
      toggle.addEventListener('change', async () => {
        toggle.disabled = true;
        await toggleStock(toggle.dataset.itemId, toggle.checked);
        toggle.disabled = false;
      });
    });

    // Edit buttons
    body.querySelectorAll('.edit-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        editingItemId = btn.dataset.itemId;
        renderMenuTable();
      });
    });

    // Cancel edit
    body.querySelectorAll('.edit-cancel-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        editingItemId = null;
        renderMenuTable();
      });
    });

    // Save edit
    body.querySelectorAll('.edit-save-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.itemId;
        const row = body.querySelector(`.menu-table-row[data-item-id="${id}"]`);
        const newName = row.querySelector('.edit-name').value.trim();
        const newPrice = parseInt(row.querySelector('.edit-price').value);
        const newCategory = row.querySelector('.edit-category').value;

        if (!newName || !newPrice) return;

        btn.disabled = true;
        btn.textContent = '...حفظ';

        await updateMenuItem(id, { name: newName, price: newPrice, category: newCategory });
        editingItemId = null;
        await renderMenuTable();
      });
    });
  }

  // ─── Refresh Button ──────────────────────────────────────────
  $('#refreshBtn').addEventListener('click', async () => {
    const btn = $('#refreshBtn');
    btn.classList.add('spinning');
    _lastOrdersHash = '';
    await renderOrders();
    await renderMenuTable();
    setTimeout(() => btn.classList.remove('spinning'), 600);
  });

  // ─── Realtime Subscriptions ─────────────────────────────────
  function startRealtimeUpdates() {
    subscribeToOrders(function () {
      renderOrders();
    });
    subscribeToMenu(function () {
      renderMenuTable();
    });
  }

  // ─── Login ──────────────────────────────────────────────────
  const loginOverlay = $('#loginOverlay');
  const loginForm = $('#loginForm');
  const loginBtn = $('#loginBtn');
  const loginError = $('#loginError');
  const passInput = $('#adminPassword');
  const togglePass = $('#togglePass');

  togglePass.addEventListener('click', () => {
    const isPass = passInput.type === 'password';
    passInput.type = isPass ? 'text' : 'password';
    togglePass.querySelector('.eye-open').style.display = isPass ? 'none' : 'block';
    togglePass.querySelector('.eye-closed').style.display = isPass ? 'block' : 'none';
  });

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = $('#adminEmail').value.trim();
    const pass = passInput.value.trim();
    if (!email || !pass) return;

    loginBtn.disabled = true;
    loginBtn.textContent = '...جاري التحقق';
    loginError.textContent = '';
    passInput.classList.remove('error');
    $('#adminEmail').classList.remove('error');

    const result = await adminLogin(email, pass);

    if (result && result.success) {
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
    startRealtimeUpdates();

    initFirebaseMessaging().then(token => {
      if (token) {
        savePushToken('ADMIN', token).catch(() => {});
      }
    }).catch(() => {});
  }

  // ─── Restaurant Status ──────────────────────────────────────
  async function loadRestaurantStatus() {
    const result = await getRestaurantStatus();
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
      await setRestaurantStatus(isOpen);
    });
  }

  // ─── Offers Management ──────────────────────────────────────
  // selectedOfferItems: [{id: 'meat_saj', qty: 1}, ...]
  let selectedOfferItems = [];

  function getSelectedItem(itemId) {
    return selectedOfferItems.find(s => s.id === itemId);
  }

  function renderOfferItemsGrid() {
    const grid = $('#offerItemsGrid');
    if (!grid) return;
    const menu = menuCache.length ? menuCache : _menuCache;
    grid.innerHTML = menu.map(item => {
      const sel = getSelectedItem(item.id);
      return `
        <div class="offer-item-check ${sel ? 'checked' : ''}" data-item-id="${item.id}">
          <input type="checkbox" ${sel ? 'checked' : ''} value="${item.id}">
          <span class="offer-item-name">${escapeHtml(item.name)}</span>
          <span class="offer-item-price">${formatPrice(item.price)}</span>
          <div class="offer-item-qty ${sel ? 'visible' : ''}" data-item-id="${item.id}">
            <button type="button" class="oiq-btn oiq-minus" data-item-id="${item.id}">−</button>
            <span class="oiq-val">${sel ? sel.qty : 1}</span>
            <button type="button" class="oiq-btn oiq-plus" data-item-id="${item.id}">+</button>
          </div>
        </div>
      `;
    }).join('');

    grid.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      cb.addEventListener('change', () => {
        const card = cb.closest('.offer-item-check');
        const qtyRow = card.querySelector('.offer-item-qty');
        if (cb.checked) {
          selectedOfferItems.push({ id: cb.value, qty: 1 });
          qtyRow.classList.add('visible');
        } else {
          selectedOfferItems = selectedOfferItems.filter(s => s.id !== cb.value);
          qtyRow.classList.remove('visible');
        }
        card.classList.toggle('checked', cb.checked);
        updateOfferPreview();
      });
    });

    grid.querySelectorAll('.oiq-plus').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const sel = getSelectedItem(btn.dataset.itemId);
        if (sel) {
          sel.qty = Math.min(sel.qty + 1, 10);
          btn.closest('.offer-item-qty').querySelector('.oiq-val').textContent = sel.qty;
          updateOfferPreview();
        }
      });
    });

    grid.querySelectorAll('.oiq-minus').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const sel = getSelectedItem(btn.dataset.itemId);
        if (sel && sel.qty > 1) {
          sel.qty--;
          btn.closest('.offer-item-qty').querySelector('.oiq-val').textContent = sel.qty;
          updateOfferPreview();
        }
      });
    });
  }

  function updateOfferPreview() {
    const menu = menuCache.length ? menuCache : _menuCache;
    const summary = $('#offerPreviewSummary');
    const priceInput = $('#offerPrice');
    if (selectedOfferItems.length === 0) {
      summary.style.display = 'none';
      return;
    }
    const originalPrice = selectedOfferItems.reduce((sum, sel) => {
      const item = menu.find(m => m.id === sel.id);
      return sum + (item ? item.price * sel.qty : 0);
    }, 0);
    const offerPrice = parseInt(priceInput.value) || 0;
    const savings = originalPrice - offerPrice;

    $('#offerOriginalPrice').textContent = formatPrice(originalPrice);
    $('#offerSavings').textContent = savings > 0 ? formatPrice(savings) : '—';
    $('#offerSavings').style.color = savings > 0 ? 'var(--success)' : 'var(--text-muted)';
    summary.style.display = 'flex';
  }

  if ($('#offerPrice')) {
    $('#offerPrice').addEventListener('input', updateOfferPreview);
  }

  if ($('#offerForm')) {
    $('#offerForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      if (selectedOfferItems.length === 0) {
        alert('يرجى اختيار صنف واحد على الأقل');
        return;
      }
      const title = $('#offerTitle').value.trim();
      const price = parseInt($('#offerPrice').value);
      const durationVal = parseInt($('#offerDurationValue').value);
      const durationUnit = $('#offerDurationUnit').value;

      if (!title || !price || !durationVal) return;

      let ms = durationVal * 3600000;
      if (durationUnit === 'days') ms = durationVal * 86400000;
      if (durationUnit === 'weeks') ms = durationVal * 604800000;
      const expiresAt = new Date(Date.now() + ms).toISOString();

      // Store as [{id, qty}] in item_ids
      const itemData = selectedOfferItems.map(s => ({ id: s.id, qty: s.qty }));

      const btn = $('#offerSubmitBtn');
      btn.disabled = true;
      btn.textContent = '...جاري الإنشاء';

      const result = await createOffer(title, price, itemData, expiresAt);

      btn.disabled = false;
      btn.textContent = 'إنشاء العرض';

      if (result.success) {
        $('#offerForm').reset();
        selectedOfferItems = [];
        renderOfferItemsGrid();
        updateOfferPreview();
        await renderOffersList();
      } else {
        alert('حدث خطأ أثناء إنشاء العرض');
      }
    });
  }

  // Helper: normalize itemIds — supports both old ["id"] and new [{id, qty}] formats
  function normalizeOfferItems(itemIds) {
    return itemIds.map(entry => {
      if (typeof entry === 'string') return { id: entry, qty: 1 };
      return { id: entry.id, qty: entry.qty || 1 };
    });
  }

  async function renderOffersList() {
    const list = $('#offersListAdmin');
    if (!list) return;
    const offers = await getAllOffers();
    const menu = menuCache.length ? menuCache : _menuCache;

    if (offers.length === 0) {
      list.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:40px 0;">لا توجد عروض حالياً</p>';
      return;
    }

    list.innerHTML = offers.map(offer => {
      const expired = new Date(offer.expiresAt) < new Date();
      const entries = normalizeOfferItems(offer.itemIds);
      const itemTags = entries.map(e => {
        const item = menu.find(m => m.id === e.id);
        const name = item ? item.name : e.id;
        return e.qty > 1 ? name + ' ×' + e.qty : name;
      });
      const originalPrice = entries.reduce((sum, e) => {
        const item = menu.find(m => m.id === e.id);
        return sum + (item ? item.price * e.qty : 0);
      }, 0);

      const expiryDate = new Date(offer.expiresAt);
      const timeLeft = expiryDate - Date.now();
      let timeLeftStr = '';
      if (expired) {
        timeLeftStr = 'منتهي';
      } else if (timeLeft < 3600000) {
        timeLeftStr = Math.ceil(timeLeft / 60000) + ' دقيقة';
      } else if (timeLeft < 86400000) {
        timeLeftStr = Math.ceil(timeLeft / 3600000) + ' ساعة';
      } else {
        timeLeftStr = Math.ceil(timeLeft / 86400000) + ' يوم';
      }

      return `
        <div class="offer-admin-card ${expired ? 'expired' : ''} ${!offer.isActive ? 'inactive' : ''}">
          <div class="offer-admin-header">
            <div>
              <strong class="offer-admin-title">${escapeHtml(offer.title)}</strong>
              <span class="offer-admin-badge ${expired ? 'badge-expired' : offer.isActive ? 'badge-active' : 'badge-inactive'}">
                ${expired ? 'منتهي' : offer.isActive ? 'فعّال' : 'متوقف'}
              </span>
            </div>
            <div class="offer-admin-price">${formatPrice(offer.price)}</div>
          </div>
          <div class="offer-admin-items">${itemTags.map(n => '<span class="offer-admin-item-tag">' + escapeHtml(n) + '</span>').join('')}</div>
          <div class="offer-admin-meta">
            <span>${expired ? 'انتهى' : 'ينتهي خلال'}: ${timeLeftStr}</span>
            ${originalPrice > offer.price ? '<span class="offer-admin-savings">توفير ' + formatPrice(originalPrice - offer.price) + '</span>' : ''}
          </div>
          <div class="offer-admin-actions">
            ${!expired ? `<button class="offer-toggle-btn" data-offer-id="${offer.id}" data-active="${offer.isActive ? '1' : '0'}">
              ${offer.isActive ? '⏸ إيقاف' : '▶ تفعيل'}
            </button>` : ''}
            <button class="offer-delete-btn" data-offer-id="${offer.id}">🗑 حذف</button>
          </div>
        </div>
      `;
    }).join('');

    list.querySelectorAll('.offer-toggle-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const isActive = btn.dataset.active === '1';
        btn.disabled = true;
        await toggleOfferActive(parseInt(btn.dataset.offerId), !isActive);
        await renderOffersList();
      });
    });

    list.querySelectorAll('.offer-delete-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('هل أنت متأكد من حذف هذا العرض؟')) return;
        btn.disabled = true;
        await deleteOffer(parseInt(btn.dataset.offerId));
        await renderOffersList();
      });
    });
  }

  // Check session on load
  isAdminLoggedIn().then(loggedIn => {
    if (loggedIn) {
      loginOverlay.classList.add('hidden');
      startDashboard();
    } else {
      passInput.focus();
    }
  });
})();
