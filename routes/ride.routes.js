const express = require("express");
const router = express.Router();
const RidesController = require("../controllers/ride.controller");

router.post("/publishRide", RidesController.publishRide);
router.get("/fetchPublishedRides", RidesController.fetchPublishedRides);
router.get("/fetchBookedRides", RidesController.fetchBookedRides);
router.get("/fetchAvailableRides", RidesController.fetchAvailableRides);
router.post("/bookRide", RidesController.bookRide);
router.post("/completeRide/:rideId", RidesController.completeRide);
router.post("/cancelRideDriver/:rideId", RidesController.cancelRideByDriver);
router.post(
  "/cancelRidePassenger/:rideId",
  RidesController.cancelRideByPassenger
);

module.exports = router;
