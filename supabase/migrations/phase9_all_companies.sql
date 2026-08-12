-- ============================================================
-- SRTS Phase 9: Full Inventory Migration — All Companies
-- ============================================================
-- SAFE TO RUN MULTIPLE TIMES (idempotent)
-- - Updates existing items across ALL companies in-place
-- - Inserts new items for any company that is missing them
-- - Deactivates WD-40/Lubricant across all companies
-- - Updates supply_requests.item_name + image_url to match new names
-- ============================================================


-- ============================================================
-- STEP 1: UPDATE existing items across ALL companies
-- (same ILIKE patterns as migrate_inventory.sql, but no slug filter)
-- ============================================================

UPDATE public.inventory_items
SET name = 'Safety Glasses', image_url = '/inventory/safety_glasses.png', category = 'PPE'
WHERE name ILIKE '%Safety Glasses%';

UPDATE public.inventory_items
SET name = 'Dust Mask / Respirator', image_url = '/inventory/dust_mask_respirator.png', category = 'PPE'
WHERE name ILIKE '%Respirator%' OR name ILIKE '%Dust Mask%';

UPDATE public.inventory_items
SET name = 'Cut-Resistant Gloves', image_url = '/inventory/cut_resistant_gloves.png', category = 'PPE'
WHERE name ILIKE '%Cut%Glove%' OR name ILIKE '%HyFlex%' OR name ILIKE '%Work Glove%';

UPDATE public.inventory_items
SET name = 'Hard Hat', image_url = '/inventory/hard_hat.png', category = 'PPE'
WHERE name ILIKE '%Hard Hat%';

UPDATE public.inventory_items
SET name = 'Safety Vest', image_url = '/inventory/safety_vest.png', category = 'PPE'
WHERE (name ILIKE '%Vest%' OR name ILIKE '%Hi%Vis%' OR name ILIKE '%High%Vis%')
  AND name NOT ILIKE '%Safety Vest%'; -- skip already-updated rows

UPDATE public.inventory_items
SET name = 'Nitrile Gloves', image_url = '/inventory/nitrile_gloves.png', category = 'PPE'
WHERE name ILIKE '%Nitrile%';

UPDATE public.inventory_items
SET name = 'Ear Protection / Earmuffs', image_url = '/inventory/ear_protection_earmuffs.png', category = 'PPE'
WHERE name ILIKE '%Earmuff%' OR name ILIKE '%Ear%Protect%' OR name ILIKE '%Peltor%';

UPDATE public.inventory_items
SET name = 'Cordless Drill', image_url = '/inventory/cordless_drill.png', category = 'Power Tools'
WHERE (name ILIKE '%Drill%' OR name ILIKE '%Milwaukee%')
  AND name NOT ILIKE '%Cordless Drill%';

UPDATE public.inventory_items
SET name = 'Angle Grinder', image_url = '/inventory/angle_grinder.png', category = 'Power Tools'
WHERE name ILIKE '%Grinder%';

UPDATE public.inventory_items
SET name = 'Calipers', image_url = '/inventory/calipers.png', category = 'Measuring'
WHERE name ILIKE '%Caliper%' OR name ILIKE '%Mitutoyo%';

UPDATE public.inventory_items
SET name = 'Utility Knife', image_url = '/inventory/utility_knife.png', category = 'Hand Tools'
WHERE name ILIKE '%Utility Knife%';

UPDATE public.inventory_items
SET name = 'Degreaser / Cleaner Spray', image_url = '/inventory/degreaser_cleaner_spray.png', category = 'Chemicals'
WHERE name ILIKE '%Degreaser%';

UPDATE public.inventory_items
SET name = 'Zip Ties', image_url = '/inventory/zip_ties.png', category = 'Hardware'
WHERE name ILIKE '%Zip Tie%';

UPDATE public.inventory_items
SET name = 'Lockout / Tagout Kit', image_url = '/inventory/lockout_tagout_kit.png', category = 'Safety Equipment'
WHERE name ILIKE '%LOTO%' OR name ILIKE '%Lockout%' OR name ILIKE '%Padlock%';

UPDATE public.inventory_items
SET name = 'First Aid Kit', image_url = '/inventory/first_aid_kit.png', category = 'Safety Equipment'
WHERE name ILIKE '%First Aid%';

UPDATE public.inventory_items
SET name = 'Caution / Barrier Tape', image_url = '/inventory/caution_barrier_tape.png', category = 'Safety Equipment'
WHERE name ILIKE '%Caution%Tape%' OR name ILIKE '%Barrier Tape%';

UPDATE public.inventory_items
SET name = 'Floor Marking Tape', image_url = '/inventory/floor_marking_tape.png', category = 'Safety Equipment'
WHERE name ILIKE '%Floor%Tape%';

UPDATE public.inventory_items
SET name = 'Shop Rags / Cleaning Towels', image_url = '/inventory/shop_rags_cleaning_towels.png', category = 'Cleaning'
WHERE name ILIKE '%Shop Towel%' OR name ILIKE '%Shop Rag%' OR name ILIKE '%Scott%';

UPDATE public.inventory_items
SET name = 'Trash Bags', image_url = '/inventory/trash_bags.png', category = 'Consumables'
WHERE name ILIKE '%Trash Bag%';

-- Deactivate WD-40 / Lubricant (removed from the new catalog)
UPDATE public.inventory_items
SET is_active = false
WHERE name ILIKE '%WD-40%' OR name ILIKE '%Lubricant%';


-- ============================================================
-- STEP 2: INSERT new items for every company that is missing them
-- (safe to re-run — NOT EXISTS prevents duplicates)
-- ============================================================

INSERT INTO public.inventory_items (company_id, name, image_url, category)
SELECT c.id, v.name, v.image_url, v.category
FROM public.companies c
CROSS JOIN (VALUES
    -- PPE (already in old catalog — only inserted if missing)
    ('Safety Glasses',              '/inventory/safety_glasses.png',             'PPE'),
    ('Dust Mask / Respirator',      '/inventory/dust_mask_respirator.png',       'PPE'),
    ('Cut-Resistant Gloves',        '/inventory/cut_resistant_gloves.png',       'PPE'),
    ('Hard Hat',                    '/inventory/hard_hat.png',                   'PPE'),
    ('Safety Vest',                 '/inventory/safety_vest.png',                'PPE'),
    ('Nitrile Gloves',              '/inventory/nitrile_gloves.png',             'PPE'),
    ('Ear Protection / Earmuffs',   '/inventory/ear_protection_earmuffs.png',    'PPE'),

    -- Power Tools
    ('Cordless Drill',              '/inventory/cordless_drill.png',             'Power Tools'),
    ('Angle Grinder',               '/inventory/angle_grinder.png',              'Power Tools'),

    -- Hand Tools (Tape Measure, Wrench, Screwdrivers, Pliers are NEW)
    ('Utility Knife',               '/inventory/utility_knife.png',              'Hand Tools'),
    ('Tape Measure',                '/inventory/tape_measure.png',               'Hand Tools'),
    ('Adjustable Wrench',           '/inventory/adjustable_wrench.png',          'Hand Tools'),
    ('Screwdriver Set',             '/inventory/screwdriver_set.png',            'Hand Tools'),
    ('Pliers',                      '/inventory/pliers.png',                     'Hand Tools'),

    -- Measuring
    ('Calipers',                    '/inventory/calipers.png',                   'Measuring'),

    -- Electrical (Extension Cord + Work Light are NEW)
    ('Extension Cord',              '/inventory/extension_cord.png',             'Electrical'),
    ('Portable Work Light',         '/inventory/portable_work_light.png',        'Electrical'),

    -- Hardware & Fasteners (Duct Tape is NEW)
    ('Zip Ties',                    '/inventory/zip_ties.png',                   'Hardware'),
    ('Duct Tape',                   '/inventory/duct_tape.png',                  'Hardware'),

    -- Chemicals
    ('Degreaser / Cleaner Spray',   '/inventory/degreaser_cleaner_spray.png',    'Chemicals'),

    -- Safety Equipment (Traffic Cones is NEW)
    ('First Aid Kit',               '/inventory/first_aid_kit.png',              'Safety Equipment'),
    ('Lockout / Tagout Kit',        '/inventory/lockout_tagout_kit.png',         'Safety Equipment'),
    ('Caution / Barrier Tape',      '/inventory/caution_barrier_tape.png',       'Safety Equipment'),
    ('Floor Marking Tape',          '/inventory/floor_marking_tape.png',         'Safety Equipment'),
    ('Safety Traffic Cones',        '/inventory/safety_traffic_cones.png',       'Safety Equipment'),

    -- Stationery (NEW)
    ('Permanent Markers',           '/inventory/permanent_markers.png',          'Stationery'),

    -- Cleaning (Broom & Dustpan is NEW)
    ('Shop Rags / Cleaning Towels', '/inventory/shop_rags_cleaning_towels.png',  'Cleaning'),
    ('Broom & Dustpan',             '/inventory/broom_dustpan.png',              'Cleaning'),

    -- Consumables (Parts Storage Bins is NEW)
    ('Trash Bags',                  '/inventory/trash_bags.png',                 'Consumables'),
    ('Parts Storage Bins',          '/inventory/parts_storage_bins.png',         'Consumables')

) AS v(name, image_url, category)
WHERE NOT EXISTS (
    SELECT 1 FROM public.inventory_items ii
    WHERE ii.company_id = c.id AND ii.name = v.name
);


-- ============================================================
-- STEP 3: Fix supply_requests — update old item names + image URLs
-- (Requests store item_name as text copied at submission time.
--  This brings historical requests in line with the new names.)
-- ============================================================

-- Safety Glasses
UPDATE public.supply_requests
SET item_name = 'Safety Glasses', image_url = '/inventory/safety_glasses.png'
WHERE item_name ILIKE '%Safety Glasses%'
  AND (image_url NOT LIKE '/inventory/%' OR item_name != 'Safety Glasses');

-- Dust Mask / Respirator
UPDATE public.supply_requests
SET item_name = 'Dust Mask / Respirator', image_url = '/inventory/dust_mask_respirator.png'
WHERE (item_name ILIKE '%Respirator%' OR item_name ILIKE '%Dust Mask%')
  AND (image_url NOT LIKE '/inventory/%' OR item_name NOT LIKE 'Dust Mask%');

-- Cut-Resistant Gloves
UPDATE public.supply_requests
SET item_name = 'Cut-Resistant Gloves', image_url = '/inventory/cut_resistant_gloves.png'
WHERE (item_name ILIKE '%Cut%Glove%' OR item_name ILIKE '%HyFlex%' OR item_name ILIKE '%Work Glove%')
  AND (image_url NOT LIKE '/inventory/%' OR item_name != 'Cut-Resistant Gloves');

-- Hard Hat
UPDATE public.supply_requests
SET item_name = 'Hard Hat', image_url = '/inventory/hard_hat.png'
WHERE item_name ILIKE '%Hard Hat%'
  AND (image_url NOT LIKE '/inventory/%' OR item_name != 'Hard Hat');

-- Safety Vest
UPDATE public.supply_requests
SET item_name = 'Safety Vest', image_url = '/inventory/safety_vest.png'
WHERE (item_name ILIKE '%Vest%' OR item_name ILIKE '%Hi%Vis%' OR item_name ILIKE '%High%Vis%')
  AND item_name NOT ILIKE '%Safety Vest%';

-- Nitrile Gloves
UPDATE public.supply_requests
SET item_name = 'Nitrile Gloves', image_url = '/inventory/nitrile_gloves.png'
WHERE item_name ILIKE '%Nitrile%'
  AND (image_url NOT LIKE '/inventory/%' OR item_name != 'Nitrile Gloves');

-- Ear Protection / Earmuffs
UPDATE public.supply_requests
SET item_name = 'Ear Protection / Earmuffs', image_url = '/inventory/ear_protection_earmuffs.png'
WHERE (item_name ILIKE '%Earmuff%' OR item_name ILIKE '%Ear%Protect%' OR item_name ILIKE '%Peltor%')
  AND (image_url NOT LIKE '/inventory/%' OR item_name != 'Ear Protection / Earmuffs');

-- Cordless Drill
UPDATE public.supply_requests
SET item_name = 'Cordless Drill', image_url = '/inventory/cordless_drill.png'
WHERE (item_name ILIKE '%Drill%' OR item_name ILIKE '%Milwaukee%')
  AND item_name NOT ILIKE '%Cordless Drill%';

-- Angle Grinder
UPDATE public.supply_requests
SET item_name = 'Angle Grinder', image_url = '/inventory/angle_grinder.png'
WHERE item_name ILIKE '%Grinder%'
  AND (image_url NOT LIKE '/inventory/%' OR item_name != 'Angle Grinder');

-- Calipers
UPDATE public.supply_requests
SET item_name = 'Calipers', image_url = '/inventory/calipers.png'
WHERE (item_name ILIKE '%Caliper%' OR item_name ILIKE '%Mitutoyo%')
  AND (image_url NOT LIKE '/inventory/%' OR item_name != 'Calipers');

-- Utility Knife
UPDATE public.supply_requests
SET item_name = 'Utility Knife', image_url = '/inventory/utility_knife.png'
WHERE item_name ILIKE '%Utility Knife%'
  AND (image_url NOT LIKE '/inventory/%' OR item_name != 'Utility Knife');

-- Degreaser / Cleaner Spray
UPDATE public.supply_requests
SET item_name = 'Degreaser / Cleaner Spray', image_url = '/inventory/degreaser_cleaner_spray.png'
WHERE item_name ILIKE '%Degreaser%'
  AND (image_url NOT LIKE '/inventory/%' OR item_name NOT LIKE 'Degreaser%');

-- Zip Ties
UPDATE public.supply_requests
SET item_name = 'Zip Ties', image_url = '/inventory/zip_ties.png'
WHERE item_name ILIKE '%Zip Tie%'
  AND (image_url NOT LIKE '/inventory/%' OR item_name != 'Zip Ties');

-- Lockout / Tagout Kit
UPDATE public.supply_requests
SET item_name = 'Lockout / Tagout Kit', image_url = '/inventory/lockout_tagout_kit.png'
WHERE (item_name ILIKE '%LOTO%' OR item_name ILIKE '%Lockout%' OR item_name ILIKE '%Padlock%')
  AND (image_url NOT LIKE '/inventory/%' OR item_name NOT LIKE 'Lockout%');

-- First Aid Kit
UPDATE public.supply_requests
SET item_name = 'First Aid Kit', image_url = '/inventory/first_aid_kit.png'
WHERE item_name ILIKE '%First Aid%'
  AND (image_url NOT LIKE '/inventory/%' OR item_name != 'First Aid Kit');

-- Caution / Barrier Tape
UPDATE public.supply_requests
SET item_name = 'Caution / Barrier Tape', image_url = '/inventory/caution_barrier_tape.png'
WHERE (item_name ILIKE '%Caution%Tape%' OR item_name ILIKE '%Barrier Tape%')
  AND (image_url NOT LIKE '/inventory/%' OR item_name NOT LIKE 'Caution%');

-- Floor Marking Tape
UPDATE public.supply_requests
SET item_name = 'Floor Marking Tape', image_url = '/inventory/floor_marking_tape.png'
WHERE item_name ILIKE '%Floor%Tape%'
  AND (image_url NOT LIKE '/inventory/%' OR item_name != 'Floor Marking Tape');

-- Shop Rags / Cleaning Towels
UPDATE public.supply_requests
SET item_name = 'Shop Rags / Cleaning Towels', image_url = '/inventory/shop_rags_cleaning_towels.png'
WHERE (item_name ILIKE '%Shop Towel%' OR item_name ILIKE '%Shop Rag%' OR item_name ILIKE '%Scott%')
  AND (image_url NOT LIKE '/inventory/%' OR item_name NOT LIKE 'Shop Rags%');

-- Trash Bags
UPDATE public.supply_requests
SET item_name = 'Trash Bags', image_url = '/inventory/trash_bags.png'
WHERE item_name ILIKE '%Trash Bag%'
  AND (image_url NOT LIKE '/inventory/%' OR item_name != 'Trash Bags');


-- ============================================================
-- STEP 4: VERIFY
-- ============================================================

-- Items per company (should show 31 active items per company):
SELECT co.name AS company, COUNT(*) FILTER (WHERE ii.is_active) AS active_items
FROM public.companies co
JOIN public.inventory_items ii ON ii.company_id = co.id
GROUP BY co.name
ORDER BY co.name;

-- All active items for first company (spot-check names + image URLs):
SELECT ii.name, ii.image_url, ii.category, ii.is_active
FROM public.inventory_items ii
JOIN public.companies co ON co.id = ii.company_id
WHERE co.slug = 'autorise'
ORDER BY ii.category, ii.name;

-- Count of supply_requests that were updated (image now points to /inventory/):
SELECT COUNT(*) AS requests_with_new_images
FROM public.supply_requests
WHERE image_url LIKE '/inventory/%';
