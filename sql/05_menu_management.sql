-- ═══════════════════════════════════════════════════════════════
-- 05_menu_management.sql — run BEFORE deploying the new site code
--
-- Additive. Supports the admin menu editor:
--   1. "menu-images" storage bucket for uploaded item photos
--      (public read, only signed-in admins can upload/replace/delete)
--   2. Category list in settings (display order + emoji). The site
--      falls back to the same built-in list if this row is missing.
-- ═══════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────
-- 1. Storage bucket for menu item images (max 5 MB, images only)
-- ───────────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'menu-images',
  'menu-images',
  true,
  5242880,
  ARRAY['image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Admin can read menu images"   ON storage.objects;
DROP POLICY IF EXISTS "Admin can upload menu images" ON storage.objects;
DROP POLICY IF EXISTS "Admin can update menu images" ON storage.objects;
DROP POLICY IF EXISTS "Admin can delete menu images" ON storage.objects;

-- Public URLs work without a policy; this is for the admin's API calls
CREATE POLICY "Admin can read menu images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'menu-images' AND auth.uid() IS NOT NULL);
CREATE POLICY "Admin can upload menu images"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'menu-images' AND auth.uid() IS NOT NULL);
CREATE POLICY "Admin can update menu images"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'menu-images' AND auth.uid() IS NOT NULL);
CREATE POLICY "Admin can delete menu images"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'menu-images' AND auth.uid() IS NOT NULL);

-- ───────────────────────────────────────────────────────────────
-- 2. Category list (same as the list that used to be hard-coded)
-- ───────────────────────────────────────────────────────────────
INSERT INTO settings (key, value) VALUES
  ('categories', '[
    {"name": "الصاج",    "icon": "🫓"},
    {"name": "الكص",     "icon": "🌯"},
    {"name": "البركر",   "icon": "🍔"},
    {"name": "الريزو",   "icon": "🍚"},
    {"name": "الفنكر",   "icon": "🍟"},
    {"name": "المشاريب", "icon": "🥤"}
  ]'::jsonb)
ON CONFLICT (key) DO NOTHING;
