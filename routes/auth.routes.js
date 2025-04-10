const express = require("express");
const router = express.Router();
const UserController = require("../controllers/user.controller");

// New optimized auth route for Supabase integration
router.post("/login", UserController.handleAuth);

// User creation route
// POST /create
// {
//   uid: string - required,
//   email: string - required,
//   name: string - optional,
//   photoUrl: string - optional,
//   mobileNumber: string - optional,
//   role: string - optional (default: 'PASSENGER'),
//   vehicle: { - optional vehicle details
//     vehicleNumber: string - required if vehicle provided,
//     vehicleName: string - required if vehicle provided,
//     vehicleType: string - required if vehicle provided,
//     capacity: number - optional,
//     color: string - optional,
//     make: string - optional,
//     model: string - optional,
//     year: number - optional,
//     fuelType: string - optional,
//     fuelEfficiency: number - optional,
//     features: string[] - optional
//   }
// }
router.post("/create", UserController.createNewUser);

// Legacy routes maintained for backward compatibility
router.post("/addUser", UserController.createUser);
router.post("/exists", UserController.checkUserExists);

// User management routes
router.post("/user/update", UserController.updateUserDetails);
router.get("/user/details/:userId", UserController.getUserDetails);

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
