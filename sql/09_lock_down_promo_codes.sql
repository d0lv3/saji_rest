-- ═══════════════════════════════════════════════════════════════
-- 09_lock_down_promo_codes.sql — run AFTER the site code that uses
-- check_promo_code() is deployed
--
-- Removes public read access to promo_codes so the list of codes
-- can't be downloaded. Customers check a single code through
-- check_promo_code(); create_order() applies it server-side.
-- Managing codes in the Supabase Table Editor is unaffected.
--
-- Running this before the new code is live makes the OLD site
-- reject every promo code in the cart.
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE promo_codes ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT policyname
      FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename = 'promo_codes'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.promo_codes', r.policyname);
  END LOOP;
END;
$$;

CREATE POLICY "Admin can read promos"
  ON promo_codes FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Admin can insert promos"
  ON promo_codes FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Admin can update promos"
  ON promo_codes FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "Admin can delete promos"
  ON promo_codes FOR DELETE USING (auth.uid() IS NOT NULL);
