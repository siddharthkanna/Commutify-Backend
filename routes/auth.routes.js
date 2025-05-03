const express = require("express");
const router = express.Router();
const UserController = require("../controllers/user.controller");
const isAuthenticated = require("../middleware/auth.middleware");


router.post("/login", UserController.handleAuth);
router.post("/create", UserController.createNewUser);

router.use("/user", isAuthenticated);
router.post("/user/update", UserController.updateUserDetails);
router.get("/user/details", UserController.getUserDetails);
router.get("/user/preferences", UserController.getUserPreferences);
router.post("/user/preferences/update", UserController.updateUserPreferences);

// Rating Routes
router.use("/ratings", isAuthenticated);
router.post("/ratings/submit", UserController.submitRating);
router.get("/ratings", UserController.getUserRatings);

// Vehicle Routes
router.use(isAuthenticated);
router.get("/vehicles", UserController.getVehicles);
router.post("/vehicles/add", UserController.addVehicle);
router.post("/vehicles/update/:vehicleId", UserController.updateVehicle);
router.post("/vehicles/delete/:vehicleId", UserController.deleteVehicle);

module.exports = router;
