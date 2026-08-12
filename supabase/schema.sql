-- ============================================================
-- SRTS: Supply Request Tracking System
-- Phase 2: Supabase Schema & Auth
-- Run this entire file in the Supabase SQL Editor:
--   Project Dashboard → SQL Editor → New Query → Paste → Run
-- ============================================================


-- ============================================================
-- 2.1  COMPANIES TABLE  (Multi-Tenant anchor)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.companies (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT        NOT NULL,
    slug        TEXT        NOT NULL UNIQUE,   -- used in URL: /req/:slug  /admin/:slug
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  public.companies          IS 'One row per client tenant (e.g., AutoRise).';
COMMENT ON COLUMN public.companies.slug     IS 'URL-safe identifier. Must be lowercase, no spaces.';


-- ============================================================
-- 2.2  SUPPLY_REQUESTS TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS public.supply_requests (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id  UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,

    -- Location context captured from the floor worker's 4-dropdown screen
    plant       TEXT        NOT NULL DEFAULT '',
    department  TEXT        NOT NULL DEFAULT '',
    zone        TEXT        NOT NULL DEFAULT '',
    line        TEXT        NOT NULL DEFAULT '',

    -- Item being requested
    item_name   TEXT        NOT NULL,
    image_url   TEXT        NOT NULL DEFAULT '',

    -- Quantity requested (1–99)
    quantity    INTEGER     NOT NULL DEFAULT 1
                            CHECK (quantity BETWEEN 1 AND 99),

    -- Lifecycle status
    status      TEXT        NOT NULL DEFAULT 'Pending'
                            CHECK (status IN ('Pending', 'Ordered', 'Fulfilled', 'Denied')),

    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  public.supply_requests            IS 'Each row is one floor-worker supply request.';
COMMENT ON COLUMN public.supply_requests.company_id IS 'Tenant isolation key — all queries must filter by this.';
COMMENT ON COLUMN public.supply_requests.status     IS 'Lifecycle: Pending → Ordered → Fulfilled (or Denied).';

-- Indexes for common dashboard and real-time queries
CREATE INDEX IF NOT EXISTS idx_sr_company_status
    ON public.supply_requests (company_id, status);

CREATE INDEX IF NOT EXISTS idx_sr_created_at
    ON public.supply_requests (created_at DESC);


-- ============================================================
-- 2.3  ROW LEVEL SECURITY (RLS)
-- ============================================================

ALTER TABLE public.companies        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supply_requests  ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------
-- companies: anyone (anon) can read — the app looks up the
-- company by slug to get its UUID before doing anything.
-- ---------------------------------------------------------
CREATE POLICY "anon_read_companies"
    ON public.companies
    FOR SELECT
    TO anon
    USING (true);

CREATE POLICY "anon_insert_companies"
    ON public.companies
    FOR INSERT
    TO anon
    WITH CHECK (true);

-- ---------------------------------------------------------
-- supply_requests: floor workers submit requests without
-- authentication.  The only guard is that the company_id
-- must exist in the companies table (prevents phantom inserts).
-- ---------------------------------------------------------
CREATE POLICY "anon_insert_supply_requests"
    ON public.supply_requests
    FOR INSERT
    TO anon
    WITH CHECK (
        company_id IN (SELECT id FROM public.companies)
    );

-- ---------------------------------------------------------
-- supply_requests: allow SELECT so the Supervisor Dashboard
-- can read requests.
-- MVP NOTE: Open to anon for now — Phase 5 will add proper
-- auth (Magic Link) and restrict this to authenticated users.
-- ---------------------------------------------------------
CREATE POLICY "anon_read_supply_requests"
    ON public.supply_requests
    FOR SELECT
    TO anon
    USING (true);

-- ---------------------------------------------------------
-- supply_requests: allow UPDATE so supervisors can toggle
-- status (Ordered / Fulfilled / Denied).
-- MVP NOTE: Same auth caveat as above — tighten in Phase 5.
-- ---------------------------------------------------------
CREATE POLICY "anon_update_supply_requests"
    ON public.supply_requests
    FOR UPDATE
    TO anon
    USING (true)
    WITH CHECK (true);


-- ============================================================
-- SEED DATA — AutoRise as the first tenant
-- ============================================================

INSERT INTO public.companies (name, slug)
VALUES ('AutoRise', 'autorise')
ON CONFLICT (slug) DO NOTHING;

-- ============================================================
-- VERIFY (optional — run these SELECTs to confirm)
-- ============================================================

-- SELECT * FROM public.companies;
-- SELECT * FROM public.supply_requests LIMIT 10;
