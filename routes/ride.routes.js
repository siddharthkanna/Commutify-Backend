const express = require("express");
const router = express.Router();
const RidesController = require("../controllers/ride.controller");

router.post("/publishride", RidesController.publishRide);
router.get('/fetchPublishedRides', RidesController.fetchPublishedRides);

module.exports = router;
