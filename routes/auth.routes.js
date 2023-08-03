const express = require("express");
const router = express.Router();
const UserController = require("../controllers/user.controller");

router.post("/addUser", UserController.createUser);
router.post("/exists", UserController.checkUserExists);
router.get("/vehicles/:userId", UserController.getVehiclesByUserId);


module.exports = router;
