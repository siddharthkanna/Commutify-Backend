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

      rideType: "published",
    });

    // Save the ride in the database
    await newRide.save();

    res.status(201).json({ message: "Ride published successfully" });
  } catch (err) {
    res.status(500).json({ err });
  }
};

exports.bookRide = async (req, res) => {
  try {
    const { rideId, passengerId } = req.body;

    // Find the ride by its ID
    const ride = await Ride.findById(rideId);

    if (!ride) {
      return res.status(404).json({ message: "Ride not found" });
    }

    // Check if the ride is already booked
    if (ride.passengerId) {
      return res.status(400).json({ message: "Ride is already booked" });
    }

    // Update the ride with passenger details
    ride.passengerId = passengerId;
    ride.rideType = "booked"; // Update the rideType to "booked"
    await ride.save();

    res.json({ message: "Ride booked successfully" });
  } catch (err) {
    res.status(500).json({ message: "Internal server error" });
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
        rideId: ride._id,
        driverName: user.name,
        pickup: ride.pickupLocation[0]?.placeName,
        destination: ride.destinationLocation[0]?.placeName,
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
    res.status(502).json({ err });
  }
};
