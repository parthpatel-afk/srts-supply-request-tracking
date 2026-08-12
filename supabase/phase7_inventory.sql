-- ============================================================
-- SRTS Phase 7: Dynamic Inventory Management
-- Run in Supabase SQL Editor (Project -> SQL Editor -> New Query)
-- ============================================================


-- ============================================================
-- 7.2  INVENTORY_ITEMS TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS public.inventory_items (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id  UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    name        TEXT        NOT NULL,
    image_url   TEXT        NOT NULL DEFAULT '',
    category    TEXT        NOT NULL DEFAULT 'General',
    is_active   BOOLEAN     NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  public.inventory_items             IS 'Dynamic catalog of requestable supply items per tenant.';
COMMENT ON COLUMN public.inventory_items.is_active   IS 'Set false to hide an item without deleting it.';

CREATE INDEX IF NOT EXISTS idx_inventory_company_active
    ON public.inventory_items (company_id, is_active);

ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;

-- Anyone can read catalog items (floor workers need them)
CREATE POLICY "anon_read_inventory_items"
    ON public.inventory_items FOR SELECT TO anon
    USING (true);

-- Supervisor can insert items for their company
CREATE POLICY "anon_insert_inventory_items"
    ON public.inventory_items FOR INSERT TO anon
    WITH CHECK (company_id IN (SELECT id FROM public.companies));

-- Supervisor can update items
CREATE POLICY "anon_update_inventory_items"
    ON public.inventory_items FOR UPDATE TO anon
    USING (true) WITH CHECK (true);

-- Supervisor can delete items
CREATE POLICY "anon_delete_inventory_items"
    ON public.inventory_items FOR DELETE TO anon
    USING (true);


-- ============================================================
-- STORAGE RLS for inventory_images bucket
-- (Bucket was already created as Public by the user)
-- ============================================================

-- Allow anonymous uploads (supervisor uploading item photos)
CREATE POLICY "anon_upload_inventory_images"
    ON storage.objects FOR INSERT TO anon
    WITH CHECK (bucket_id = 'inventory_images');

-- Allow anonymous updates (replacing a photo)
CREATE POLICY "anon_update_inventory_images"
    ON storage.objects FOR UPDATE TO anon
    USING (bucket_id = 'inventory_images');

-- Allow anonymous deletes (removing a photo when item is deleted)
CREATE POLICY "anon_delete_inventory_images"
    ON storage.objects FOR DELETE TO anon
    USING (bucket_id = 'inventory_images');


-- ============================================================
-- 7.3  SEED DATA -- 31 Generic Manufacturing & Shop Items
--      for AutoRise (resolved via slug -> id subquery)
--      NOTE: image_url fields are blank placeholders.
--            Upload AI-generated images to Supabase Storage
--            and replace each '' with the public URL.
-- ============================================================

INSERT INTO public.inventory_items (company_id, name, image_url, category)
SELECT
    c.id,
    v.name,
    v.image_url,
    v.category
FROM public.companies c
CROSS JOIN (VALUES

    -- PPE
    ('Safety Glasses',              '/inventory/safety_glasses.png',               'PPE'),
    ('Dust Mask / Respirator',      '/inventory/dust_mask_respirator.png',         'PPE'),
    ('Cut-Resistant Gloves',        '/inventory/cut_resistant_gloves.png',         'PPE'),
    ('Hard Hat',                    '/inventory/hard_hat.png',                     'PPE'),
    ('Safety Vest',                 '/inventory/safety_vest.png',                  'PPE'),
    ('Nitrile Gloves',              '/inventory/nitrile_gloves.png',               'PPE'),
    ('Ear Protection / Earmuffs',   '/inventory/ear_protection_earmuffs.png',      'PPE'),

    -- Power Tools
    ('Cordless Drill',              '/inventory/cordless_drill.png',               'Power Tools'),
    ('Angle Grinder',               '/inventory/angle_grinder.png',                'Power Tools'),

    -- Hand Tools
    ('Utility Knife',               '/inventory/utility_knife.png',                'Hand Tools'),
    ('Tape Measure',                '/inventory/tape_measure.png',                 'Hand Tools'),
    ('Adjustable Wrench',           '/inventory/adjustable_wrench.png',            'Hand Tools'),
    ('Screwdriver Set',             '/inventory/screwdriver_set.png',              'Hand Tools'),
    ('Pliers',                      '/inventory/pliers.png',                       'Hand Tools'),

    -- Measuring
    ('Calipers',                    '/inventory/calipers.png',                     'Measuring'),

    -- Electrical
    ('Extension Cord',              '/inventory/extension_cord.png',               'Electrical'),
    ('Portable Work Light',         '/inventory/portable_work_light.png',          'Electrical'),

    -- Hardware & Fasteners
    ('Zip Ties',                    '/inventory/zip_ties.png',                     'Hardware'),
    ('Duct Tape',                   '/inventory/duct_tape.png',                    'Hardware'),

    -- Chemicals
    ('Degreaser / Cleaner Spray',   '/inventory/degreaser_cleaner_spray.png',      'Chemicals'),

    -- Safety Equipment
    ('First Aid Kit',               '/inventory/first_aid_kit.png',                'Safety Equipment'),
    ('Eye Wash Bottle',             '/inventory/eye_wash_bottle.png',              'Safety Equipment'),
    ('Lockout / Tagout Kit',        '/inventory/lockout_tagout_kit.png',           'Safety Equipment'),
    ('Caution / Barrier Tape',      '/inventory/caution_barrier_tape.png',         'Safety Equipment'),
    ('Floor Marking Tape',          '/inventory/floor_marking_tape.png',           'Safety Equipment'),
    ('Safety Traffic Cones',        '/inventory/safety_traffic_cones.png',         'Safety Equipment'),

    -- Stationery
    ('Permanent Markers',           '/inventory/permanent_markers.png',            'Stationery'),

    -- Cleaning
    ('Shop Rags / Cleaning Towels', '/inventory/shop_rags_cleaning_towels.png',  'Cleaning'),
    ('Broom & Dustpan',             '/inventory/broom_dustpan.png',                'Cleaning'),

    -- Consumables
    ('Trash Bags',                  '/inventory/trash_bags.png',                   'Consumables'),
    ('Parts Storage Bins',          '/inventory/parts_storage_bins.png',           'Consumables')

) AS v(name, image_url, category)
WHERE c.slug = 'autorise'
ON CONFLICT DO NOTHING;


-- ============================================================
-- VERIFY (optional -- run to confirm)
-- ============================================================

-- SELECT name, category FROM public.inventory_items ORDER BY category, name;
-- SELECT COUNT(*) FROM public.inventory_items;
