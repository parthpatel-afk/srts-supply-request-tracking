-- ============================================================
-- SRTS: Add quantity column to supply_requests
-- Run in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

ALTER TABLE public.supply_requests
  ADD COLUMN IF NOT EXISTS quantity INTEGER NOT NULL DEFAULT 1
    CHECK (quantity BETWEEN 1 AND 99);

COMMENT ON COLUMN public.supply_requests.quantity IS 'Number of units requested (1–99).';
