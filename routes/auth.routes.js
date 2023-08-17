const express = require("express");
const router = express.Router();
const UserController = require("../controllers/user.controller");

//User Routes
router.post("/addUser", UserController.createUser);
router.post("/exists", UserController.checkUserExists);
router.post("/updateUserDetails", UserController.updateUserDetails);
router.get("/getUserDetails/:userId", UserController.getUserDetails);

//Vehicle Routes
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
