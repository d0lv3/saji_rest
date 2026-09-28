# مطعم صاجي — Saji Restaurant

Online ordering for Saji restaurant: an installable (PWA) Arabic customer menu with cart,
checkout (cash on delivery) and live order tracking, plus an admin dashboard for orders,
menu, categories and time-limited offers.

Static HTML/CSS/JS with no build step, hosted on Vercel. Backend is Supabase (Postgres,
Auth, Realtime, Storage, one Edge Function). Push notifications go through Firebase Cloud
Messaging.

## Structure

| Path | What it is |
|---|---|
| `index.html`, `app.js`, `style.css` | Customer app: menu, cart, promo codes, checkout, order tracking |
| `admin.html`, `admin.js`, `admin.css` | Admin dashboard: order board, completed orders + stats, menu & category editor, offers, open/closed switch |
| `data.js` | Shared data layer: every Supabase call, Firebase messaging, config |
| `sw.js` | Service worker: network-first cache + background push notifications |
| `supabase/functions/send-notification/` | Edge Function that sends FCM pushes (new order → admin, status change → customer) |
| `sql/` | Database schema and migrations, numbered in the order they must run |
| `assets/` | Logos and menu photos |
| `marketing/` | "How to install the app" pages for iOS / Android |
| `vercel.json` | Keeps old `/asstes/*` image URLs working after the folder rename |
| `Code.gs` | Legacy Google Sheets backend — no longer used |

## How orders stay safe

- Customers never read or write the `orders` tables directly. `create_order()` looks up
  every price server-side, checks the restaurant is open, validates the phone number and
  rate-limits each number to 5 orders per 10 minutes. It returns a secret `access_token`.
- The customer tracks their order with that token: `get_order_status()` for lookups, plus a
  Realtime broadcast on the topic `order-<access_token>` sent by a database trigger.
- Only the signed-in admin can read or change orders. Email sign-ups must stay disabled
  in Supabase Auth, because any signed-in user is treated as the admin.
- The notification function only sends a "new order" alert once per order, right after
  it's placed, and only sends status updates when called by the signed-in admin.
- Promo codes can't be listed. The cart checks one code at a time with
  `check_promo_code()`, and `create_order()` applies the discount server-side. Manage codes
  in the Supabase Table Editor.

## Setting up from scratch

1. Create a Supabase project. Disable email sign-ups (Authentication → Providers → Email)
   and create the admin user by hand (Authentication → Users → Add user).
2. In the SQL Editor, run every file in `sql/` in order: `01` → `09`.
3. Put the project URL and anon key in `data.js`, and the Firebase web config in `data.js`
   and `sw.js`.
4. Deploy the Edge Function with a Firebase service account:
   ```bash
   supabase secrets set FIREBASE_SERVICE_ACCOUNT="$(cat firebase-service-account.json)"
   supabase functions deploy send-notification
   ```
5. Deploy the site folder (Vercel, or any static host that serves `index.html` at `/`).

## Rolling out the security update (existing project)

`01`–`07` were applied on the live project on 2026-09-28, in the order below. `08` and
`09` (promo codes) follow the same pattern: run `08`, deploy the site, then run `09`.

The order matters so the live site never breaks:

1. **SQL Editor:** run `sql/04_order_hardening.sql` and `sql/05_menu_management.sql`.
   These only add things, so the currently deployed site keeps working.
2. **Edge Function:** `supabase functions deploy send-notification`
3. **Site:** deploy the new code (push to the branch Vercel deploys).
4. **SQL Editor:** run `sql/06_lock_down_orders.sql` (removes public access to orders)
   and `sql/07_rename_assets_paths.sql` (points menu images at `assets/`).
5. Place a test order from a phone: the admin should get the alert and the customer's
   tracking screen should move when you change the status.

Customers who still have the old page open can keep ordering until they reload. After
step 4, though, their tracking screen stops updating live and their new orders don't get
push notifications. The service worker is network-first, so a reload picks up the new code.

## Notes

- Images uploaded from the admin menu editor go to the public `menu-images` storage
  bucket. Images typed as a path (e.g. `assets/dishes_assets/x.png`) must exist in this repo.
- Categories live in `settings` → `categories` as `[{name, icon}]`. Items whose category
  isn't in that list don't show in the menu grid.
- Special offers are created in the admin **Offers** tab. There are no hard-coded offer
  banners anymore.
