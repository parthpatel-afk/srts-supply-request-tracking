-- ============================================================
-- Phase 9: Global Inventory Library
-- ============================================================

-- 1. Create the Master Inventory Table
CREATE TABLE IF NOT EXISTS public.master_inventory (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT        NOT NULL UNIQUE,
    category    TEXT        NOT NULL,
    image_url   TEXT        NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Add Link to inventory_items
ALTER TABLE public.inventory_items 
ADD COLUMN IF NOT EXISTS master_item_id UUID REFERENCES public.master_inventory(id) ON DELETE SET NULL;

-- 3. Update RLS (Global items are readable by all)
ALTER TABLE public.master_inventory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_read_master_inventory"
    ON public.master_inventory
    FOR SELECT
    TO anon
    USING (true);

-- 4. Seed Master Inventory with the 20 AutoRise items
-- (We'll do this via script to ensure image URLs are captured correctly)
