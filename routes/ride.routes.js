const express = require("express");
const router = express.Router();
const RidesController = require("../controllers/ride.controller");

// === RIDE MANAGEMENT ===
// Collection routes
router.get("/rides", RidesController.fetchAvailableRides);
router.post("/publishRide", RidesController.publishRide);

// Driver-specific ride collections
router.get("/users/:userId/driver-rides", RidesController.fetchPublishedRides);

// Passenger-specific ride collections
router.get("/users/:userId/passenger-rides", RidesController.fetchBookedRides);

// Individual ride resource routes
router.post("/rides/:rideId/book", RidesController.bookRide);
router.post("/rides/:rideId/complete", RidesController.completeRide);
router.post("/rides/:rideId/cancel", RidesController.cancelRide);

// === RIDE STATISTICS ===
router.get("/users/:userId/ride-stats", RidesController.getRideStats);

// === MESSAGING ===
router.post("/messages", RidesController.sendMessage);
router.get("/users/:userId/messages/:otherUserId", RidesController.getMessages);

// === LEGACY ROUTES (DEPRECATED) ===
// These should eventually be removed after clients update
router.get("/fetchPublishedRides", RidesController.fetchPublishedRides);
router.get("/fetchBookedRides", RidesController.fetchBookedRides);
router.get("/fetchAvailableRides", RidesController.fetchAvailableRides);
router.post("/bookRide", RidesController.bookRide);
router.post("/completeRide/:rideId", RidesController.completeRide);
router.post("/cancelRide/:rideId", RidesController.cancelRide);

module.exports = router;
