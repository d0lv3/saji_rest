-- ═══════════════════════════════════════════════════════════════
-- 08_promo_code_check.sql — run BEFORE deploying the site code
--
-- Additive. Lets the cart check one promo code at a time without
-- being able to list the promo_codes table (09 removes that access).
-- Matching mirrors create_order(): trimmed, exact, active codes only.
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION check_promo_code(p_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_promo RECORD;
BEGIN
  SELECT code, type, value INTO v_promo
    FROM promo_codes
   WHERE code = LEFT(BTRIM(COALESCE(p_code, '')), 50)
     AND active = true;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'code',  v_promo.code,
    'type',  v_promo.type,
    'value', v_promo.value
  );
END;
$$;

GRANT EXECUTE ON FUNCTION check_promo_code(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION check_promo_code(TEXT) TO authenticated;
