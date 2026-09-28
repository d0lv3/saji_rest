-- ═══════════════════════════════════════════════════════════════
-- 07_rename_assets_paths.sql — run AFTER the new site code is deployed
--
-- The image folder was renamed from "asstes/" to "assets/". This points
-- the menu images stored in the database at the new folder.
-- (vercel.json also rewrites old /asstes/* URLs, so running this late
-- doesn't break anything — it just stops relying on the rewrite.)
-- ═══════════════════════════════════════════════════════════════

UPDATE menu_items
   SET image = regexp_replace(image, '^asstes/', 'assets/')
 WHERE image LIKE 'asstes/%';
