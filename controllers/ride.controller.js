// controllers/rideController.js
const Ride = require("../models/Ride");
const User = require("../models/user");

// Publish a new ride
exports.publishRide = async (req, res) => {
  try {
    const {
      driverId,
      pickupLocation,
      destinationLocation,
      immediateMode,
      scheduledMode,
      selectedVehicle,
      selectedCapacity,
      selectedDate,
      selectedTime,
      price,
      userRole,
    } = req.body;

    // Create a new ride object
    const newRide = new Ride({
      driverId,
      pickupLocation,
      destinationLocation,
      immediateMode,
      scheduledMode,
      selectedVehicle,
      selectedCapacity,
      selectedDate,
      selectedTime,
      price,
      userRole,
      rideType: "published",
    });

    // Save the ride in the database
    await newRide.save();

    res.status(201).json({ message: "Ride published successfully" });
  } catch (err) {
    res.status(500).json({ err });
  }
};

exports.fetchPublishedRides = async (req, res) => {
  try {
    const driverId = req.query.driverId; // Get the driverId from the query parameters

    // Find the user in the users collection based on the driverId
    const user = await User.findOne({ uid: driverId });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Fetch the published rides for the user based on the driverId
    const publishedRides = await Ride.find({ driverId });

    // You can now process the publishedRides array to extract the required details
    // For example, if you need to extract the pickup location name, destination location name, etc.:
    const ridesData = publishedRides.map((ride) => {
      return {
        driverName: user.name,
        pickupLocationName: ride.pickupLocation[0]?.placeName,
        destinationLocationName: ride.destinationLocation[0]?.placeName,
        price: ride.price,
        selectedDate: ride.selectedDate,
        selectedTime: ride.selectedTime,
        selectedCapacity: ride.selectedCapacity,
        vehicleName: ride.selectedVehicle,
        // Add other fields as needed
      };
    });

    res.json(ridesData);
  } catch (err) {
    res.status(500).json({ message: "Internal server error" });
  }
};
