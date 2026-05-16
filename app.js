/* ============================================================
   app.js — Customer App Logic for مطعم صاجي
   Uses async API calls to Google Apps Script
   ============================================================ */

(function () {
  'use strict';

  // ─── State ──────────────────────────────────────────────────
  let cart = [];
  let menuData = [];
  let currentItem = null;
  let modalQty = 1;
  let modalAddons = [];
  let appliedPromo = null;
  let currentOrderId = localStorage.getItem('saji_active_order') || null;
  let hasActiveOrder = !!currentOrderId;
  let lastTrackedStatus = null;

  // ─── History / Back-Button Stack ────────────────────────────
  // Each entry is a layer name: 'itemModal' | 'cartDrawer' | 'checkout' | 'tracking'
  const historyStack = [];

  function historyPush(layer) {
    historyStack.push(layer);
    history.pushState({ layer }, '');
  }

  function historyCloseLayer(layer) {
    switch (layer) {
      case 'itemModal':  closeItemModal(true);  break;
      case 'cartDrawer': closeCart(true);        break;
      case 'checkout':   showScreen('#menuScreen', true); break;
      case 'tracking':   /* user stays on tracking, no back */ break;
    }
  }

  window.addEventListener('popstate', () => {
    const layer = historyStack.pop();
    if (layer) {
      historyCloseLayer(layer);
    }
  });

  // ─── DOM References ─────────────────────────────────────────
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const menuScreen = $('#menuScreen');
  const checkoutScreen = $('#checkoutScreen');
  const trackingScreen = $('#trackingScreen');
  const categoriesScroll = $('#categoriesScroll');
  const menuContent = $('#menuContent');
  const itemModal = $('#itemModal');
  const cartOverlay = $('#cartOverlay');
  const cartDrawer = $('#cartDrawer');
  const cartBody = $('#cartBody');
  const cartFooter = $('#cartFooter');
  const floatingCart = $('#floatingCart');

  // ─── Screen Navigation ─────────────────────────────────────
  function showScreen(screenId, fromPopstate) {
    $$('.screen').forEach(s => s.classList.remove('active'));
    $(screenId).classList.add('active');
    window.scrollTo(0, 0);
    // Show floating cart only on menu and no active order
    floatingCart.style.display = (screenId === '#menuScreen' && cart.length > 0 && !hasActiveOrder) ? 'flex' : 'none';
    // Show floating order card on menu screen if active order
    updateFloatingOrderCard();

    // Push history for sub-screens (not when returning to menu or triggered by back button)
    if (!fromPopstate && screenId !== '#menuScreen') {
      const layer = screenId === '#checkoutScreen' ? 'checkout' : 'tracking';
      historyPush(layer);
    }
  }

  // ─── Render Categories ──────────────────────────────────────
  function renderCategories() {
    categoriesScroll.innerHTML = CATEGORIES.map((cat, i) => `
      <button class="cat-pill ${i === 0 ? 'active' : ''}" data-cat="${cat}">
        ${CATEGORY_ICONS[cat] || ''} ${cat}
      </button>
    `).join('');

    categoriesScroll.querySelectorAll('.cat-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        $$('.cat-pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        const section = document.getElementById('section-' + pill.dataset.cat);
        if (section) {
          const offset = document.querySelector('.categories-bar').getBoundingClientRect().bottom;
          const top = section.getBoundingClientRect().top + window.scrollY - offset - 8;
          window.scrollTo({ top, behavior: 'smooth' });
        }
      });
    });
  }

  // ─── Render Menu ────────────────────────────────────────────
  function renderMenuFromCache() {
    let html = '';
    CATEGORIES.forEach(cat => {
      const items = menuData.filter(item => item.category === cat);
      if (items.length === 0) return;
      html += `
        <section class="menu-section" id="section-${cat}">
          <h2 class="section-title">
            <span class="emoji">${CATEGORY_ICONS[cat] || ''}</span>
            ${cat}
          </h2>
          <div class="menu-grid">
            ${items.map(item => renderItemCard(item)).join('')}
          </div>
        </section>
        <div class="divider"></div>
      `;
    });
    menuContent.innerHTML = html;

    menuContent.querySelectorAll('.item-card').forEach(card => {
      card.addEventListener('click', () => {
        if (hasActiveOrder) return; // Block adding items during active order
        const item = menuData.find(i => i.id === card.dataset.id);
        if (item && item.inStock) openItemModal(item);
      });
    });
  }

  // Show menu INSTANTLY from cache, then refresh from API in background
  async function loadAndRenderMenu() {
    // Step 1: Render immediately from _menuCache (populated from localStorage)
    if (_menuCache && _menuCache.length && menuData.length === 0) {
      menuData = _menuCache;
      renderMenuFromCache();
    }

    // Step 2: Fetch menu + status in parallel (don't block each other)
    const [menuResult, statusResult] = await Promise.allSettled([
      getMenu(),
      apiGet('getStatus'),
    ]);

    // Apply fresh menu if it changed
    if (menuResult.status === 'fulfilled' && menuResult.value && menuResult.value.length) {
      const freshMenu = menuResult.value;
      // Only re-render if data actually changed (avoid flicker)
      if (JSON.stringify(freshMenu) !== JSON.stringify(menuData)) {
        menuData = freshMenu;
        renderMenuFromCache();
      }
    }

    // Apply restaurant status
    if (statusResult.status === 'fulfilled') {
      const status = statusResult.value;
      if (status && status.success && !status.isOpen) {
        document.getElementById('closedOverlay').style.display = 'flex';
      }
    }

    // Hide loading screen
    const loader = document.getElementById('loadingScreen');
    if (loader) loader.classList.add('hidden');
  }

  function renderItemCard(item) {
    const imgHtml = item.image
      ? `<img src="${item.image}" alt="${item.name}" class="item-img" loading="lazy">`
      : `<div class="item-placeholder">${CATEGORY_ICONS[item.category] || '🍽️'}</div>`;

    return `
      <div class="item-card ${item.inStock ? '' : 'out-of-stock'}" data-id="${item.id}">
        ${imgHtml}
        <div class="item-info">
          <h3>${item.name}</h3>
          <p class="item-desc">${item.description}</p>
          <div class="item-price">${formatPrice(item.price)}</div>
        </div>
        ${!item.inStock ? '<span class="stock-badge">نفد</span>' : ''}
        ${item.inStock ? '<button class="add-btn" aria-label="إضافة">+</button>' : ''}
      </div>
    `;
  }

  // ─── Scroll-based Active Category Detection ─────────────────
  function setupCategoryObserver() {
    let ticking = false;
    window.addEventListener('scroll', () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(() => {
          updateActiveCategory();
          ticking = false;
        });
      }
    });
  }

  function updateActiveCategory() {
    const bar = document.querySelector('.categories-bar');
    if (!bar) return;
    const offset = bar.getBoundingClientRect().bottom + 20;
    let activecat = CATEGORIES[0];

    for (const cat of CATEGORIES) {
      const el = document.getElementById('section-' + cat);
      if (!el) continue;
      const top = el.getBoundingClientRect().top;
      if (top <= offset) activecat = cat;
    }

    const pills = $$('.cat-pill');
    let changed = false;
    pills.forEach(p => {
      const isActive = p.dataset.cat === activecat;
      if (isActive && !p.classList.contains('active')) changed = true;
      p.classList.toggle('active', isActive);
    });
    if (changed) scrollActivePillIntoView();
  }

  function scrollActivePillIntoView() {
    const active = document.querySelector('.cat-pill.active');
    if (active) {
      active.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }

  // ─── Item Modal ─────────────────────────────────────────────
  function openItemModal(item) {
    currentItem = item;
    modalQty = 1;
    modalAddons = [];

    $('#modalItemName').textContent = item.name;
    $('#modalItemDesc').textContent = item.description;
    $('#modalItemPrice').textContent = formatPrice(item.price);
    $('#qtyValue').textContent = '1';

    const imgContainer = $('#modalImageContainer');
    if (item.image) {
      imgContainer.innerHTML = `<img src="${item.image}" alt="${item.name}" class="modal-img">`;
    } else {
      imgContainer.innerHTML = `<div class="modal-img-placeholder">${CATEGORY_ICONS[item.category] || '🍽️'}</div>`;
    }

    const addonsSection = $('#addonsSection');
    const addonsList = $('#addonsList');
    if (item.addons && item.addons.length > 0) {
      addonsSection.style.display = 'block';
      addonsList.innerHTML = item.addons.map(addon => `
        <div class="addon-item">
          <input type="checkbox" id="addon-${addon.id}" data-id="${addon.id}" data-price="${addon.price}">
          <label for="addon-${addon.id}">${addon.name}</label>
          <span class="addon-price">+${formatPrice(addon.price)}</span>
        </div>
      `).join('');

      addonsList.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        cb.addEventListener('change', () => {
          if (cb.checked) {
            modalAddons.push({ id: cb.dataset.id, price: parseInt(cb.dataset.price) });
          } else {
            modalAddons = modalAddons.filter(a => a.id !== cb.dataset.id);
          }
          updateModalTotal();
        });
      });
    } else {
      addonsSection.style.display = 'none';
    }

    $('#modalNotes').value = '';
    updateModalTotal();
    itemModal.classList.add('active');
    document.body.style.overflow = 'hidden';
    historyPush('itemModal');
  }

  function closeItemModal(fromPopstate) {
    itemModal.classList.remove('active');
    document.body.style.overflow = '';
    currentItem = null;
    // If closed by UI (X button / overlay tap), pop the history entry we pushed
    if (!fromPopstate && historyStack[historyStack.length - 1] === 'itemModal') {
      historyStack.pop();
      history.back();
    }
  }

  function updateModalTotal() {
    if (!currentItem) return;
    const addonTotal = modalAddons.reduce((sum, a) => sum + a.price, 0);
    const total = (currentItem.price + addonTotal) * modalQty;
    $('#modalTotalPrice').textContent = formatPrice(total);
  }

  // ─── Cart Management ───────────────────────────────────────
  function addToCart() {
    if (!currentItem) return;
    const addonNames = [];
    const selectedAddons = [];
    if (currentItem.addons) {
      currentItem.addons.forEach(addon => {
        if (modalAddons.find(a => a.id === addon.id)) {
          selectedAddons.push({ ...addon });
          addonNames.push(addon.name);
        }
      });
    }
    const notes = $('#modalNotes').value.trim();
    const addonTotal = selectedAddons.reduce((sum, a) => sum + a.price, 0);

    cart.push({
      cartId: Date.now().toString(36) + Math.random().toString(36).substr(2, 4),
      itemId: currentItem.id,
      name: currentItem.name,
      basePrice: currentItem.price,
      addons: selectedAddons,
      addonNames: addonNames,
      notes: notes,
      qty: modalQty,
      unitPrice: currentItem.price + addonTotal,
    });

    closeItemModal();
    updateCartUI();
    showAddedFeedback();
  }

  function showAddedFeedback() {
    floatingCart.style.transform = 'translateX(-50%) scale(1.08)';
    setTimeout(() => { floatingCart.style.transform = 'translateX(-50%) scale(1)'; }, 200);
  }

  function removeFromCart(cartId) {
    cart = cart.filter(c => c.cartId !== cartId);
    updateCartUI();
    renderCartDrawer();
  }

  function updateCartItemQty(cartId, delta) {
    const item = cart.find(c => c.cartId === cartId);
    if (!item) return;
    item.qty = Math.max(1, item.qty + delta);
    updateCartUI();
    renderCartDrawer();
  }

  function getCartSubtotal() {
    return cart.reduce((sum, item) => sum + item.unitPrice * item.qty, 0);
  }

  function getDiscount(subtotal) {
    if (!appliedPromo) return 0;
    if (appliedPromo.type === 'percent') return Math.round(subtotal * appliedPromo.value / 100);
    if (appliedPromo.type === 'fixed') return Math.min(appliedPromo.value, subtotal);
    return 0;
  }

  function updateCartUI() {
    const count = cart.reduce((s, c) => s + c.qty, 0);
    const subtotal = getCartSubtotal();
    floatingCart.classList.toggle('visible', cart.length > 0);
    $('#floatingCartBadge').textContent = count;
    $('#floatingCartTotal').textContent = formatPrice(subtotal + DELIVERY_FEE - getDiscount(subtotal));
  }

  // ─── Cart Drawer ────────────────────────────────────────────
  function openCart() {
    renderCartDrawer();
    cartOverlay.classList.add('active');
    cartDrawer.classList.add('active');
    floatingCart.style.display = 'none'; // Hide to prevent click overlap
    document.body.style.overflow = 'hidden';
    historyPush('cartDrawer');
  }

  function closeCart(fromPopstate) {
    cartOverlay.classList.remove('active');
    cartDrawer.classList.remove('active');
    if (cart.length > 0) floatingCart.style.display = 'flex'; // Restore
    document.body.style.overflow = '';
    if (!fromPopstate && historyStack[historyStack.length - 1] === 'cartDrawer') {
      historyStack.pop();
      history.back();
    }
  }

  function renderCartDrawer() {
    if (cart.length === 0) {
      cartBody.innerHTML = `
        <div class="cart-empty">
          <div class="empty-icon">🛒</div>
          <p>السلة فارغة</p>
          <p style="font-size:12px;color:var(--text-light);margin-top:4px;">أضف أطباقك المفضلة!</p>
        </div>`;
      cartFooter.style.display = 'none';
      return;
    }

    cartBody.innerHTML = cart.map(item => `
      <div class="cart-item">
        <div class="cart-item-info">
          <h4>${item.name}</h4>
          ${item.addonNames.length ? `<div class="cart-item-addons">+ ${item.addonNames.join('، ')}</div>` : ''}
          ${item.notes ? `<div class="cart-item-notes">📝 ${item.notes}</div>` : ''}
          <div class="cart-item-qty">
            <button onclick="window._cartQty('${item.cartId}', -1)">−</button>
            <span>${item.qty}</span>
            <button onclick="window._cartQty('${item.cartId}', 1)">+</button>
          </div>
        </div>
        <div class="cart-item-price">${formatPrice(item.unitPrice * item.qty)}</div>
        <button class="cart-item-remove" onclick="window._cartRemove('${item.cartId}')">🗑</button>
      </div>
    `).join('');

    const subtotal = getCartSubtotal();
    const discount = getDiscount(subtotal);
    const total = subtotal + DELIVERY_FEE - discount;
    const meetsMin = subtotal >= MIN_ORDER;

    let summaryHtml = `
      <div class="cart-summary-row"><span>المجموع الفرعي</span><span>${formatPrice(subtotal)}</span></div>
      <div class="cart-summary-row"><span>رسوم التوصيل</span><span>${formatPrice(DELIVERY_FEE)}</span></div>
    `;
    if (discount > 0) {
      summaryHtml += `<div class="cart-summary-row"><span class="discount">الخصم (${appliedPromo.code})</span><span class="discount">-${formatPrice(discount)}</span></div>`;
    }
    summaryHtml += `<div class="cart-summary-row total"><span>الإجمالي</span><span>${formatPrice(total)}</span></div>`;
    $('#cartSummaryRows').innerHTML = summaryHtml;

    $('#goCheckout').disabled = !meetsMin;
    $('#minOrderMsg').textContent = meetsMin ? '' : `الحد الأدنى للطلب ${formatPrice(MIN_ORDER)}`;
    cartFooter.style.display = 'block';
  }

  window._cartRemove = removeFromCart;
  window._cartQty = updateCartItemQty;

  // ─── Promo Code ─────────────────────────────────────────────
  async function applyPromo() {
    const code = $('#promoInput').value.trim();
    const promoMsg = $('#promoMsg');
    if (!code) return;

    promoMsg.textContent = '...جاري التحقق';
    promoMsg.className = 'promo-msg';

    const promo = await validatePromoCode(code);
    if (promo) {
      appliedPromo = promo;
      promoMsg.textContent = '✅ تم تطبيق كود الخصم بنجاح!';
      promoMsg.className = 'promo-msg success';
    } else {
      appliedPromo = null;
      promoMsg.textContent = '❌ كود الخصم غير صالح';
      promoMsg.className = 'promo-msg error';
    }
    renderCartDrawer();
    updateCartUI();
  }

  function goToCheckout() {
    // Close cart visually WITHOUT triggering history.back()
    // This prevents the popstate race condition on mobile
    cartOverlay.classList.remove('active');
    cartDrawer.classList.remove('active');
    document.body.style.overflow = '';
    // Clean up history stack entry for cart drawer (don't call history.back)
    const cartIdx = historyStack.indexOf('cartDrawer');
    if (cartIdx !== -1) historyStack.splice(cartIdx, 1);

    renderCheckoutSummary();
    showScreen('#checkoutScreen');
  }

  function renderCheckoutSummary() {
    const subtotal = getCartSubtotal();
    const discount = getDiscount(subtotal);
    const total = subtotal + DELIVERY_FEE - discount;

    let html = '<h3 style="font-size:15px;font-weight:700;margin-bottom:12px;">ملخص الطلب</h3>';
    cart.forEach(item => {
      html += `<div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:6px;">
        <span>${item.name} × ${item.qty}</span>
        <span>${formatPrice(item.unitPrice * item.qty)}</span>
      </div>`;
    });
    html += `<div style="border-top:1px solid var(--border);margin-top:8px;padding-top:8px;display:flex;justify-content:space-between;font-weight:700;">
      <span>الإجمالي (مع التوصيل)</span>
      <span style="color:var(--primary)">${formatPrice(total)}</span>
    </div>`;
    $('#checkoutSummary').innerHTML = html;
  }

  async function submitOrder(e) {
    e.preventDefault();
    let valid = true;
    const phone = $('#customerPhone').value.trim();
    const address = $('#customerAddress').value.trim();
    const name = $('#customerName').value.trim();

    if (!validatePhone(phone)) {
      $('#customerPhone').classList.add('error');
      $('#phoneError').classList.add('visible');
      valid = false;
    } else {
      $('#customerPhone').classList.remove('error');
      $('#phoneError').classList.remove('visible');
    }

    if (!address) {
      $('#customerAddress').classList.add('error');
      $('#addressError').classList.add('visible');
      valid = false;
    } else {
      $('#customerAddress').classList.remove('error');
      $('#addressError').classList.remove('visible');
    }

    if (!name) {
      $('#customerName').classList.add('error');
      $('#nameError').classList.add('visible');
      valid = false;
    } else {
      $('#customerName').classList.remove('error');
      $('#nameError').classList.remove('visible');
    }

    if (!valid) return;

    // Disable button while submitting
    const submitBtn = $('#submitOrder');
    submitBtn.disabled = true;
    submitBtn.textContent = '...جاري الإرسال';

    const subtotal = getCartSubtotal();
    const discount = getDiscount(subtotal);
    const total = subtotal + DELIVERY_FEE - discount;

    const order = {
      id: generateOrderId(),
      items: cart.map(c => ({
        name: c.name, qty: c.qty, unitPrice: c.unitPrice,
        addons: c.addonNames, notes: c.notes,
      })),
      subtotal, deliveryFee: DELIVERY_FEE, discount,
      promoCode: appliedPromo ? appliedPromo.code : null,
      total, phone, address,
      name: name,
      status: 'pending',
      timestamp: Date.now(),
    };

    const result = await saveOrder(order);
    console.log('Order submit result:', result);

    currentOrderId = order.id;
    hasActiveOrder = true;
    lastTrackedStatus = 'pending';
    localStorage.setItem('saji_active_order', order.id);
    cart = [];
    appliedPromo = null;
    updateCartUI();

    // Reset form
    submitBtn.disabled = false;
    submitBtn.textContent = 'تأكيد الطلب';
    $('#checkoutForm').reset();

    // Request notification permission
    requestUserNotificationPermission();

    // Go to menu with floating order card instead of tracking screen
    showScreen('#menuScreen');
    startTrackingPoll();
  }

  // ─── Order Tracking ────────────────────────────────────────
  const STATUS_ORDER = ['pending', 'cooking', 'delivery'];

  function updateTrackingTimeline(currentStatus) {
    const currentIdx = STATUS_ORDER.indexOf(currentStatus);
    $$('.timeline-step').forEach((step, i) => {
      step.classList.remove('active', 'completed');
      if (i < currentIdx) step.classList.add('completed');
      else if (i === currentIdx) step.classList.add('active');
    });
  }

  let trackingInterval = null;
  function startTrackingPoll() {
    if (trackingInterval) clearInterval(trackingInterval);
    trackingInterval = setInterval(async () => {
      if (!currentOrderId) return;
      const status = await getOrderStatus(currentOrderId);
      if (!status || status === 'not_found') {
        // Order done or removed
        clearTrackingState();
        return;
      }

      // Update floating card status
      updateFloatingOrderStatus(status);

      // Update tracking timeline if on tracking screen
      if ($('#trackingScreen').classList.contains('active')) {
        updateTrackingTimeline(status);
      }

      // Notify user if status changed
      if (lastTrackedStatus && status !== lastTrackedStatus) {
        notifyStatusChange(status);
      }
      lastTrackedStatus = status;

      if (status === 'done') {
        clearTrackingState();
      }
    }, 4000);
  }

  function clearTrackingState() {
    clearInterval(trackingInterval);
    trackingInterval = null;
    currentOrderId = null;
    hasActiveOrder = false;
    lastTrackedStatus = null;
    localStorage.removeItem('saji_active_order');
    updateFloatingOrderCard();
    // If on tracking screen, show done
    if ($('#trackingScreen').classList.contains('active')) {
      updateTrackingTimeline('done');
      showOrderCompleted();
    }
    // If on menu screen, re-enable floating cart if cart has items
    floatingCart.style.display = cart.length > 0 ? 'flex' : 'none';
  }

  function showOrderCompleted() {
    // Mark all steps as completed
    $$('.timeline-step').forEach(step => {
      step.classList.remove('active');
      step.classList.add('completed');
    });
    // Show completion message and new order button
    $('#orderDoneMsg').style.display = 'block';
    $('#newOrderBtn').style.display = 'block';
  }

  function hideOrderCompleted() {
    $('#orderDoneMsg').style.display = 'none';
    $('#newOrderBtn').style.display = 'none';
  }

  // ─── Stock Sync Poll ───────────────────────────────────────
  // Poll every 30s for stock changes
  function startStockPoll() {
    setInterval(() => { loadAndRenderMenu(); }, 30000);
  }

  // ─── Floating Order Card ──────────────────────────────────
  const STATUS_LABELS = {
    pending: '⏳ قيد الانتظار',
    cooking: '🔥 جاري التحضير',
    delivery: '🚗 في الطريق',
    done: '✅ تم التسليم',
  };

  function updateFloatingOrderCard() {
    const card = $('#floatingOrderCard');
    if (!card) return;
    const menuActive = $('#menuScreen').classList.contains('active');
    if (hasActiveOrder && currentOrderId && menuActive) {
      card.style.display = 'flex';
      $('#focOrderId').textContent = currentOrderId;
    } else {
      card.style.display = 'none';
    }
  }

  function updateFloatingOrderStatus(status) {
    const el = $('#focStatus');
    if (el) el.textContent = STATUS_LABELS[status] || status;
    // Update dot color
    const dot = document.querySelector('.foc-dot');
    if (dot) {
      dot.className = 'foc-dot';
      if (status === 'cooking') dot.classList.add('cooking');
      else if (status === 'delivery') dot.classList.add('delivery');
      else if (status === 'done') dot.classList.add('done');
    }
  }

  // ─── User Notifications ──────────────────────────────────
  function requestUserNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }

  function sendUserNotification(title, body) {
    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification(title, {
          body: body,
          icon: 'asstes/saji_logo.png',
          tag: 'saji-user-' + Date.now(),
        });
      } catch(e) { console.warn('Notification failed:', e); }
    }
  }

  function notifyStatusChange(newStatus) {
    const msgs = {
      cooking: { title: '🔥 بدأ تحضير طلبك!', body: 'الطباخ بدأ بتحضير طلبك الآن' },
      delivery: { title: '🚗 طلبك في الطريق!', body: 'طلبك في طريقه إليك الآن' },
      done: { title: '✅ تم توصيل طلبك!', body: 'بالعافية! شكراً لاختيارك مطعم صاجي' },
    };
    if (msgs[newStatus]) {
      sendUserNotification(msgs[newStatus].title, msgs[newStatus].body);
    }
  }

  // ─── Event Listeners ───────────────────────────────────────
  async function init() {
    renderCategories();

    // Render cached menu SYNCHRONOUSLY first (instant UI)
    if (_menuCache && _menuCache.length) {
      menuData = _menuCache;
      renderMenuFromCache();
      // Hide loading screen immediately since we have cached data
      const loader = document.getElementById('loadingScreen');
      if (loader) loader.classList.add('hidden');
    }

    setupCategoryObserver();
    startStockPoll();

    // Fetch fresh data in background (non-blocking)
    loadAndRenderMenu();

    // ─── Restore active order tracking ──────────────────────
    if (currentOrderId) {
      hasActiveOrder = true;
      // Stay on menu with floating card, fetch status
      getOrderStatus(currentOrderId).then(status => {
        if (status && status !== 'not_found') {
          lastTrackedStatus = status;
          updateFloatingOrderStatus(status);
          updateFloatingOrderCard();
        } else {
          clearTrackingState();
        }
      }).catch(() => {});
      startTrackingPoll();
      updateFloatingOrderCard();
    }

    // Floating order card click → go to tracking screen
    $('#floatingOrderCard').addEventListener('click', () => {
      if (!currentOrderId) return;
      showScreen('#trackingScreen');
      $('#trackingOrderId').textContent = `رقم الطلب: ${currentOrderId}`;
      hideOrderCompleted();
      if (lastTrackedStatus) updateTrackingTimeline(lastTrackedStatus);
    });

    itemModal.addEventListener('click', (e) => { if (e.target === itemModal) closeItemModal(); });
    $('#qtyMinus').addEventListener('click', () => {
      modalQty = Math.max(1, modalQty - 1);
      $('#qtyValue').textContent = modalQty;
      updateModalTotal();
    });
    $('#qtyPlus').addEventListener('click', () => {
      modalQty++;
      $('#qtyValue').textContent = modalQty;
      updateModalTotal();
    });
    $('#modalAddToCart').addEventListener('click', addToCart);

    floatingCart.addEventListener('click', openCart);
    cartOverlay.addEventListener('click', closeCart);
    $('#cartClose').addEventListener('click', closeCart);
    $('#promoApply').addEventListener('click', applyPromo);
    $('#goCheckout').addEventListener('click', goToCheckout);

    $('#backToMenu').addEventListener('click', () => {
      // Pop the checkout history entry by going back
      if (historyStack[historyStack.length - 1] === 'checkout') {
        historyStack.pop();
        history.back();
      }
      showScreen('#menuScreen', true);
    });
    $('#checkoutForm').addEventListener('submit', submitOrder);

    $('#customerPhone').addEventListener('input', () => {
      $('#customerPhone').classList.remove('error');
      $('#phoneError').classList.remove('visible');
    });
    $('#customerAddress').addEventListener('input', () => {
      $('#customerAddress').classList.remove('error');
      $('#addressError').classList.remove('visible');
    });
    $('#customerName').addEventListener('input', () => {
      $('#customerName').classList.remove('error');
      $('#nameError').classList.remove('visible');
    });

    $('#newOrderBtn').addEventListener('click', () => {
      currentOrderId = null;
      hasActiveOrder = false;
      lastTrackedStatus = null;
      localStorage.removeItem('saji_active_order');
      if (trackingInterval) clearInterval(trackingInterval);
      hideOrderCompleted();
      updateFloatingOrderCard();
      showScreen('#menuScreen');
    });
  }

  init();
})();
