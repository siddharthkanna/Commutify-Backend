const express = require("express");
const router = express.Router();
const RidesController = require("../controllers/ride.controller");

// Ride management routes
router.post("/publishRide", RidesController.publishRide);
router.get("/fetchPublishedRides", RidesController.fetchPublishedRides);
router.get("/fetchBookedRides", RidesController.fetchBookedRides);
router.get("/fetchAvailableRides", RidesController.fetchAvailableRides);
router.post("/bookRide", RidesController.bookRide);
router.post("/completeRide/:rideId", RidesController.completeRide);

// New unified cancel ride route
router.post("/cancelRide/:rideId", RidesController.cancelRide);

// Legacy routes for backward compatibility
router.post("/cancelRideDriver/:rideId", RidesController.cancelRideByDriver);
router.post(
  "/cancelRidePassenger/:rideId",
  RidesController.cancelRideByPassenger
);

// Messaging routes
router.post("/messages/send", RidesController.sendMessage);
router.get("/messages/:userUid/:otherUserUid", RidesController.getMessages);

module.exports = router;
