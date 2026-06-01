/* ============================================================
   app.js — Customer App Logic for مطعم صاجي
   Uses Supabase Realtime for instant updates
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
      case 'tracking':   showScreen('#menuScreen', true); break;
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
    floatingCart.style.display = (screenId === '#menuScreen' && cart.length > 0 && !hasActiveOrder) ? 'flex' : 'none';
    updateFloatingOrderCard();

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
        if (hasActiveOrder) return;
        const item = menuData.find(i => i.id === card.dataset.id);
        if (item && item.inStock) openItemModal(item);
      });
    });
  }

  // ─── Render Offers ──────────────────────────────────────────
  let activeOffers = [];

  async function loadAndRenderOffers() {
    const offers = await getActiveOffers();
    activeOffers = offers;
    renderOffers();
  }

  // Helper: normalize itemIds — supports both old ["id"] and new [{id, qty}] formats
  function normalizeOfferItems(itemIds) {
    return itemIds.map(function (entry) {
      if (typeof entry === 'string') return { id: entry, qty: 1 };
      return { id: entry.id, qty: entry.qty || 1 };
    });
  }

  function renderOffers() {
    const container = document.getElementById('offersContainer');
    if (!container) return;
    if (activeOffers.length === 0) {
      container.innerHTML = '';
      return;
    }

    container.innerHTML = activeOffers.map(offer => {
      const entries = normalizeOfferItems(offer.itemIds);
      const items = entries.map(e => {
        const item = menuData.find(m => m.id === e.id);
        return item ? { item: item, qty: e.qty } : null;
      }).filter(Boolean);

      const originalPrice = items.reduce((sum, e) => sum + e.item.price * e.qty, 0);
      const savings = originalPrice - offer.price;
      const expiresAt = new Date(offer.expiresAt);
      const timeLeft = expiresAt - Date.now();

      let timeStr = '';
      if (timeLeft < 3600000) {
        timeStr = Math.ceil(timeLeft / 60000) + ' دقيقة';
      } else if (timeLeft < 86400000) {
        timeStr = Math.ceil(timeLeft / 3600000) + ' ساعة';
      } else {
        timeStr = Math.ceil(timeLeft / 86400000) + ' يوم';
      }

      return `
        <div class="offer-banner" data-offer-id="${offer.id}">
          <div class="offer-banner-header">
            <div class="offer-banner-badge">عرض خاص</div>
            <div class="offer-banner-timer">متبقي ${timeStr}</div>
          </div>
          <h3 class="offer-banner-title">${escapeHtml(offer.title)}</h3>
          <div class="offer-banner-items">
            ${items.map(e => `
              <div class="offer-banner-item">
                ${e.item.image ? `<img src="${escapeHtml(e.item.image)}" alt="${escapeHtml(e.item.name)}" class="offer-banner-item-img">` : `<span class="offer-banner-item-icon">${CATEGORY_ICONS[e.item.category] || '🍽️'}</span>`}
                <span class="offer-banner-item-name">${e.qty > 1 ? e.qty + '× ' : ''}${escapeHtml(e.item.name)}</span>
              </div>
            `).join('')}
          </div>
          <div class="offer-banner-footer">
            <div class="offer-banner-prices">
              ${savings > 0 ? `<span class="offer-banner-original">${formatPrice(originalPrice)}</span>` : ''}
              <span class="offer-banner-price">${formatPrice(offer.price)}</span>
            </div>
            <button class="offer-add-btn" data-offer-id="${offer.id}">أضف للسلة</button>
          </div>
        </div>
      `;
    }).join('');

    container.querySelectorAll('.offer-add-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (hasActiveOrder) return;
        const offer = activeOffers.find(o => o.id === parseInt(btn.dataset.offerId));
        if (!offer) return;
        addOfferToCart(offer);
      });
    });
  }

  function addOfferToCart(offer) {
    const entries = normalizeOfferItems(offer.itemIds);
    const itemNames = entries.map(e => {
      const item = menuData.find(m => m.id === e.id);
      const name = item ? item.name : e.id;
      return e.qty > 1 ? name + ' ×' + e.qty : name;
    }).join(' + ');

    cart.push({
      cartId: Date.now().toString(36) + Math.random().toString(36).substr(2, 4),
      itemId: 'offer-' + offer.id,
      name: offer.title,
      basePrice: offer.price,
      addons: [],
      addonNames: [],
      notes: itemNames,
      qty: 1,
      unitPrice: offer.price,
      isOffer: true,
    });

    updateCartUI();
    showAddedFeedback();
  }

  async function loadAndRenderMenu() {
    if (_menuCache && _menuCache.length && menuData.length === 0) {
      menuData = _menuCache;
      renderMenuFromCache();
    }

    const [menuResult, statusResult] = await Promise.allSettled([
      getMenu(),
      getRestaurantStatus(),
    ]);

    if (menuResult.status === 'fulfilled' && menuResult.value && menuResult.value.length) {
      const freshMenu = menuResult.value;
      if (JSON.stringify(freshMenu) !== JSON.stringify(menuData)) {
        menuData = freshMenu;
        renderMenuFromCache();
      }
    }

    if (statusResult.status === 'fulfilled') {
      const status = statusResult.value;
      if (status && status.success && !status.isOpen) {
        document.getElementById('closedOverlay').style.display = 'flex';
      }
    }

    await loadAndRenderOffers();

    const loader = document.getElementById('loadingScreen');
    if (loader) loader.classList.add('hidden');
  }

  function renderItemCard(item) {
    const imgHtml = item.image
      ? `<img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.name)}" class="item-img" loading="lazy">`
      : `<div class="item-placeholder">${CATEGORY_ICONS[item.category] || '🍽️'}</div>`;

    return `
      <div class="item-card ${item.inStock ? '' : 'out-of-stock'}" data-id="${escapeHtml(item.id)}">
        ${imgHtml}
        <div class="item-info">
          <h3>${escapeHtml(item.name)}</h3>
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
      imgContainer.innerHTML = `<img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.name)}" class="modal-img">`;
    } else {
      imgContainer.innerHTML = `<div class="modal-img-placeholder">${CATEGORY_ICONS[item.category] || '🍽️'}</div>`;
    }

    const addonsSection = $('#addonsSection');
    const addonsList = $('#addonsList');
    if (item.addons && item.addons.length > 0) {
      addonsSection.style.display = 'block';
      addonsList.innerHTML = item.addons.map(addon => `
        <div class="addon-item">
          <input type="checkbox" id="addon-${escapeHtml(addon.id)}" data-id="${escapeHtml(addon.id)}" data-price="${parseInt(addon.price) || 0}">
          <label for="addon-${escapeHtml(addon.id)}">${escapeHtml(addon.name)}</label>
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
    const deliveryFee = getDeliveryFee(subtotal);
    floatingCart.classList.toggle('visible', cart.length > 0);
    $('#floatingCartBadge').textContent = count;
    $('#floatingCartTotal').textContent = formatPrice(subtotal + deliveryFee - getDiscount(subtotal));
  }

  // ─── Cart Drawer ────────────────────────────────────────────
  function openCart() {
    renderCartDrawer();
    cartOverlay.classList.add('active');
    cartDrawer.classList.add('active');
    floatingCart.style.display = 'none';
    document.body.style.overflow = 'hidden';
    historyPush('cartDrawer');
  }

  function closeCart(fromPopstate) {
    cartOverlay.classList.remove('active');
    cartDrawer.classList.remove('active');
    if (cart.length > 0) floatingCart.style.display = 'flex';
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
      <div class="cart-item ${item.isOffer ? 'cart-item-offer' : ''}">
        <div class="cart-item-info">
          <h4>${item.isOffer ? '🏷️ ' : ''}${escapeHtml(item.name)}</h4>
          ${item.addonNames && item.addonNames.length ? `<div class="cart-item-addons">+ ${item.addonNames.map(a => escapeHtml(a)).join('، ')}</div>` : ''}
          ${item.isOffer && item.notes ? `<div class="cart-item-offer-items">${escapeHtml(item.notes)}</div>` : ''}
          ${!item.isOffer && item.notes ? `<div class="cart-item-notes">📝 ${escapeHtml(item.notes)}</div>` : ''}
          <div class="cart-item-qty">
            <button onclick="window._cartQty('${escapeHtml(item.cartId)}', -1)">−</button>
            <span>${item.qty}</span>
            <button onclick="window._cartQty('${escapeHtml(item.cartId)}', 1)">+</button>
          </div>
        </div>
        <div class="cart-item-price">${formatPrice(item.unitPrice * item.qty)}</div>
        <button class="cart-item-remove" onclick="window._cartRemove('${escapeHtml(item.cartId)}')">🗑</button>
      </div>
    `).join('');

    const subtotal = getCartSubtotal();
    const deliveryFee = getDeliveryFee(subtotal);
    const discount = getDiscount(subtotal);
    const total = subtotal + deliveryFee - discount;
    const meetsMin = subtotal >= MIN_ORDER;

    let deliveryMsgHtml = '';
    if (subtotal < FREE_DELIVERY_THRESHOLD) {
      const remaining = FREE_DELIVERY_THRESHOLD - subtotal;
      deliveryMsgHtml = `<div class="delivery-msg delivery-msg-add">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
        أضف بقيمة <strong>${formatPrice(remaining)}</strong> للحصول على توصيل مجاني
      </div>`;
    } else {
      deliveryMsgHtml = `<div class="delivery-msg delivery-msg-free">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
        مبروك! حصلت على توصيل مجاني 🎉
      </div>`;
    }

    let summaryHtml = deliveryMsgHtml;
    summaryHtml += `
      <div class="cart-summary-row"><span>المجموع الفرعي</span><span>${formatPrice(subtotal)}</span></div>
      <div class="cart-summary-row"><span>رسوم التوصيل</span><span>${deliveryFee === 0 ? '<span class="free-delivery-label">مجاني</span>' : formatPrice(deliveryFee)}</span></div>
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
    cartOverlay.classList.remove('active');
    cartDrawer.classList.remove('active');
    document.body.style.overflow = '';
    const cartIdx = historyStack.indexOf('cartDrawer');
    if (cartIdx !== -1) historyStack.splice(cartIdx, 1);

    const saved = JSON.parse(localStorage.getItem('saji_customer') || '{}');
    if (saved.phone) $('#customerPhone').value = saved.phone;
    if (saved.address) $('#customerAddress').value = saved.address;
    if (saved.name) $('#customerName').value = saved.name;

    renderCheckoutSummary();
    showScreen('#checkoutScreen');
  }

  function renderCheckoutSummary() {
    const subtotal = getCartSubtotal();
    const deliveryFee = getDeliveryFee(subtotal);
    const discount = getDiscount(subtotal);
    const total = subtotal + deliveryFee - discount;

    let html = '<h3 style="font-size:15px;font-weight:700;margin-bottom:12px;">ملخص الطلب</h3>';
    cart.forEach(item => {
      html += `<div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:6px;">
        <span>${escapeHtml(item.name)} × ${item.qty}</span>
        <span>${formatPrice(item.unitPrice * item.qty)}</span>
      </div>`;
    });
    html += `<div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:6px;color:var(--text-muted);">
      <span>رسوم التوصيل</span>
      <span>${deliveryFee === 0 ? '<span style="color:var(--success);font-weight:600;">مجاني</span>' : formatPrice(deliveryFee)}</span>
    </div>`;
    if (discount > 0) {
      html += `<div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:6px;color:var(--success);">
        <span>الخصم (${appliedPromo.code})</span>
        <span>-${formatPrice(discount)}</span>
      </div>`;
    }
    html += `<div style="border-top:1px solid var(--border);margin-top:8px;padding-top:8px;display:flex;justify-content:space-between;font-weight:700;">
      <span>الإجمالي</span>
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

    const submitBtn = $('#submitOrder');
    submitBtn.disabled = true;
    submitBtn.textContent = '...جاري الإرسال';

    // Build items for server-side validation (prices are looked up server-side)
    const orderItems = cart.map(function (c) {
      return {
        item_id: c.itemId,
        qty: c.qty,
        addon_ids: (c.addons || []).map(function (a) { return a.id; }),
        notes: c.notes || '',
      };
    });

    const result = await saveOrder({
      name: name,
      phone: phone,
      address: address,
      items: orderItems,
      promoCode: appliedPromo ? appliedPromo.code : null,
    });

    if (!result.success) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'تأكيد الطلب';
      var errMsg = result.error || '';
      if (errMsg.indexOf('item_unavailable') !== -1) {
        alert('بعض الأصناف لم تعد متوفرة. يرجى تحديث السلة');
      } else if (errMsg.indexOf('offer_expired') !== -1) {
        alert('العرض انتهت صلاحيته. يرجى إزالته من السلة');
      } else if (errMsg.indexOf('minimum_not_met') !== -1) {
        alert('لم يتم تحقيق الحد الأدنى للطلب');
      } else {
        alert('حدث خطأ أثناء إرسال الطلب. يرجى المحاولة مرة أخرى');
      }
      console.error('Order submit failed:', errMsg);
      return;
    }

    var serverOrder = result.data;
    console.log('Order created:', serverOrder);

    currentOrderId = serverOrder.id;
    hasActiveOrder = true;
    lastTrackedStatus = 'pending';
    localStorage.setItem('saji_active_order', serverOrder.id);

    localStorage.setItem('saji_customer', JSON.stringify({ phone, address, name }));
    cart = [];
    appliedPromo = null;
    updateCartUI();

    submitBtn.disabled = false;
    submitBtn.textContent = 'تأكيد الطلب';
    $('#checkoutForm').reset();

    const fcmToken = getFCMToken();
    if (fcmToken) {
      savePushToken(serverOrder.id, fcmToken).catch(function () {});
    }

    sendPushNotification(serverOrder.id, 'new_order');

    showScreen('#trackingScreen');
    $('#trackingOrderId').textContent = 'رقم الطلب: ' + serverOrder.id;
    hideOrderCompleted();
    updateTrackingTimeline('pending');
    startTrackingRealtime();
  }

  // ─── Order Tracking (Realtime) ─────────────────────────────
  const STATUS_ORDER = ['pending', 'cooking', 'delivery'];

  function updateTrackingTimeline(currentStatus) {
    if (currentStatus === 'cancelled') {
      $$('.timeline-step').forEach(step => {
        step.classList.remove('active', 'completed');
      });
      return;
    }
    const currentIdx = STATUS_ORDER.indexOf(currentStatus);
    $$('.timeline-step').forEach((step, i) => {
      step.classList.remove('active', 'completed');
      if (i < currentIdx) step.classList.add('completed');
      else if (i === currentIdx) step.classList.add('active');
    });
  }

  function startTrackingRealtime() {
    if (!currentOrderId) return;

    subscribeToOrder(currentOrderId, function (result) {
      if (!result || result.status === 'not_found') {
        clearTrackingState();
        return;
      }

      const status = result.status;

      updateFloatingOrderStatus(status);

      if ($('#trackingScreen').classList.contains('active')) {
        updateTrackingTimeline(status);
      }

      if (status === 'cancelled') {
        const note = result.cancelNote || '';
        showOrderCancelled(note);
        clearTrackingStateKeepScreen();
        return;
      }

      lastTrackedStatus = status;

      if (status === 'done') {
        clearTrackingState();
      }
    });
  }

  function clearTrackingState() {
    unsubscribeFromOrder();
    currentOrderId = null;
    hasActiveOrder = false;
    lastTrackedStatus = null;
    localStorage.removeItem('saji_active_order');
    updateFloatingOrderCard();
    if ($('#trackingScreen').classList.contains('active')) {
      updateTrackingTimeline('done');
      showOrderCompleted();
    }
    floatingCart.style.display = cart.length > 0 ? 'flex' : 'none';
  }

  function clearTrackingStateKeepScreen() {
    unsubscribeFromOrder();
    currentOrderId = null;
    hasActiveOrder = false;
    lastTrackedStatus = null;
    localStorage.removeItem('saji_active_order');
    updateFloatingOrderCard();
    floatingCart.style.display = cart.length > 0 ? 'flex' : 'none';
  }

  function showOrderCompleted() {
    $$('.timeline-step').forEach(step => {
      step.classList.remove('active');
      step.classList.add('completed');
    });
    $('#orderDoneMsg').style.display = 'block';
    $('#newOrderBtn').style.display = 'block';
    $('#orderCancelledMsg').style.display = 'none';
  }

  function showOrderCancelled(note) {
    $('#orderDoneMsg').style.display = 'none';
    const cancelMsg = $('#orderCancelledMsg');
    cancelMsg.style.display = 'block';
    const cancelNote = $('#cancelNote');
    cancelNote.textContent = note || '';
    cancelNote.style.display = note ? 'block' : 'none';
    $('#newOrderBtn').style.display = 'block';
    updateTrackingTimeline('cancelled');
  }

  function hideOrderCompleted() {
    $('#orderDoneMsg').style.display = 'none';
    $('#newOrderBtn').style.display = 'none';
    $('#orderCancelledMsg').style.display = 'none';
  }

  // ─── Menu Realtime Sync ───────────────────────────────────
  function startMenuRealtime() {
    subscribeToMenu(async function () {
      const freshMenu = await fetchMenuFresh();
      if (freshMenu && freshMenu.length) {
        menuData = freshMenu;
        renderMenuFromCache();
      }
    });
    subscribeToOffers(function () {
      loadAndRenderOffers();
    });
  }

  // ─── Floating Order Card ──────────────────────────────────
  const STATUS_LABELS = {
    pending: '⏳ قيد الانتظار',
    cooking: '🔥 جاري التحضير',
    delivery: '🚗 في الطريق',
    done: '✅ تم التسليم',
    cancelled: '❌ تم الإلغاء',
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
    const dot = document.querySelector('.foc-dot');
    if (dot) {
      dot.className = 'foc-dot';
      if (status === 'cooking') dot.classList.add('cooking');
      else if (status === 'delivery') dot.classList.add('delivery');
      else if (status === 'done') dot.classList.add('done');
    }
  }

  // ─── Event Listeners ───────────────────────────────────────
  async function init() {
    renderCategories();

    if (_menuCache && _menuCache.length) {
      menuData = _menuCache;
      renderMenuFromCache();
      const loader = document.getElementById('loadingScreen');
      if (loader) loader.classList.add('hidden');
    }

    setupCategoryObserver();
    startMenuRealtime();

    loadAndRenderMenu();

    initFirebaseMessaging().catch(() => {});

    // ─── Restore active order tracking ──────────────────────
    if (currentOrderId) {
      hasActiveOrder = true;
      getOrderStatusFull(currentOrderId).then(result => {
        if (result && result.status !== 'not_found') {
          if (result.status === 'cancelled') {
            showScreen('#trackingScreen');
            $('#trackingOrderId').textContent = `رقم الطلب: ${currentOrderId}`;
            showOrderCancelled(result.cancelNote || '');
            clearTrackingStateKeepScreen();
            return;
          }
          lastTrackedStatus = result.status;
          updateFloatingOrderStatus(result.status);
          updateFloatingOrderCard();
        } else {
          clearTrackingState();
        }
      }).catch(() => {});
      startTrackingRealtime();
      updateFloatingOrderCard();
    }

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
      if (historyStack[historyStack.length - 1] === 'checkout') {
        historyStack.pop();
        history.back();
      }
      showScreen('#menuScreen', true);
    });

    $('#trackingBackToMenu').addEventListener('click', () => {
      showScreen('#menuScreen');
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
      unsubscribeFromOrder();
      hideOrderCompleted();
      updateFloatingOrderCard();
      showScreen('#menuScreen');
    });
  }

  init();
})();
