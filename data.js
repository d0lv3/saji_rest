/* ============================================================
   data.js — Shared Data Layer for مطعم صاجي
   Uses Supabase as backend with real-time subscriptions
   Performance-optimized with localStorage caching
   ============================================================ */

// ══════════════════════════════════════════════════════════════
// ⬇️  PASTE YOUR SUPABASE CONFIG HERE  ⬇️
// ══════════════════════════════════════════════════════════════
const SUPABASE_URL = 'https://ykqcqyycvpxnhroxdgmc.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlrcWNxeXljdnB4bmhyb3hkZ21jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyMzQ4NzIsImV4cCI6MjA5NTgxMDg3Mn0.eo96egK7kkyjqIkknEXln7opbqmEmO9rRLAENI7Y-w4';
const ADMIN_EMAIL = 'admin@saji.restaurant';
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
const FCM_VAPID_KEY = 'BIFqdoOVACa4TfSz5_SqREK0ustN24abyuoo9VmsvmA3LcOJG7YW13ra86wwPp1v2SQLV2_Gc0YCTRegQPHHTsU';
// ══════════════════════════════════════════════════════════════

// ─── Supabase Client ────────────────────────────────────────
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    storage: sessionStorage,
  },
});

// ─── Firebase Messaging Setup ────────────────────────────────
let _fcmToken = null;

async function initFirebaseMessaging() {
  try {
    if (typeof firebase === 'undefined' || !firebase.messaging) {
      console.warn('Firebase SDK not loaded');
      return null;
    }

    firebase.initializeApp(FIREBASE_CONFIG);
    const messaging = firebase.messaging();

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.warn('Notification permission denied');
      return null;
    }

    const swReg = await navigator.serviceWorker.ready;

    _fcmToken = await messaging.getToken({
      vapidKey: FCM_VAPID_KEY,
      serviceWorkerRegistration: swReg,
    });
    console.debug('FCM token obtained');

    messaging.onMessage((payload) => {
      const title = payload.notification?.title || 'مطعم صاجي';
      const body = payload.notification?.body || '';
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
  const { error } = await _supabase
    .from('push_tokens')
    .insert({ order_id: orderId, fcm_token: token });
  return { success: !error };
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

// ─── Fallback Menu ──────────────────────────────────────────
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
const MENU_STORAGE_KEY = 'saji_menu_cache';
const MENU_CACHE_TTL = 60 * 1000;

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

(function () {
  const stored = loadMenuFromStorage();
  if (stored && stored.data) {
    _menuCache = stored.data;
  }
})();

// ─── Data Transform Helpers ─────────────────────────────────

function transformMenuItem(row) {
  return {
    id: row.id,
    name: row.name,
    description: row.description || '',
    category: row.category,
    price: row.price,
    image: row.image || '',
    inStock: row.in_stock,
    addons: row.addons || [],
  };
}

function transformOrder(row) {
  return {
    id: row.id,
    phone: row.phone,
    address: row.address,
    name: row.customer_name,
    items: (row.order_items || []).map(function (item) {
      return {
        name: item.item_name,
        qty: item.qty,
        unitPrice: item.unit_price,
        addons: item.addons || [],
        notes: item.notes || '',
      };
    }),
    subtotal: row.subtotal,
    deliveryFee: row.delivery_fee,
    discount: row.discount,
    total: row.total,
    status: row.status,
    timestamp: new Date(row.created_at).getTime(),
  };
}

// ─── Menu Functions ──────────────────────────────────────────

async function getMenu() {
  const stored = loadMenuFromStorage();
  const isFresh = stored && (Date.now() - stored.ts) < MENU_CACHE_TTL;

  if (isFresh) {
    _menuCache = stored.data;
    return stored.data;
  }

  try {
    const { data, error } = await _supabase
      .from('menu_items')
      .select('*')
      .order('sort_order', { ascending: true });

    if (!error && data && data.length > 0) {
      const menu = data.map(transformMenuItem);
      _menuCache = menu;
      saveMenuToStorage(menu);
      return menu;
    }
  } catch (err) {
    console.warn('getMenu failed:', err);
  }
  return _menuCache;
}

async function toggleStock(itemId, inStock) {
  const { error } = await _supabase
    .from('menu_items')
    .update({ in_stock: inStock })
    .eq('id', itemId);
  return { success: !error };
}

// ─── Orders Functions ────────────────────────────────────────

async function getOrders() {
  try {
    const { data, error } = await _supabase
      .from('orders')
      .select('*, order_items(*)')
      .in('status', ['pending', 'cooking', 'delivery'])
      .order('created_at', { ascending: true });

    if (!error && data) {
      const orders = data.map(transformOrder);
      _ordersCache = orders;
      return orders;
    }
  } catch (err) {
    console.warn('getOrders failed:', err);
  }
  return _ordersCache;
}

async function saveOrder(order) {
  try {
    const { error: orderError } = await _supabase
      .from('orders')
      .insert({
        id: order.id,
        customer_name: order.name || '',
        phone: order.phone,
        address: order.address,
        status: 'pending',
        subtotal: order.subtotal,
        delivery_fee: order.deliveryFee,
        discount: order.discount,
        promo_code: order.promoCode || null,
        total: order.total,
      });

    if (orderError) {
      console.error('saveOrder failed:', orderError);
      return { success: false };
    }

    const items = order.items.map(function (item) {
      return {
        order_id: order.id,
        item_name: item.name,
        qty: item.qty,
        unit_price: item.unitPrice,
        addons: item.addons || [],
        notes: item.notes || '',
      };
    });

    const { error: itemsError } = await _supabase
      .from('order_items')
      .insert(items);

    if (itemsError) {
      console.error('saveOrder items failed:', itemsError);
    }

    return { success: true };
  } catch (err) {
    console.error('saveOrder exception:', err);
    return { success: false };
  }
}

async function updateOrder(orderId, status) {
  const { error } = await _supabase
    .from('orders')
    .update({ status: status })
    .eq('id', orderId);
  return { success: !error };
}

async function getCompletedOrders() {
  try {
    const { data, error } = await _supabase
      .from('orders')
      .select('*, order_items(*)')
      .in('status', ['done', 'cancelled'])
      .order('created_at', { ascending: false });

    if (!error && data) {
      return data.map(transformOrder);
    }
  } catch (err) {
    console.warn('getCompletedOrders failed:', err);
  }
  return [];
}

async function getOrderStatus(orderId) {
  try {
    const { data, error } = await _supabase
      .from('orders')
      .select('status')
      .eq('id', orderId)
      .single();

    if (!error && data) return data.status;
  } catch (err) {
    console.warn('getOrderStatus failed:', err);
  }
  return null;
}

async function getOrderStatusFull(orderId) {
  try {
    const { data, error } = await _supabase
      .from('orders')
      .select('status, cancel_note')
      .eq('id', orderId)
      .single();

    if (!error && data) {
      return {
        status: data.status,
        cancelNote: data.cancel_note || '',
      };
    }
  } catch (err) {
    console.warn('getOrderStatusFull failed:', err);
  }
  return { status: 'not_found' };
}

async function declineOrder(orderId, note) {
  const { error } = await _supabase
    .from('orders')
    .update({ status: 'cancelled', cancel_note: note || '' })
    .eq('id', orderId);
  return { success: !error };
}

async function clearCompletedOrders() {
  const { error } = await _supabase
    .from('orders')
    .delete()
    .in('status', ['done', 'cancelled']);
  return { success: !error };
}

// ─── Promo Code Functions ────────────────────────────────────

async function validatePromoCode(code) {
  try {
    const { data, error } = await _supabase
      .from('promo_codes')
      .select('code, type, value')
      .eq('code', code)
      .eq('active', true)
      .single();

    if (!error && data) {
      return { code: data.code, type: data.type, value: data.value };
    }
  } catch (err) {
    console.warn('validatePromo failed:', err);
  }
  return null;
}

// ─── Restaurant Status ──────────────────────────────────────

async function getRestaurantStatus() {
  try {
    const { data, error } = await _supabase
      .from('settings')
      .select('value')
      .eq('key', 'restaurant_status')
      .single();

    if (!error && data) {
      return { success: true, isOpen: data.value.isOpen };
    }
  } catch (err) {
    console.warn('getRestaurantStatus failed:', err);
  }
  return { success: true, isOpen: true };
}

async function setRestaurantStatus(isOpen) {
  const { error } = await _supabase
    .from('settings')
    .update({ value: { isOpen: isOpen } })
    .eq('key', 'restaurant_status');
  return { success: !error };
}

// ─── Admin Authentication ───────────────────────────────────

async function adminLogin(password) {
  try {
    const { data, error } = await _supabase.auth.signInWithPassword({
      email: ADMIN_EMAIL,
      password: password,
    });

    if (error) {
      console.warn('Admin login failed:', error.message);
      return { success: false };
    }

    return { success: true };
  } catch (err) {
    console.warn('Admin login exception:', err);
    return { success: false };
  }
}

async function adminLogout() {
  await _supabase.auth.signOut();
}

async function isAdminLoggedIn() {
  const { data } = await _supabase.auth.getSession();
  return !!(data && data.session);
}

// ─── Realtime Subscriptions ─────────────────────────────────

let _orderChannel = null;
let _ordersChannel = null;
let _menuChannel = null;

function subscribeToOrder(orderId, callback) {
  unsubscribeFromOrder();
  _orderChannel = _supabase
    .channel('order-tracking-' + orderId)
    .on('postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'orders', filter: 'id=eq.' + orderId },
      function (payload) {
        if (payload.new) {
          callback({
            status: payload.new.status,
            cancelNote: payload.new.cancel_note || '',
          });
        }
      }
    )
    .subscribe();
}

function unsubscribeFromOrder() {
  if (_orderChannel) {
    _supabase.removeChannel(_orderChannel);
    _orderChannel = null;
  }
}

function subscribeToOrders(callback) {
  unsubscribeFromOrders();
  _ordersChannel = _supabase
    .channel('admin-orders')
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'orders' },
      function () {
        callback();
      }
    )
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'order_items' },
      function () {
        callback();
      }
    )
    .subscribe();
}

function unsubscribeFromOrders() {
  if (_ordersChannel) {
    _supabase.removeChannel(_ordersChannel);
    _ordersChannel = null;
  }
}

function subscribeToMenu(callback) {
  if (_menuChannel) {
    _supabase.removeChannel(_menuChannel);
  }
  _menuChannel = _supabase
    .channel('menu-updates')
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'menu_items' },
      function () {
        callback();
      }
    )
    .subscribe();
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

function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
