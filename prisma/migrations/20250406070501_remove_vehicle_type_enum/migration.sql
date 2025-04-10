/*
  Warnings:

  - We're converting the `vehicleType` enum to a string on the `Vehicle` table
*/

-- Modify the column type while preserving data
ALTER TABLE "Vehicle" 
  ALTER COLUMN "vehicleType" TYPE TEXT;

-- DropEnum
DROP TYPE "VehicleType";

-- Note: No need to create index since it already exists
