-- ============================================================
-- SRTS Phase 7 Migration: Rename & Re-image Inventory Items
-- Run in Supabase SQL Editor (Project -> SQL Editor -> New Query)
--
-- SAFE TO RUN: Updates existing rows in-place (UUIDs unchanged).
-- Existing supply_requests are unaffected (they store item_name
-- as plain text copied at submission time, not a foreign key).
-- ============================================================


-- ============================================================
-- STEP 1: UPDATE existing 20 items with new names + image URLs
-- ============================================================

UPDATE public.inventory_items
SET name = 'Safety Glasses',
    image_url = '/inventory/safety_glasses.png',
    category  = 'PPE'
WHERE name ILIKE '%Safety Glasses%' AND company_id = (SELECT id FROM public.companies WHERE slug = 'autorise');

UPDATE public.inventory_items
SET name = 'Dust Mask / Respirator',
    image_url = '/inventory/dust_mask_respirator.png',
    category  = 'PPE'
WHERE name ILIKE '%Respirator%' AND company_id = (SELECT id FROM public.companies WHERE slug = 'autorise');

UPDATE public.inventory_items
SET name = 'Cut-Resistant Gloves',
    image_url = '/inventory/cut_resistant_gloves.png',
    category  = 'PPE'
WHERE (name ILIKE '%Cut%Glove%' OR name ILIKE '%HyFlex%' OR name ILIKE '%Work Glove%') AND company_id = (SELECT id FROM public.companies WHERE slug = 'autorise');

UPDATE public.inventory_items
SET name = 'Hard Hat',
    image_url = '/inventory/hard_hat.png',
    category  = 'PPE'
WHERE name ILIKE '%Hard Hat%' AND company_id = (SELECT id FROM public.companies WHERE slug = 'autorise');

UPDATE public.inventory_items
SET name = 'Safety Vest',
    image_url = '/inventory/safety_vest.png',
    category  = 'PPE'
WHERE (name ILIKE '%Vest%' OR name ILIKE '%Hi%Vis%' OR name ILIKE '%High%Vis%') AND company_id = (SELECT id FROM public.companies WHERE slug = 'autorise');

UPDATE public.inventory_items
SET name = 'Nitrile Gloves',
    image_url = '/inventory/nitrile_gloves.png',
    category  = 'PPE'
WHERE name ILIKE '%Nitrile%' AND company_id = (SELECT id FROM public.companies WHERE slug = 'autorise');

UPDATE public.inventory_items
SET name = 'Ear Protection / Earmuffs',
    image_url = '/inventory/ear_protection_earmuffs.png',
    category  = 'PPE'
WHERE (name ILIKE '%Earmuff%' OR name ILIKE '%Ear%Protect%' OR name ILIKE '%Peltor%') AND company_id = (SELECT id FROM public.companies WHERE slug = 'autorise');

UPDATE public.inventory_items
SET name = 'Cordless Drill',
    image_url = '/inventory/cordless_drill.png',
    category  = 'Power Tools'
WHERE (name ILIKE '%Drill%' OR name ILIKE '%Milwaukee%') AND company_id = (SELECT id FROM public.companies WHERE slug = 'autorise');

UPDATE public.inventory_items
SET name = 'Angle Grinder',
    image_url = '/inventory/angle_grinder.png',
    category  = 'Power Tools'
WHERE name ILIKE '%Grinder%' AND company_id = (SELECT id FROM public.companies WHERE slug = 'autorise');

UPDATE public.inventory_items
SET name = 'Calipers',
    image_url = '/inventory/calipers.png',
    category  = 'Measuring'
WHERE (name ILIKE '%Caliper%' OR name ILIKE '%Mitutoyo%') AND company_id = (SELECT id FROM public.companies WHERE slug = 'autorise');

UPDATE public.inventory_items
SET name = 'Utility Knife',
    image_url = '/inventory/utility_knife.png',
    category  = 'Hand Tools'
WHERE name ILIKE '%Utility Knife%' AND company_id = (SELECT id FROM public.companies WHERE slug = 'autorise');

UPDATE public.inventory_items
SET name = 'Degreaser / Cleaner Spray',
    image_url = '/inventory/degreaser_cleaner_spray.png',
    category  = 'Chemicals'
WHERE name ILIKE '%Degreaser%' AND company_id = (SELECT id FROM public.companies WHERE slug = 'autorise');

UPDATE public.inventory_items
SET name = 'Zip Ties',
    image_url = '/inventory/zip_ties.png',
    category  = 'Hardware'
WHERE name ILIKE '%Zip Tie%' AND company_id = (SELECT id FROM public.companies WHERE slug = 'autorise');

UPDATE public.inventory_items
SET name = 'Lockout / Tagout Kit',
    image_url = '/inventory/lockout_tagout_kit.png',
    category  = 'Safety Equipment'
WHERE (name ILIKE '%LOTO%' OR name ILIKE '%Lockout%' OR name ILIKE '%Padlock%') AND company_id = (SELECT id FROM public.companies WHERE slug = 'autorise');

UPDATE public.inventory_items
SET name = 'First Aid Kit',
    image_url = '/inventory/first_aid_kit.png',
    category  = 'Safety Equipment'
WHERE name ILIKE '%First Aid%' AND company_id = (SELECT id FROM public.companies WHERE slug = 'autorise');

UPDATE public.inventory_items
SET name = 'Caution / Barrier Tape',
    image_url = '/inventory/caution_barrier_tape.png',
    category  = 'Safety Equipment'
WHERE (name ILIKE '%Caution%Tape%' OR name ILIKE '%Barrier Tape%') AND company_id = (SELECT id FROM public.companies WHERE slug = 'autorise');

UPDATE public.inventory_items
SET name = 'Floor Marking Tape',
    image_url = '/inventory/floor_marking_tape.png',
    category  = 'Safety Equipment'
WHERE name ILIKE '%Floor%Tape%' AND company_id = (SELECT id FROM public.companies WHERE slug = 'autorise');

UPDATE public.inventory_items
SET name = 'Shop Rags / Cleaning Towels',
    image_url = '/inventory/shop_rags_cleaning_towels.png',
    category  = 'Cleaning'
WHERE (name ILIKE '%Shop Towel%' OR name ILIKE '%Shop Rag%' OR name ILIKE '%Scott%') AND company_id = (SELECT id FROM public.companies WHERE slug = 'autorise');

UPDATE public.inventory_items
SET name = 'Trash Bags',
    image_url = '/inventory/trash_bags.png',
    category  = 'Consumables'
WHERE name ILIKE '%Trash Bag%' AND company_id = (SELECT id FROM public.companies WHERE slug = 'autorise');

-- WD-40 mapped to Lubricant Spray which was removed from the new list.
-- Deactivate it so it no longer appears in the catalog.
UPDATE public.inventory_items
SET is_active = false
WHERE (name ILIKE '%WD-40%' OR name ILIKE '%Lubricant%') AND company_id = (SELECT id FROM public.companies WHERE slug = 'autorise');


-- ============================================================
-- STEP 2: INSERT 11 brand-new items that didn't exist before
-- ============================================================

INSERT INTO public.inventory_items (company_id, name, image_url, category)
SELECT c.id, v.name, v.image_url, v.category
FROM public.companies c
CROSS JOIN (VALUES
    ('Tape Measure',                '/inventory/tape_measure.png',                'Hand Tools'),
    ('Adjustable Wrench',           '/inventory/adjustable_wrench.png',           'Hand Tools'),
    ('Screwdriver Set',             '/inventory/screwdriver_set.png',             'Hand Tools'),
    ('Pliers',                      '/inventory/pliers.png',                      'Hand Tools'),
    ('Extension Cord',              '/inventory/extension_cord.png',              'Electrical'),
    ('Portable Work Light',         '/inventory/portable_work_light.png',         'Electrical'),
    ('Duct Tape',                   '/inventory/duct_tape.png',                   'Hardware'),
    ('Eye Wash Bottle',             '/inventory/eye_wash_bottle.png',             'Safety Equipment'),
    ('Safety Traffic Cones',        '/inventory/safety_traffic_cones.png',        'Safety Equipment'),
    ('Permanent Markers',           '/inventory/permanent_markers.png',           'Stationery'),
    ('Broom & Dustpan',             '/inventory/broom_dustpan.png',               'Cleaning'),
    ('Parts Storage Bins',          '/inventory/parts_storage_bins.png',          'Consumables')
) AS v(name, image_url, category)
WHERE c.slug = 'autorise'
ON CONFLICT DO NOTHING;


-- ============================================================
-- STEP 3: VERIFY
-- ============================================================

SELECT name, image_url, category, is_active
FROM public.inventory_items
WHERE company_id = (SELECT id FROM public.companies WHERE slug = 'autorise')
ORDER BY category, name;
