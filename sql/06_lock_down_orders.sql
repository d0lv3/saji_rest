-- ═══════════════════════════════════════════════════════════════
-- 06_lock_down_orders.sql — run AFTER the new site code and the new
-- send-notification function are deployed
--
-- Removes public access to customer data. After this:
--   • orders / order_items: only the signed-in admin can read,
--     update or delete. Customers create orders via create_order()
--     and track them via get_order_status() + the status broadcast.
--   • push_tokens: only the admin can insert directly (its own
--     'ADMIN' devices). Customers go through save_push_token().
--
-- Running this before the new code is live would stop the OLD site
-- from tracking orders and saving customer push tokens.
--
-- Existing policies are dropped by querying pg_policies, so this works
-- whatever they were named in the dashboard.
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE orders      ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT policyname, tablename
      FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename IN ('orders', 'order_items', 'push_tokens')
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END;
$$;

-- ─── orders ─────────────────────────────────────────────────────
CREATE POLICY "Admin can read orders"
  ON orders FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Admin can update orders"
  ON orders FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "Admin can delete orders"
  ON orders FOR DELETE USING (auth.uid() IS NOT NULL);

-- ─── order_items ────────────────────────────────────────────────
CREATE POLICY "Admin can read order items"
  ON order_items FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Admin can update order items"
  ON order_items FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "Admin can delete order items"
  ON order_items FOR DELETE USING (auth.uid() IS NOT NULL);

-- ─── push_tokens ────────────────────────────────────────────────
CREATE POLICY "Admin can save tokens"
  ON push_tokens FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Admin can read tokens"
  ON push_tokens FOR SELECT USING (auth.uid() IS NOT NULL);

-- ─── Verify ─────────────────────────────────────────────────────
-- SELECT tablename, policyname, cmd FROM pg_policies
--  WHERE tablename IN ('orders', 'order_items', 'push_tokens')
--  ORDER BY tablename, cmd;
