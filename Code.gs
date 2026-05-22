/* ============================================================
   Code.gs — Google Apps Script Backend for مطعم صاجي
   
   Instructions:
   1. Create a new Google Sheet manually
   2. Copy the Sheet ID from its URL (the long string between /d/ and /edit)
   3. Paste the ID below in SPREADSHEET_ID
   4. Go to https://script.google.com → New Project
   5. Paste this entire code into Code.gs
   6. Run initializeSheets() once (Run → initializeSheets)
   7. Deploy → New Deployment → Web App
      - Execute as: Me
      - Who has access: Anyone
   8. Copy the deployed URL and paste it into data.js
   ============================================================ */

// ─── Bound to Google Sheet (Extensions → Apps Script) ────────
// No need for a Sheet ID — the script is bound to the sheet

const SHEET_MENU = 'Menu';
const SHEET_ORDERS = 'Orders';
const SHEET_PROMO = 'PromoCodes';
const SHEET_PUSH = 'PushTokens';

// ══════════════════════════════════════════════════════════════
// Admin password is stored securely in Script Properties.
// To set it, run setAdminPassword('your_password') once from the editor.
// ══════════════════════════════════════════════════════════════
function getAdminPassword() {
  return PropertiesService.getScriptProperties().getProperty('admin_password') || '';
}
function setAdminPassword(pw) {
  PropertiesService.getScriptProperties().setProperty('admin_password', pw);
  Logger.log('✅ Admin password set successfully');
}
// ══════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════
// ⬇️  Firebase Project ID (from Firebase Console → Project Settings)  ⬇️
// ══════════════════════════════════════════════════════════════
const FCM_PROJECT_ID = 'saji-restaurant';
// ══════════════════════════════════════════════════════════════

function getSpreadsheet() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

// ─── Initialize Sheets (Run Once) ─────────────────────────────
function initializeSheets() {
  const ss = getSpreadsheet();
  
  // Menu Sheet
  let menuSheet = ss.getSheetByName(SHEET_MENU);
  if (!menuSheet) {
    menuSheet = ss.insertSheet(SHEET_MENU);
    menuSheet.appendRow(['id','name','description','category','price','image','inStock','addons']);
    
    const defaultMenu = [
      ['chicken_saj','صاجية دجاج','','الصاج',2500,'asstes/dishes_assets/chiecken_saj.png',true,'[]'],
      ['meat_saj','صاجية لحم','','الصاج',3000,'asstes/dishes_assets/meat_saj.png',true,'[]'],
      ['chicken_saj_plate','وجبة عربي صاج دجاج','','الصاج',3000,'asstes/dishes_assets/chicken_saj_plate.png',true,'[]'],
      ['meat_saj_plate','وجبة عربي صاج لحم','','الصاج',4000,'asstes/dishes_assets/meat_saj_plate.png',true,'[]'],
      ['saj_burger','صاج بركر','قطعة بركر لذيذة داخل خبز الصاج','الصاج',2500,'asstes/dishes_assets/saj_burger.png',true,'[]'],
      ['chicken_kass_wrap','لفة حجري كص دجاج','','الكص',2000,'asstes/dishes_assets/hajiri_chicken_kass.png',true,'[]'],
      ['chicken_kass_plate','طبق كص دجاج','','الكص',5000,'asstes/dishes_assets/chicken_kass_plate.png',true,'[]'],
      ['meat_kass_plate','طبق كص لحم','','الكص',6000,'asstes/dishes_assets/meat_kass_plate.png',true,'[]'],
      ['meat_burger','بركر لحم عراقي كلاسيك','','البركر',2500,'asstes/dishes_assets/meat_burger.png',true,'[]'],
      ['meat_burger_cheese','بركر لحم بالجبن','','البركر',3000,'asstes/dishes_assets/meat_burger_w_cheese.png',true,'[]'],
      ['kass_chicken_rizo','ريزو كص دجاج','','الريزو',3000,'asstes/dishes_assets/kass_chicken_rizo.png',true,'[]'],
      ['kass_meat_rizo','ريزو كص لحم','','الريزو',4000,'asstes/dishes_assets/kass_meat_rizo.png',true,'[]'],
      ['fries_small','قدح فنكر صغير','','الفنكر',1000,'asstes/dishes_assets/fries.png',true,'[]'],
      ['fries_cheese','فنكر بالجبن','','الفنكر',1500,'asstes/dishes_assets/fries_w_cheese.png',true,'[]'],
      ['fries_large','قدح فنكر كبير','','الفنكر',2000,'asstes/dishes_assets/fries_plate.png',true,'[]'],
      ['fries_large_cheese','قدح فنكر كبير بالجبن','','الفنكر',2500,'asstes/dishes_assets/fries_plate_w_cheese.jpg',true,'[]'],
      ['water','ماء','','المشاريب',250,'asstes/dishes_assets/wbottle.png',true,'[]'],
      ['cola','كولا','','المشاريب',500,'asstes/dishes_assets/cola.png',true,'[]'],
      ['grape_juice','عصير زبيب','','المشاريب',1000,'asstes/dishes_assets/brjuice.png',true,'[]'],
    ];
    defaultMenu.forEach(row => menuSheet.appendRow(row));
  }
  
  // Orders Sheet
  let ordersSheet = ss.getSheetByName(SHEET_ORDERS);
  if (!ordersSheet) {
    ordersSheet = ss.insertSheet(SHEET_ORDERS);
    ordersSheet.appendRow(['id','items','subtotal','deliveryFee','discount','promoCode','total','phone','address','name','status','timestamp','cancelNote']);
  }
  
  // PromoCodes Sheet
  let promoSheet = ss.getSheetByName(SHEET_PROMO);
  if (!promoSheet) {
    promoSheet = ss.insertSheet(SHEET_PROMO);
    promoSheet.appendRow(['code','type','value','active']);
    promoSheet.appendRow(['SAJI10','percent',10,true]);
    promoSheet.appendRow(['WELCOME','fixed',1000,true]);
  }
  
  Logger.log('✅ Sheets initialized! URL: ' + ss.getUrl());
}

function initializePushSheet() {
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_PUSH);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_PUSH);
    sheet.appendRow(['orderId', 'fcmToken', 'timestamp']);
  }
  Logger.log('✅ PushTokens sheet ready');
}

// ─── GET Handler ──────────────────────────────────────────────
function doGet(e) {
  let result;
  try {
    const action = e.parameter.action;
    switch(action) {
      case 'getMenu':     result = getMenuData(); break;
      case 'getOrders':   result = getOrdersData(); break;
      case 'getCompletedOrders': result = getCompletedOrdersData(); break;
      case 'getOrderStatus': result = getOrderStatusById(e.parameter.orderId); break;
      case 'getPromoCodes': result = getPromoCodesData(); break;
      case 'validatePromo': result = validatePromoCode(e.parameter.code); break;
      case 'adminLogin':  result = validateAdminLogin(e.parameter.pass); break;
      case 'getStatus':   result = getRestaurantStatus(); break;
      default: result = { error: 'Unknown action' };
    }
  } catch(err) {
    result = { error: err.message };
  }
  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

// ─── POST Handler ─────────────────────────────────────────────
function doPost(e) {
  let result;
  try {
    const data = JSON.parse(e.postData.contents);
    switch(data.action) {
      case 'saveOrder':   result = saveOrderData(data.order); break;
      case 'updateOrder': result = updateOrderStatus(data.orderId, data.status); break;
      case 'declineOrder': result = declineOrderWithNote(data.orderId, data.note); break;
      case 'savePushToken': result = savePushTokenData(data.orderId, data.fcmToken); break;
      case 'toggleStock': result = toggleItemStock(data.itemId, data.inStock); break;
      case 'setStatus':   result = setRestaurantStatus(data.isOpen); break;
      case 'clearCompleted': result = clearCompletedOrders(); break;
      default: result = { error: 'Unknown action' };
    }
  } catch(err) {
    result = { error: err.message };
  }
  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

// ─── Menu Functions ───────────────────────────────────────────
function getMenuData() {
  // Use GAS CacheService to avoid re-reading the sheet on every request
  var cache = CacheService.getScriptCache();
  var cached = cache.get('menu_data');
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch(e) {}
  }

  var sheet = getSpreadsheet().getSheetByName(SHEET_MENU);
  var rows = sheet.getDataRange().getValues();
  var menu = [];
  for (var i = 1; i < rows.length; i++) {
    menu.push({
      id: rows[i][0],
      name: rows[i][1],
      description: rows[i][2],
      category: rows[i][3],
      price: Number(rows[i][4]),
      image: rows[i][5],
      inStock: rows[i][6] === true || rows[i][6] === 'true' || rows[i][6] === 'TRUE',
      addons: JSON.parse(rows[i][7] || '[]'),
    });
  }
  var result = { success: true, data: menu };
  // Cache for 60 seconds — menu changes rarely
  try {
    cache.put('menu_data', JSON.stringify(result), 60);
  } catch(e) {}
  return result;
}

function toggleItemStock(itemId, inStock) {
  var sheet = getSpreadsheet().getSheetByName(SHEET_MENU);
  var rows = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (rows[i][0] === itemId) {
      sheet.getRange(i + 1, 7).setValue(inStock);
      // Invalidate cache so next getMenu picks up the change
      try { CacheService.getScriptCache().remove('menu_data'); } catch(e) {}
      return { success: true };
    }
  }
  return { error: 'Item not found' };
}

// ─── Orders Functions ─────────────────────────────────────────
function parseOrderRow(row) {
  return {
    id: row[0],
    items: JSON.parse(row[1] || '[]'),
    subtotal: Number(row[2]),
    deliveryFee: Number(row[3]),
    discount: Number(row[4]),
    promoCode: row[5],
    total: Number(row[6]),
    phone: String(row[7]),
    address: row[8],
    name: row[9],
    status: row[10],
    timestamp: Number(row[11]),
    cancelNote: row[12] || '',
  };
}

function getOrdersData() {
  var sheet = getSpreadsheet().getSheetByName(SHEET_ORDERS);
  var rows = sheet.getDataRange().getValues();
  var orders = [];
  for (var i = 1; i < rows.length; i++) {
    if (!rows[i][0]) continue;
    var status = rows[i][10];
    if (status === 'done' || status === 'cancelled') continue;
    orders.push(parseOrderRow(rows[i]));
  }
  orders.reverse();
  return { success: true, data: orders };
}

function getCompletedOrdersData() {
  var sheet = getSpreadsheet().getSheetByName(SHEET_ORDERS);
  var rows = sheet.getDataRange().getValues();
  var orders = [];
  for (var i = 1; i < rows.length; i++) {
    if (!rows[i][0]) continue;
    if (rows[i][10] !== 'done') continue;
    orders.push(parseOrderRow(rows[i]));
  }
  orders.reverse();
  return { success: true, data: orders };
}

function getOrderStatusById(orderId) {
  var sheet = getSpreadsheet().getSheetByName(SHEET_ORDERS);
  var rows = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (rows[i][0] === orderId) {
      return { success: true, status: rows[i][10], cancelNote: rows[i][12] || '' };
    }
  }
  return { success: false, status: 'not_found' };
}

function saveOrderData(order) {
  const sheet = getSpreadsheet().getSheetByName(SHEET_ORDERS);
  sheet.appendRow([
    order.id, JSON.stringify(order.items), order.subtotal, order.deliveryFee,
    order.discount, order.promoCode || '', order.total, order.phone,
    order.address, order.name || '', order.status, order.timestamp,
  ]);
  
  // Notify admin of new order
  sendPushToAdmin(
    '📥 طلب جديد!',
    'طلب #' + order.id + ' — ' + order.name + ' — ' + order.total + ' د.ع'
  );
  
  return { success: true, orderId: order.id };
}

function updateOrderStatus(orderId, newStatus) {
  const sheet = getSpreadsheet().getSheetByName(SHEET_ORDERS);
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === orderId) {
      sheet.getRange(i + 1, 11).setValue(newStatus);
      // Send push notification
      var msgs = {
        cooking: { title: '🔥 بدأ تحضير طلبك!', body: 'الطباخ بدأ بتحضير طلبك الآن' },
        delivery: { title: '🚗 طلبك في الطريق!', body: 'طلبك في طريقه إليك الآن' },
        done: { title: '✅ تم توصيل طلبك!', body: 'بالعافية! شكراً لاختيارك مطعم صاجي' },
      };
      if (msgs[newStatus]) {
        sendPushToOrder(orderId, msgs[newStatus].title, msgs[newStatus].body);
      }
      return { success: true };
    }
  }
  return { error: 'Order not found' };
}

function declineOrderWithNote(orderId, note) {
  const sheet = getSpreadsheet().getSheetByName(SHEET_ORDERS);
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === orderId) {
      sheet.getRange(i + 1, 11).setValue('cancelled');
      sheet.getRange(i + 1, 13).setValue(note || '');
      // Send push notification with cancel reason
      var body = note ? 'السبب: ' + note : 'تم إلغاء طلبك من قبل المطعم';
      sendPushToOrder(orderId, '❌ تم إلغاء طلبك', body);
      return { success: true };
    }
  }
  return { error: 'Order not found' };
}

function clearCompletedOrders() {
  var sheet = getSpreadsheet().getSheetByName(SHEET_ORDERS);
  var rows = sheet.getDataRange().getValues();
  var deleted = 0;
  // Delete from bottom to top to avoid index shifting
  for (var i = rows.length - 1; i >= 1; i--) {
    if (rows[i][10] === 'done') {
      sheet.deleteRow(i + 1);
      deleted++;
    }
  }
  return { success: true, deleted: deleted };
}

// ─── Promo Code Functions ─────────────────────────────────────
function getPromoCodesData() {
  const sheet = getSpreadsheet().getSheetByName(SHEET_PROMO);
  const rows = sheet.getDataRange().getValues();
  const codes = [];
  for (let i = 1; i < rows.length; i++) {
    codes.push({
      code: rows[i][0], type: rows[i][1],
      value: Number(rows[i][2]),
      active: rows[i][3] === true || rows[i][3] === 'true' || rows[i][3] === 'TRUE',
    });
  }
  return { success: true, data: codes };
}

function validatePromoCode(code) {
  const sheet = getSpreadsheet().getSheetByName(SHEET_PROMO);
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]).toUpperCase() === code.toUpperCase()) {
      const isActive = rows[i][3] === true || rows[i][3] === 'true' || rows[i][3] === 'TRUE';
      if (isActive) {
        return { success: true, promo: { code: rows[i][0], type: rows[i][1], value: Number(rows[i][2]), active: true } };
      }
    }
  }
  return { success: false, promo: null };
}

// ─── Admin Login ──────────────────────────────────────────────
function validateAdminLogin(password) {
  if (password === getAdminPassword()) {
    return { success: true, token: Utilities.getUuid() };
  }
  return { success: false };
}

// ─── Restaurant Status ────────────────────────────────────────
function getRestaurantStatus() {
  var props = PropertiesService.getScriptProperties();
  var isOpen = props.getProperty('restaurant_open');
  return { success: true, isOpen: isOpen !== 'false' };
}

function setRestaurantStatus(isOpen) {
  var props = PropertiesService.getScriptProperties();
  props.setProperty('restaurant_open', isOpen ? 'true' : 'false');
  return { success: true, isOpen: isOpen };
}

// ─── Push Notification Functions ──────────────────────────────
function savePushTokenData(orderId, fcmToken) {
  if (!orderId || !fcmToken) return { error: 'Missing data' };
  
  // Create PushTokens sheet if it doesn't exist
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_PUSH);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_PUSH);
    sheet.appendRow(['orderId', 'fcmToken', 'timestamp']);
  }
  
  // Check if token already exists for this order, update it
  var rows = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (rows[i][0] === orderId) {
      sheet.getRange(i + 1, 2).setValue(fcmToken);
      sheet.getRange(i + 1, 3).setValue(Date.now());
      return { success: true };
    }
  }
  
  // New entry
  sheet.appendRow([orderId, fcmToken, Date.now()]);
  return { success: true };
}

function sendPushToOrder(orderId, title, body) {
  try {
    if (!FCM_PROJECT_ID || FCM_PROJECT_ID === 'YOUR_PROJECT_ID') return;
    
    var ss = getSpreadsheet();
    var sheet = ss.getSheetByName(SHEET_PUSH);
    if (!sheet) return;
    
    var rows = sheet.getDataRange().getValues();
    for (var i = 1; i < rows.length; i++) {
      if (rows[i][0] === orderId && rows[i][1]) {
        sendFCMPush(rows[i][1], title, body);
        return;
      }
    }
  } catch (err) {
    Logger.log('Push notification error: ' + err.message);
  }
}

function sendPushToAdmin(title, body) {
  try {
    if (!FCM_PROJECT_ID || FCM_PROJECT_ID === 'YOUR_PROJECT_ID') return;
    
    var ss = getSpreadsheet();
    var sheet = ss.getSheetByName(SHEET_PUSH);
    if (!sheet) return;
    
    var rows = sheet.getDataRange().getValues();
    for (var i = 1; i < rows.length; i++) {
      if (rows[i][0] === 'ADMIN' && rows[i][1]) {
        sendFCMPush(rows[i][1], title, body);
      }
    }
  } catch (err) {
    Logger.log('Admin push error: ' + err.message);
  }
}

function sendFCMPush(fcmToken, title, body) {
  try {
    var message = {
      message: {
        token: fcmToken,
        notification: {
          title: title,
          body: body,
        },
        webpush: {
          notification: {
            icon: 'asstes/saji_app_logo.png',
            vibrate: [200, 100, 200],
          },
        },
      },
    };
    
    var accessToken = ScriptApp.getOAuthToken();
    
    UrlFetchApp.fetch(
      'https://fcm.googleapis.com/v1/projects/' + FCM_PROJECT_ID + '/messages:send',
      {
        method: 'post',
        contentType: 'application/json',
        headers: {
          'Authorization': 'Bearer ' + accessToken,
        },
        payload: JSON.stringify(message),
        muteHttpExceptions: true,
      }
    );
  } catch (err) {
    Logger.log('FCM v1 send error: ' + err.message);
  }
}
