/* ============================================================
   data.js — Shared Data Layer for مطعم صاجي
   Uses Google Apps Script as backend for cross-device sync
   Performance-optimized with localStorage caching
   ============================================================ */

// ══════════════════════════════════════════════════════════════
// ⬇️  PASTE YOUR GOOGLE APPS SCRIPT WEB APP URL HERE  ⬇️
// ══════════════════════════════════════════════════════════════
const API_URL = 'https://script.google.com/macros/s/AKfycbwsHnVxOr4QFtVqZnJQz8Kdx_rLyUwPsTV4LDpRxT-ahTlGiNKV4g2-1hG8DDLZI71C/exec';
// ══════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════
// ⬇️  PASTE YOUR FIREBASE CONFIG HERE  ⬇️
// ══════════════════════════════════════════════════════════════
const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyDPid05Ev3wxbWPePIWCjQV9KXyHnmRLfM',
  authDomain: 'saji-restaurant.firebaseapp.com',
  projectId: 'saji-restaurant',
  storageBucket: 'saji-restaurant.firebasestorage.app',
  messagingSenderId: '356430027743',
  appId: '1:356430027743:web:12d3a36cabd5555adc426a',
};
// ⬇️  PASTE YOUR VAPID KEY HERE (Firebase Console → Cloud Messaging → Web Push certificates)  ⬇️
const FCM_VAPID_KEY = 'BIFqdoOVACa4TfSz5_SqREK0ustN24abyuoo9VmsvmA3LcOJG7YW13ra86wwPp1v2SQLV2_Gc0YCTRegQPHHTsU';
// ══════════════════════════════════════════════════════════════

// ─── Firebase Messaging Setup ────────────────────────────────
let _fcmToken = null;

async function initFirebaseMessaging() {
  try {
    if (!firebase || !firebase.messaging) {
      console.warn('Firebase SDK not loaded');
      return null;
    }

    firebase.initializeApp(FIREBASE_CONFIG);
    const messaging = firebase.messaging();

    // Request notification permission
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.warn('Notification permission denied');
      return null;
    }

    // Get SW registration (already registered in index.html)
    const swReg = await navigator.serviceWorker.ready;

    // Get FCM token
    _fcmToken = await messaging.getToken({
      vapidKey: FCM_VAPID_KEY,
      serviceWorkerRegistration: swReg,
    });
    console.debug('FCM token obtained');

    // Handle foreground messages (app is open and visible)
    messaging.onMessage((payload) => {
      console.log('Foreground push received:', payload);
      const title = payload.notification?.title || 'مطعم صاجي';
      const body = payload.notification?.body || '';
      // Show via service worker so it looks consistent
      swReg.showNotification(title, {
        body: body,
        icon: 'asstes/saji_app_logo.png',
        tag: 'saji-order-fg-' + Date.now(),
        vibrate: [200, 100, 200],
      });
    });

    return _fcmToken;
  } catch (err) {
    console.warn('Firebase messaging init failed:', err);
    return null;
  }
}

function getFCMToken() {
  return _fcmToken;
}

async function savePushToken(orderId, token) {
  if (!token) return;
  return await apiPost({ action: 'savePushToken', orderId: orderId, fcmToken: token });
}

// ─── Constants ───────────────────────────────────────────────
const DELIVERY_FEE_AMOUNT = 1000;
const FREE_DELIVERY_THRESHOLD = 5000;

function getDeliveryFee(subtotal) {
  return subtotal < FREE_DELIVERY_THRESHOLD ? DELIVERY_FEE_AMOUNT : 0;
}
const MIN_ORDER = 3000;
const CATEGORIES = ['الصاج', 'الكص', 'البركر', 'الريزو', 'الفنكر', 'المشاريب'];
const CATEGORY_ICONS = {
  'الصاج': '🫓',
  'الكص': '🌯',
  'البركر': '🍔',
  'الريزو': '🍚',
  'الفنكر': '🍟',
  'المشاريب': '🥤',
};

// ─── Fallback Menu (shows immediately while API loads) ───────
const FALLBACK_MENU = [
  {id:'chicken_saj',name:'صاجية دجاج',description:'صاجية دجاج طازجة',category:'الصاج',price:2500,image:'asstes/dishes_assets/chiecken_saj.png',inStock:true,addons:[]},
  {id:'meat_saj',name:'صاجية لحم',description:'صاجية لحم طازجة',category:'الصاج',price:3500,image:'asstes/dishes_assets/meat_saj.png',inStock:true,addons:[]},
  {id:'chicken_saj_plate',name:'وجبة عربي صاج دجاج',description:'وجبة عربي صاج دجاج مع مخللات',category:'الصاج',price:3000,image:'asstes/dishes_assets/chicken_saj_plate.png',inStock:true,addons:[]},
  {id:'meat_saj_plate',name:'وجبة عربي صاج لحم',description:'وجبة عربي صاج لحم مع مخللات',category:'الصاج',price:4000,image:'asstes/dishes_assets/meat_saj_plate.png',inStock:true,addons:[]},
  {id:'saj_burger',name:'صاج بركر',description:'صاج بركر مميز',category:'الصاج',price:2500,image:'asstes/dishes_assets/saj_burger.png',inStock:true,addons:[]},
  {id:'chicken_kass_wrap',name:'لفة حجري كص دجاج',description:'لفة حجري كص دجاج',category:'الكص',price:2000,image:'asstes/dishes_assets/hajiri_chicken_kass.png',inStock:true,addons:[]},
  {id:'meat_kass_wrap',name:'لفة حجري كص لحم',description:'لفة حجري كص لحم',category:'الكص',price:3000,image:'asstes/dishes_assets/hajiri_meat_kass.png',inStock:true,addons:[]},
  {id:'chicken_kass_plate',name:'طبق كص دجاج',description:'طبق كص دجاج مع أرز ومخللات',category:'الكص',price:5000,image:'asstes/dishes_assets/chicken_kass_plate.png',inStock:true,addons:[]},
  {id:'meat_kass_plate',name:'طبق كص لحم',description:'طبق كص لحم مع أرز ومخللات',category:'الكص',price:6000,image:'asstes/dishes_assets/meat_kass_plate.png',inStock:true,addons:[]},
  {id:'meat_burger',name:'بركر لحم عراقي كلاسيك',description:'بركر لحم عراقي كلاسيكي',category:'البركر',price:2500,image:'asstes/dishes_assets/meat_burger.png',inStock:true,addons:[]},
  {id:'meat_burger_cheese',name:'بركر لحم بالجبن',description:'بركر لحم مع جبن',category:'البركر',price:3000,image:'asstes/dishes_assets/meat_burger_w_cheese.png',inStock:true,addons:[]},
  {id:'kass_chicken_rizo',name:'ريزو كص دجاج',description:'ريزو كص دجاج',category:'الريزو',price:3000,image:'asstes/dishes_assets/kass_chicken_rizo.png',inStock:true,addons:[]},
  {id:'kass_meat_rizo',name:'ريزو كص لحم',description:'ريزو كص لحم',category:'الريزو',price:4000,image:'asstes/dishes_assets/kass_meat_rizo.png',inStock:true,addons:[]},
  {id:'fries_small',name:'قدح فنكر صغير',description:'قدح فنكر صغير',category:'الفنكر',price:1000,image:'asstes/dishes_assets/fries.png',inStock:true,addons:[]},
  {id:'fries_cheese',name:'فنكر بالجبن',description:'فنكر بالجبن',category:'الفنكر',price:1500,image:'asstes/dishes_assets/fries_w_cheese.png',inStock:true,addons:[]},
  {id:'fries_large',name:'قدح فنكر كبير',description:'قدح فنكر كبير',category:'الفنكر',price:2000,image:'asstes/dishes_assets/fries_plate.png',inStock:true,addons:[]},
  {id:'fries_large_cheese',name:'قدح فنكر كبير بالجبن',description:'قدح فنكر كبير بالجبن',category:'الفنكر',price:2500,image:'asstes/dishes_assets/fries_plate_w_cheese.jpg',inStock:true,addons:[]},
  {id:'water',name:'ماء',description:'مياه معدنية',category:'المشاريب',price:250,image:'asstes/dishes_assets/wbottle.png',inStock:true,addons:[]},
  {id:'pepsi',name:'بيبسي',description:'مشروب غازي بارد',category:'المشاريب',price:500,image:'asstes/dishes_assets/pepsi.png',inStock:true,addons:[]},
  {id:'grape_juice',name:'عصير زبيب',description:'عصير زبيب طبيعي',category:'المشاريب',price:500,image:'asstes/dishes_assets/brjuice.png',inStock:true,addons:[]},
];

// ─── Local Cache ─────────────────────────────────────────────
let _menuCache = [...FALLBACK_MENU];
let _ordersCache = [];

// ─── localStorage Persistence ────────────────────────────────
// Menu rarely changes — cache it in localStorage so next visit is instant
const MENU_STORAGE_KEY = 'saji_menu_cache';
const MENU_CACHE_TTL = 60 * 1000; // 1 minute — after this, fetch fresh in background

function loadMenuFromStorage() {
  try {
    const raw = localStorage.getItem(MENU_STORAGE_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw);
    if (cached && cached.data && cached.data.length > 0) {
      return cached;
    }
  } catch (e) {}
  return null;
}

function saveMenuToStorage(data) {
  try {
    localStorage.setItem(MENU_STORAGE_KEY, JSON.stringify({
      data: data,
      ts: Date.now(),
    }));
  } catch (e) {}
}

// Initialize _menuCache from localStorage immediately (synchronous, no wait)
(function () {
  const stored = loadMenuFromStorage();
  if (stored && stored.data) {
    _menuCache = stored.data;
  }
})();

// ─── In-flight Request Deduplication ─────────────────────────
// Prevents multiple concurrent identical API calls
const _inflightRequests = {};

// ─── API Helpers ─────────────────────────────────────────────

async function apiGet(action, params) {
  let url = API_URL + '?action=' + encodeURIComponent(action);
  if (params) {
    Object.keys(params).forEach(function(k) {
      url += '&' + encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
    });
  }

  // Attach admin token for authenticated requests
  var adminToken = sessionStorage.getItem('admin_token');
  if (adminToken) {
    url += '&token=' + encodeURIComponent(adminToken);
  }

  // Deduplicate: if this exact request is already in-flight, reuse it
  if (_inflightRequests[url]) {
    return _inflightRequests[url];
  }

  const promise = (async () => {
    try {
      const res = await fetch(url, { redirect: 'follow' });
      const text = await res.text();
      return JSON.parse(text);
    } catch (err) {
      console.error('API GET error:', action, err);
      return { error: err.message };
    } finally {
      delete _inflightRequests[url];
    }
  })();

  _inflightRequests[url] = promise;
  return promise;
}

async function apiPost(body) {
  try {
    // Attach admin token for authenticated requests
    var adminToken = sessionStorage.getItem('admin_token');
    if (adminToken) {
      body.token = adminToken;
    }

    const res = await fetch(API_URL, {
      method: 'POST',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body),
    });
    try {
      const text = await res.text();
      return JSON.parse(text);
    } catch (parseErr) {
      // GAS redirect may give unreadable response — assume success
      return { success: true };
    }
  } catch (err) {
    console.error('API POST error:', err);
    // Network error but POST may have still been processed
    return { success: true };
  }
}

// ─── Menu Functions ──────────────────────────────────────────

async function getMenu() {
  // Return cached data immediately, then refresh in background if stale
  const stored = loadMenuFromStorage();
  const isFresh = stored && (Date.now() - stored.ts) < MENU_CACHE_TTL;

  if (isFresh) {
    _menuCache = stored.data;
    return stored.data;
  }

  // Not fresh — fetch from API
  try {
    const result = await apiGet('getMenu');
    if (result && result.success && result.data && result.data.length > 0) {
      _menuCache = result.data;
      saveMenuToStorage(result.data);
      return result.data;
    }
  } catch (err) {
    console.warn('getMenu failed:', err);
  }
  return _menuCache;
}

// Fire-and-forget background menu refresh (doesn't block UI)
function refreshMenuInBackground() {
  apiGet('getMenu').then(result => {
    if (result && result.success && result.data && result.data.length > 0) {
      _menuCache = result.data;
      saveMenuToStorage(result.data);
    }
  }).catch(() => {});
}

async function toggleStock(itemId, inStock) {
  return await apiPost({ action: 'toggleStock', itemId: itemId, inStock: inStock });
}

// ─── Orders Functions ────────────────────────────────────────

async function getOrders() {
  try {
    const result = await apiGet('getOrders');
    if (result && result.success && result.data) {
      _ordersCache = result.data;
      return result.data;
    }
  } catch (err) {
    console.warn('getOrders failed:', err);
  }
  return _ordersCache;
}

async function saveOrder(order) {
  return await apiPost({ action: 'saveOrder', order: order });
}

async function updateOrder(orderId, status) {
  return await apiPost({ action: 'updateOrder', orderId: orderId, status: status });
}

async function getCompletedOrders() {
  try {
    const result = await apiGet('getCompletedOrders');
    if (result && result.success && result.data) return result.data;
  } catch (err) { console.warn('getCompletedOrders failed:', err); }
  return [];
}

async function getOrderStatus(orderId) {
  try {
    const result = await apiGet('getOrderStatus', { orderId: orderId });
    if (result && result.success) return result.status;
  } catch (err) { console.warn('getOrderStatus failed:', err); }
  return null;
}

async function getOrderStatusFull(orderId) {
  try {
    const result = await apiGet('getOrderStatus', { orderId: orderId });
    if (result && result.success) {
      return {
        status: result.status,
        cancelNote: result.cancelNote || '',
      };
    }
  } catch (err) { console.warn('getOrderStatusFull failed:', err); }
  return null;
}

async function declineOrder(orderId, note) {
  return await apiPost({ action: 'declineOrder', orderId: orderId, note: note || '' });
}

// ─── Promo Code Functions ────────────────────────────────────

async function validatePromoCode(code) {
  try {
    const result = await apiGet('validatePromo', { code: code });
    if (result && result.success && result.promo) {
      return result.promo;
    }
  } catch (err) {
    console.warn('validatePromo failed:', err);
  }
  return null;
}

// ─── Utility Functions ───────────────────────────────────────

function formatPrice(amount) {
  return amount.toLocaleString('ar-IQ') + ' د.ع';
}

function generateOrderId() {
  return 'ORD-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).substring(2, 10).toUpperCase();
}

function getTimeString(timestamp) {
  const d = new Date(timestamp);
  return d.toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' });
}

function getDateString(timestamp) {
  const d = new Date(timestamp);
  return d.toLocaleDateString('ar-IQ', { year: 'numeric', month: 'short', day: 'numeric' });
}

const PHONE_REGEX = /^07[578]\d{8}$/;
function validatePhone(phone) {
  return PHONE_REGEX.test(phone);
}

// ─── HTML Escape (XSS Prevention) ────────────────────────────
function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
