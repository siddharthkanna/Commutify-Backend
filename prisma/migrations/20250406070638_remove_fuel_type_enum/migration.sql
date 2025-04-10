/*
  Warnings:

  - We're converting the `fuelType` enum to a string on the `Vehicle` table
*/

-- Modify the column type while preserving data
ALTER TABLE "Vehicle" 
  ALTER COLUMN "fuelType" TYPE TEXT;

-- DropEnum
DROP TYPE "FuelType";
