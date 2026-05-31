-- ============================================================
-- Supabase Schema for مطعم صاجي (Saji Restaurant)
--
-- HOW TO USE:
-- 1. Create a Supabase project at https://supabase.com
-- 2. Go to SQL Editor in your Supabase dashboard
-- 3. Paste this entire file and click "Run"
-- 4. Create admin user: go to Authentication → Users → Add User
--    Email: admin@saji.restaurant  Password: (your admin password)
-- 5. Copy your project URL and anon key from Settings → API
--    and paste them into data.js
-- ============================================================

-- ─── Tables ─────────────────────────────────────────────────

CREATE TABLE menu_items (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  category TEXT NOT NULL,
  price INTEGER NOT NULL,
  image TEXT DEFAULT '',
  in_stock BOOLEAN DEFAULT true,
  addons JSONB DEFAULT '[]'::jsonb,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE orders (
  id TEXT PRIMARY KEY,
  customer_name TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL,
  address TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'cooking', 'delivery', 'done', 'cancelled')),
  subtotal INTEGER NOT NULL,
  delivery_fee INTEGER DEFAULT 0,
  discount INTEGER DEFAULT 0,
  promo_code TEXT,
  total INTEGER NOT NULL,
  cancel_note TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE order_items (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  item_name TEXT NOT NULL,
  qty INTEGER NOT NULL DEFAULT 1,
  unit_price INTEGER NOT NULL,
  addons TEXT[] DEFAULT '{}',
  notes TEXT DEFAULT ''
);

CREATE TABLE promo_codes (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('percent', 'fixed')),
  value INTEGER NOT NULL,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL
);

CREATE TABLE push_tokens (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id TEXT NOT NULL,
  fcm_token TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ─── Indexes ────────────────────────────────────────────────

CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_created_at ON orders(created_at DESC);
CREATE INDEX idx_order_items_order_id ON order_items(order_id);
CREATE INDEX idx_menu_items_category ON menu_items(category);
CREATE INDEX idx_push_tokens_order_id ON push_tokens(order_id);

-- ─── Auto-update updated_at on orders ───────────────────────

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ─── Row Level Security ─────────────────────────────────────

ALTER TABLE menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE promo_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY;

-- menu_items: anyone reads, authenticated admin writes
CREATE POLICY "Anyone can read menu"
  ON menu_items FOR SELECT USING (true);
CREATE POLICY "Admin can insert menu"
  ON menu_items FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Admin can update menu"
  ON menu_items FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "Admin can delete menu"
  ON menu_items FOR DELETE USING (auth.uid() IS NOT NULL);

-- orders: anyone creates/reads, admin updates/deletes
CREATE POLICY "Anyone can create orders"
  ON orders FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can read orders"
  ON orders FOR SELECT USING (true);
CREATE POLICY "Admin can update orders"
  ON orders FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "Admin can delete orders"
  ON orders FOR DELETE USING (auth.uid() IS NOT NULL);

-- order_items: anyone creates/reads, admin manages
CREATE POLICY "Anyone can create order items"
  ON order_items FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can read order items"
  ON order_items FOR SELECT USING (true);
CREATE POLICY "Admin can update order items"
  ON order_items FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "Admin can delete order items"
  ON order_items FOR DELETE USING (auth.uid() IS NOT NULL);

-- promo_codes: anyone reads, admin manages
CREATE POLICY "Anyone can read promos"
  ON promo_codes FOR SELECT USING (true);
CREATE POLICY "Admin can insert promos"
  ON promo_codes FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Admin can update promos"
  ON promo_codes FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "Admin can delete promos"
  ON promo_codes FOR DELETE USING (auth.uid() IS NOT NULL);

-- settings: anyone reads, admin writes
CREATE POLICY "Anyone can read settings"
  ON settings FOR SELECT USING (true);
CREATE POLICY "Admin can insert settings"
  ON settings FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Admin can update settings"
  ON settings FOR UPDATE USING (auth.uid() IS NOT NULL);

-- push_tokens: anyone creates, admin reads
CREATE POLICY "Anyone can save tokens"
  ON push_tokens FOR INSERT WITH CHECK (true);
CREATE POLICY "Admin can read tokens"
  ON push_tokens FOR SELECT USING (auth.uid() IS NOT NULL);

-- ─── Enable Realtime ────────────────────────────────────────

ALTER PUBLICATION supabase_realtime ADD TABLE orders;
ALTER PUBLICATION supabase_realtime ADD TABLE menu_items;

-- ─── Seed Data: Settings ────────────────────────────────────

INSERT INTO settings (key, value) VALUES
  ('restaurant_status', '{"isOpen": true}'::jsonb);

-- ─── Seed Data: Menu Items ──────────────────────────────────

INSERT INTO menu_items (id, name, description, category, price, image, in_stock, addons, sort_order) VALUES
  ('chicken_saj',       'صاجية دجاج',             'صاجية دجاج طازجة',                  'الصاج',    2500, 'asstes/dishes_assets/chiecken_saj.png',       true, '[]', 1),
  ('meat_saj',          'صاجية لحم',              'صاجية لحم طازجة',                   'الصاج',    3500, 'asstes/dishes_assets/meat_saj.png',            true, '[]', 2),
  ('chicken_saj_plate', 'وجبة عربي صاج دجاج',     'وجبة عربي صاج دجاج مع مخللات',       'الصاج',    3000, 'asstes/dishes_assets/chicken_saj_plate.png',   true, '[]', 3),
  ('meat_saj_plate',    'وجبة عربي صاج لحم',      'وجبة عربي صاج لحم مع مخللات',        'الصاج',    4000, 'asstes/dishes_assets/meat_saj_plate.png',      true, '[]', 4),
  ('saj_burger',        'صاج بركر',               'صاج بركر مميز',                     'الصاج',    2500, 'asstes/dishes_assets/saj_burger.png',          true, '[]', 5),
  ('chicken_kass_wrap', 'لفة حجري كص دجاج',       'لفة حجري كص دجاج',                  'الكص',     2000, 'asstes/dishes_assets/hajiri_chicken_kass.png', true, '[]', 6),
  ('meat_kass_wrap',    'لفة حجري كص لحم',        'لفة حجري كص لحم',                   'الكص',     3000, 'asstes/dishes_assets/hajiri_meat_kass.png',    true, '[]', 7),
  ('chicken_kass_plate','طبق كص دجاج',            'طبق كص دجاج مع أرز ومخللات',         'الكص',     5000, 'asstes/dishes_assets/chicken_kass_plate.png',  true, '[]', 8),
  ('meat_kass_plate',   'طبق كص لحم',             'طبق كص لحم مع أرز ومخللات',          'الكص',     6000, 'asstes/dishes_assets/meat_kass_plate.png',     true, '[]', 9),
  ('meat_burger',       'بركر لحم عراقي كلاسيك',   'بركر لحم عراقي كلاسيكي',             'البركر',   2500, 'asstes/dishes_assets/meat_burger.png',         true, '[]', 10),
  ('meat_burger_cheese','بركر لحم بالجبن',         'بركر لحم مع جبن',                   'البركر',   3000, 'asstes/dishes_assets/meat_burger_w_cheese.png',true, '[]', 11),
  ('kass_chicken_rizo', 'ريزو كص دجاج',           'ريزو كص دجاج',                      'الريزو',   3000, 'asstes/dishes_assets/kass_chicken_rizo.png',   true, '[]', 12),
  ('kass_meat_rizo',    'ريزو كص لحم',            'ريزو كص لحم',                       'الريزو',   4000, 'asstes/dishes_assets/kass_meat_rizo.png',      true, '[]', 13),
  ('fries_small',       'قدح فنكر صغير',          'قدح فنكر صغير',                     'الفنكر',   1000, 'asstes/dishes_assets/fries.png',               true, '[]', 14),
  ('fries_cheese',      'فنكر بالجبن',            'فنكر بالجبن',                       'الفنكر',   1500, 'asstes/dishes_assets/fries_w_cheese.png',      true, '[]', 15),
  ('fries_large',       'قدح فنكر كبير',          'قدح فنكر كبير',                     'الفنكر',   2000, 'asstes/dishes_assets/fries_plate.png',         true, '[]', 16),
  ('fries_large_cheese','قدح فنكر كبير بالجبن',    'قدح فنكر كبير بالجبن',               'الفنكر',   2500, 'asstes/dishes_assets/fries_plate_w_cheese.jpg',true, '[]', 17),
  ('water',             'ماء',                    'مياه معدنية',                       'المشاريب', 250,  'asstes/dishes_assets/wbottle.png',             true, '[]', 18),
  ('pepsi',             'بيبسي',                  'مشروب غازي بارد',                   'المشاريب', 500,  'asstes/dishes_assets/pepsi.png',               true, '[]', 19),
  ('grape_juice',       'عصير زبيب',              'عصير زبيب طبيعي',                   'المشاريب', 500,  'asstes/dishes_assets/brjuice.png',             true, '[]', 20);
