const express = require("express");
const router = express.Router();
const UserController = require("../controllers/user.controller");

// New optimized auth route for Supabase integration
router.post("/auth", UserController.handleAuth);

// Legacy routes maintained for backward compatibility
router.post("/addUser", UserController.createUser);
router.post("/exists", UserController.checkUserExists);

// User management routes
router.post("/updateUserDetails", UserController.updateUserDetails);
router.get("/getUserDetails/:userId", UserController.getUserDetails);

// User Preferences Routes
router.get("/preferences/:userId", UserController.getUserPreferences);
router.post("/preferences/update/:userId", UserController.updateUserPreferences);

// Rating Routes
router.post("/ratings/submit", UserController.submitRating);
router.get("/ratings/:userId", UserController.getUserRatings);

// Vehicle Routes
router.get("/vehicles/:userId", UserController.getVehicles);
router.post("/vehicles/addVehicle/:userId", UserController.addVehicle);
router.post(
  "/vehicles/updateVehicle/:userId/:vehicleId",
  UserController.updateVehicle
);
router.post(
  "/vehicles/deleteVehicle/:userId/:vehicleId",
  UserController.deleteVehicle
);

module.exports = router;
