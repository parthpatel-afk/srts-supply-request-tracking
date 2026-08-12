-- Migration: Fix RLS for Demo Onboarding
-- Author: Antigravity

-- 1. Enable anonymous inserts for companies
CREATE POLICY "Allow anonymous company creation" 
ON public.companies 
FOR INSERT 
TO anon 
WITH CHECK (true);

-- 2. Enable anonymous inserts for managers (to create the admin account)
CREATE POLICY "Allow anonymous manager creation" 
ON public.managers 
FOR INSERT 
TO anon 
WITH CHECK (true);

-- 3. Verify that inventory_items also allows inserts (if needed)
-- Note: schema.sql already allows "Inventory is manageable by anyone" (ALL)
