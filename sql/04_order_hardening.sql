-- ═══════════════════════════════════════════════════════════════
-- 04_order_hardening.sql — run BEFORE deploying the new site code
--
-- Everything here is additive: the currently deployed site keeps
-- working after it runs.
--
--   1. create_order: rejects orders while the restaurant is closed,
--      validates phone/address, caps field lengths, and limits each
--      phone number to 5 orders per 10 minutes
--   2. save_push_token: customers can only register a device for an
--      order they hold the access token for
--   3. Order status is broadcast on a channel named after the order's
--      access token, so customers can track without reading `orders`
--   4. admin_notified: lets the send-notification function alert the
--      admin only once per new order
-- ═══════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────
-- 1. Columns & indexes
-- ───────────────────────────────────────────────────────────────
ALTER TABLE orders ADD COLUMN IF NOT EXISTS admin_notified BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_orders_phone_created_at ON orders(phone, created_at DESC);

-- ───────────────────────────────────────────────────────────────
-- 2. create_order with input guards (replaces the version from 03)
-- ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION create_order(
  p_customer_name TEXT,
  p_phone         TEXT,
  p_address        TEXT,
  p_items          JSONB,            -- [{item_id, qty, addon_ids, notes}]
  p_promo_code     TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id        TEXT;
  v_access_token    TEXT;
  v_subtotal        INTEGER := 0;
  v_delivery_fee    INTEGER;
  v_discount        INTEGER := 0;
  v_total           INTEGER;
  v_validated_items JSONB   := '[]'::JSONB;
  v_rec             RECORD;
  v_menu_row        RECORD;
  v_offer_row       RECORD;
  v_promo_row       RECORD;
  v_unit_price      INTEGER;
  v_item_name       TEXT;
  v_addon_names     JSONB;
  v_is_open         BOOLEAN;
  v_recent_orders   INTEGER;
  v_name            TEXT := LEFT(BTRIM(COALESCE(p_customer_name, '')), 100);
  v_phone           TEXT := BTRIM(COALESCE(p_phone, ''));
  v_address         TEXT := LEFT(BTRIM(COALESCE(p_address, '')), 500);
  v_promo_code      TEXT := NULLIF(LEFT(BTRIM(COALESCE(p_promo_code, '')), 50), '');
BEGIN
  -- ── Phase 0: Guards ──────────────────────────────────────
  -- Closed restaurant (a missing setting counts as open)
  SELECT (value->>'isOpen')::BOOLEAN INTO v_is_open
    FROM settings
   WHERE key = 'restaurant_status';
  IF v_is_open = false THEN
    RAISE EXCEPTION 'restaurant_closed';
  END IF;

  -- Same rules the checkout form already enforces
  IF v_phone !~ '^07[578][0-9]{8}$' THEN
    RAISE EXCEPTION 'invalid_phone';
  END IF;
  IF v_address = '' THEN
    RAISE EXCEPTION 'invalid_address';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array'
     OR jsonb_array_length(p_items) = 0 OR jsonb_array_length(p_items) > 50 THEN
    RAISE EXCEPTION 'invalid_items';
  END IF;

  -- Rate limit per phone number
  SELECT COUNT(*) INTO v_recent_orders
    FROM orders
   WHERE phone = v_phone
     AND created_at > NOW() - INTERVAL '10 minutes';
  IF v_recent_orders >= 5 THEN
    RAISE EXCEPTION 'rate_limited';
  END IF;

  -- ── Generate secure IDs ──────────────────────────────────
  v_order_id     := 'ORD-' || UPPER(LEFT(REPLACE(gen_random_uuid()::TEXT, '-', ''), 12));
  v_access_token := REPLACE(gen_random_uuid()::TEXT || gen_random_uuid()::TEXT, '-', '');

  -- ── Phase 1: Validate every item and look up real prices ─
  FOR v_rec IN
    SELECT *
      FROM jsonb_to_recordset(p_items)
        AS x(item_id TEXT, qty INTEGER, addon_ids JSONB, notes TEXT)
  LOOP
    -- Quantity sanity check
    IF v_rec.qty IS NULL OR v_rec.qty < 1 OR v_rec.qty > 50 THEN
      RAISE EXCEPTION 'invalid_qty:%', COALESCE(v_rec.item_id, 'unknown');
    END IF;

    v_addon_names := '[]'::JSONB;
    v_unit_price  := 0;
    v_item_name   := '';

    IF v_rec.item_id LIKE 'offer-%' THEN
      -- ── Offer item ───────────────────────────────────────
      SELECT * INTO v_offer_row
        FROM offers
       WHERE id = SUBSTRING(v_rec.item_id FROM 7)::INTEGER
         AND is_active = true
         AND expires_at > NOW();

      IF NOT FOUND THEN
        RAISE EXCEPTION 'offer_expired:%', v_rec.item_id;
      END IF;

      v_unit_price := v_offer_row.price;
      v_item_name  := v_offer_row.title;

    ELSE
      -- ── Regular menu item ────────────────────────────────
      SELECT * INTO v_menu_row
        FROM menu_items
       WHERE id = v_rec.item_id
         AND in_stock = true;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'item_unavailable:%', v_rec.item_id;
      END IF;

      v_unit_price := v_menu_row.price;
      v_item_name  := v_menu_row.name;

      -- Validate and price each addon against menu_items.addons
      IF  v_rec.addon_ids IS NOT NULL
          AND jsonb_typeof(v_rec.addon_ids) = 'array'
          AND jsonb_array_length(v_rec.addon_ids) > 0
      THEN
        DECLARE
          v_aid   TEXT;
          v_found JSONB;
        BEGIN
          FOR v_aid IN SELECT jsonb_array_elements_text(v_rec.addon_ids)
          LOOP
            SELECT elem INTO v_found
              FROM jsonb_array_elements(
                     COALESCE(v_menu_row.addons, '[]'::JSONB)
                   ) elem
             WHERE elem->>'id' = v_aid;

            IF v_found IS NULL THEN
              RAISE EXCEPTION 'invalid_addon:%:%', v_aid, v_rec.item_id;
            END IF;

            v_unit_price  := v_unit_price + (v_found->>'price')::INTEGER;
            v_addon_names := v_addon_names || jsonb_build_array(v_found->>'name');
          END LOOP;
        END;
      END IF;
    END IF;

    -- Accumulate subtotal
    v_subtotal := v_subtotal + (v_unit_price * v_rec.qty);

    -- Store validated item for bulk insert later
    v_validated_items := v_validated_items || jsonb_build_array(
      jsonb_build_object(
        'item_name',  v_item_name,
        'qty',        v_rec.qty,
        'unit_price', v_unit_price,
        'addons',     v_addon_names,
        'notes',      LEFT(COALESCE(v_rec.notes, ''), 500)
      )
    );
  END LOOP;

  -- ── Phase 2: Delivery fee (mirrors client constants) ─────
  v_delivery_fee := CASE WHEN v_subtotal >= 5000 THEN 0 ELSE 1000 END;

  -- ── Phase 3: Server-side promo code validation ───────────
  IF v_promo_code IS NOT NULL THEN
    BEGIN
      SELECT * INTO v_promo_row
        FROM promo_codes
       WHERE code = v_promo_code AND active = true;

      IF FOUND THEN
        IF v_promo_row.type = 'percent' THEN
          v_discount := ROUND(v_subtotal * v_promo_row.value / 100.0)::INTEGER;
        ELSIF v_promo_row.type = 'fixed' THEN
          v_discount := LEAST(v_promo_row.value::INTEGER, v_subtotal);
        END IF;
      END IF;
    EXCEPTION WHEN undefined_table THEN
      -- promo_codes table not created yet — skip silently
      NULL;
    END;
  END IF;

  v_total := v_subtotal + v_delivery_fee - v_discount;

  -- Minimum order check
  IF v_subtotal < 3000 THEN
    RAISE EXCEPTION 'minimum_not_met';
  END IF;

  -- ── Phase 4: Atomic insert (order + items in one tx) ─────
  INSERT INTO orders
    (id, customer_name, phone, address, status,
     subtotal, delivery_fee, discount, promo_code, total, access_token)
  VALUES
    (v_order_id, v_name, v_phone, v_address, 'pending',
     v_subtotal, v_delivery_fee, v_discount, v_promo_code, v_total, v_access_token);

  INSERT INTO order_items (order_id, item_name, qty, unit_price, addons, notes)
  SELECT v_order_id,
         elem->>'item_name',
         (elem->>'qty')::INTEGER,
         (elem->>'unit_price')::INTEGER,
         ARRAY(SELECT jsonb_array_elements_text(elem->'addons')),
         elem->>'notes'
    FROM jsonb_array_elements(v_validated_items) elem;

  -- ── Return server-calculated result ──────────────────────
  RETURN jsonb_build_object(
    'id',           v_order_id,
    'access_token', v_access_token,
    'subtotal',     v_subtotal,
    'delivery_fee', v_delivery_fee,
    'discount',     v_discount,
    'total',        v_total
  );
END;
$$;

GRANT EXECUTE ON FUNCTION create_order(TEXT, TEXT, TEXT, JSONB, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION create_order(TEXT, TEXT, TEXT, JSONB, TEXT) TO authenticated;

-- ───────────────────────────────────────────────────────────────
-- 3. Customer push token registration
-- ───────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'push_tokens_order_fcm_unique'
  ) THEN
    DELETE FROM push_tokens a USING push_tokens b
     WHERE a.id > b.id
       AND a.order_id  = b.order_id
       AND a.fcm_token = b.fcm_token;
    ALTER TABLE push_tokens
      ADD CONSTRAINT push_tokens_order_fcm_unique UNIQUE (order_id, fcm_token);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION save_push_token(
  p_order_id     TEXT,
  p_access_token TEXT,
  p_fcm_token    TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_fcm_token IS NULL OR LENGTH(p_fcm_token) = 0 OR LENGTH(p_fcm_token) > 4096 THEN
    RETURN false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM orders
     WHERE id = p_order_id
       AND access_token = p_access_token
  ) THEN
    RETURN false;
  END IF;

  INSERT INTO push_tokens (order_id, fcm_token)
  VALUES (p_order_id, p_fcm_token)
  ON CONFLICT (order_id, fcm_token) DO NOTHING;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION save_push_token(TEXT, TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION save_push_token(TEXT, TEXT, TEXT) TO authenticated;

-- ───────────────────────────────────────────────────────────────
-- 4. Broadcast status changes to the customer's private topic
--    Topic: 'order-' || access_token (only the customer knows it).
--    Failures are swallowed so a Realtime hiccup can never block
--    the admin from updating an order.
-- ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION broadcast_order_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.access_token IS NOT NULL AND NEW.status IS DISTINCT FROM OLD.status THEN
    BEGIN
      PERFORM realtime.send(
        jsonb_build_object(
          'status',      NEW.status,
          'cancel_note', COALESCE(NEW.cancel_note, '')
        ),
        'status',
        'order-' || NEW.access_token,
        false
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'broadcast_order_status failed: %', SQLERRM;
    END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_broadcast_status ON orders;
CREATE TRIGGER orders_broadcast_status
  AFTER UPDATE OF status ON orders
  FOR EACH ROW
  EXECUTE FUNCTION broadcast_order_status();
