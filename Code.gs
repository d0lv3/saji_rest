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

// ══════════════════════════════════════════════════════════════
// ⬇️  كلمة مرور لوحة التحكم — غيّرها لكلمة مرورك  ⬇️
// ══════════════════════════════════════════════════════════════
const ADMIN_PASSWORD = 'mustafa0520';
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
      ['chicken_saj','صاجية دجاج','صاجية دجاج طازجة','الصاج',2500,'asstes/dishes_assets/chiecken_saj.png',true,'[]'],
      ['meat_saj','صاجية لحم','صاجية لحم طازجة','الصاج',3500,'asstes/dishes_assets/meat_saj.png',true,'[]'],
      ['chicken_saj_plate','وجبة عربي صاج دجاج','وجبة عربي صاج دجاج مع مخللات','الصاج',3000,'asstes/dishes_assets/chicken_saj_plate.png',true,'[]'],
      ['meat_saj_plate','وجبة عربي صاج لحم','وجبة عربي صاج لحم مع مخللات','الصاج',4000,'asstes/dishes_assets/meat_saj_plate.png',true,'[]'],
      ['saj_burger','صاج بركر','صاج بركر مميز','الصاج',2500,'asstes/dishes_assets/saj_burger.png',true,'[]'],
      ['chicken_kass_wrap','لفة حجري كص دجاج','لفة حجري كص دجاج','الكص',2000,'asstes/dishes_assets/hajiri_chicken_kass.png',true,'[]'],
      ['chicken_kass_plate','طبق كص دجاج','طبق كص دجاج مع أرز ومخللات','الكص',5000,'asstes/dishes_assets/chicken_kass_plate.png',true,'[]'],
      ['meat_kass_plate','طبق كص لحم','طبق كص لحم مع أرز ومخللات','الكص',6000,'asstes/dishes_assets/meat_kass_plate.png',true,'[]'],
      ['meat_burger','بركر لحم عراقي كلاسيك','بركر لحم عراقي كلاسيكي','البركر',2500,'asstes/dishes_assets/meat_burger.png',true,'[]'],
      ['meat_burger_cheese','بركر لحم بالجبن','بركر لحم مع جبن','البركر',3000,'asstes/dishes_assets/meat_burger_w_cheese.png',true,'[]'],
      ['kass_chicken_rizo','ريزو كص دجاج','ريزو كص دجاج','الريزو',3000,'asstes/dishes_assets/kass_chicken_rizo.png',true,'[]'],
      ['kass_meat_rizo','ريزو كص لحم','ريزو كص لحم','الريزو',4000,'asstes/dishes_assets/kass_meat_rizo.png',true,'[]'],
      ['fries_small','قدح فنكر صغير','قدح فنكر صغير','الفنكر',1000,'asstes/dishes_assets/fries.png',true,'[]'],
      ['fries_cheese','فنكر بالجبن','فنكر بالجبن','الفنكر',1500,'asstes/dishes_assets/fries_w_cheese.png',true,'[]'],
      ['fries_large','قدح فنكر كبير','قدح فنكر كبير','الفنكر',2000,'asstes/dishes_assets/fries_plate.png',true,'[]'],
      ['fries_large_cheese','قدح فنكر كبير بالجبن','قدح فنكر كبير بالجبن','الفنكر',2500,'asstes/dishes_assets/fries_plate_w_cheese.jpg',true,'[]'],
      ['water','ماء','مياه معدنية','المشاريب',250,'asstes/dishes_assets/wbottle.png',true,'[]'],
      ['cola','كولا','مشروب غازي بارد','المشاريب',500,'asstes/dishes_assets/cola.png',true,'[]'],
      ['grape_juice','عصير زبيب','عصير زبيب طبيعي','المشاريب',1000,'asstes/dishes_assets/brjuice.png',true,'[]'],
    ];
    defaultMenu.forEach(row => menuSheet.appendRow(row));
  }
  
  // Orders Sheet
  let ordersSheet = ss.getSheetByName(SHEET_ORDERS);
  if (!ordersSheet) {
    ordersSheet = ss.insertSheet(SHEET_ORDERS);
    ordersSheet.appendRow(['id','items','subtotal','deliveryFee','discount','promoCode','total','phone','address','name','status','timestamp']);
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
  };
}

function getOrdersData() {
  var sheet = getSpreadsheet().getSheetByName(SHEET_ORDERS);
  var rows = sheet.getDataRange().getValues();
  var orders = [];
  for (var i = 1; i < rows.length; i++) {
    if (!rows[i][0]) continue;
    var status = rows[i][10];
    if (status === 'done') continue;
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
      return { success: true, status: rows[i][10] };
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
  return { success: true, orderId: order.id };
}

function updateOrderStatus(orderId, newStatus) {
  const sheet = getSpreadsheet().getSheetByName(SHEET_ORDERS);
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === orderId) {
      sheet.getRange(i + 1, 11).setValue(newStatus);
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
  if (password === ADMIN_PASSWORD) {
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
