-- This is an empty migration.

-- This migration ensures there are no duplicate vehicleNumber entries

-- Check and remove any duplicate vehicleNumber entries (keeping the most recent one)
-- First, create a temporary table to store the duplicates to be removed
CREATE TEMP TABLE IF NOT EXISTS duplicate_vehicles AS
SELECT id, "vehicleNumber", row_number() OVER (PARTITION BY "vehicleNumber" ORDER BY "createdAt" DESC) as rn
FROM "Vehicle";

-- Delete all but the most recent entry for each vehicleNumber
DELETE FROM "Vehicle"
WHERE id IN (
  SELECT id FROM duplicate_vehicles WHERE rn > 1
);