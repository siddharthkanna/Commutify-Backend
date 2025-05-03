const express = require("express");
const router = express.Router();
const RidesController = require("../controllers/ride.controller");
const isAuthenticated = require("../middleware/auth.middleware");

router.use(isAuthenticated);

router.get("/fetchAvailableRides", RidesController.fetchAvailableRides);
router.post("/publishRide", RidesController.publishRide);

router.get("/driver-rides", RidesController.fetchPublishedRides);
router.get("/passenger-rides", RidesController.fetchBookedRides);

router.post("/book/:rideId", RidesController.bookRide);
router.post("/complete/:rideId", RidesController.completeRide);
router.post("/cancel/:rideId", RidesController.cancelRide);

router.get("/ride-stats", RidesController.getRideStats);

module.exports = router;
