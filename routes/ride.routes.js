const express = require("express");
const router = express.Router();
const RidesController = require("../controllers/ride.controller");

router.post("/publishride", RidesController.publishRide);
router.get("/fetchPublishedRides", RidesController.fetchPublishedRides);
router.get("/fetchBookedRides", RidesController.fetchBookedRides);
router.get("/fetchAvailableRides", RidesController.fetchAvailableRides);
router.post("/bookRide", RidesController.bookRide);

module.exports = router;
