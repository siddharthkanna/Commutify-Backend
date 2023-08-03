const Ride = require("../models/Ride");
const User = require("../models/user");

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
    if (ride.passengerId.includes(passengerId)) {
      return res
        .status(400)
        .json({ message: "Ride is already booked by the passenger" });
    }

    // Check if there are available seats
    if (ride.passengerId.length >= ride.selectedCapacity) {
      return res
        .status(400)
        .json({ message: "No available seats for this ride" });
    }

    // Update the ride with the new passenger ID
    ride.passengerId.push(passengerId);
    ride.rideType = "booked";
    ride.rideStatus = "Upcoming";
    await ride.save();

    res.json({ message: "Ride booked successfully" });
  } catch (err) {
    res.status(500).json({ message: "Internal server error" });
  }
};

exports.fetchPublishedRides = async (req, res) => {
  try {
    const driverId = req.query.driverId;

    const user = await User.findOne({ uid: driverId });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const publishedRides = await Ride.find({ driverId });

    const ridesData = publishedRides.map((ride) => {
      return {
        rideId: ride._id,
        driverName: user.name,
        pickupLocation: {
          latitude: ride.pickupLocation[0].latitude,
          longitude: ride.pickupLocation[0].longitude,
          placeName: ride.pickupLocation[0].placeName,
        },
        destinationLocation: {
          latitude: ride.destinationLocation[0].latitude,
          longitude: ride.destinationLocation[0].longitude,
          placeName: ride.destinationLocation[0].placeName,
        },
        price: ride.price,
        selectedDate: ride.selectedDate,
        selectedTime: ride.selectedTime,
        selectedCapacity: ride.selectedCapacity,
        vehicleName: ride.selectedVehicle,
        rideStatus: ride.rideStatus,
      };
    });

    res.json(ridesData);
  } catch (err) {
    res.status(502).json({ err });
  }
};

exports.fetchBookedRides = async (req, res) => {
  try {
    const passengerId = req.query.passengerId;

    const user = await User.findOne({ uid: passengerId });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const bookedRides = await Ride.find({
      passengerId: { $in: [passengerId] },
    });

    const ridesData = [];

    for (const ride of bookedRides) {
      const driver = await User.findOne({ uid: ride.driverId });

      if (driver) {
        ridesData.push({
          rideId: ride._id,
          driverName: driver.name,
          pickupLocation: {
            latitude: ride.pickupLocation[0].latitude,
            longitude: ride.pickupLocation[0].longitude,
            placeName: ride.pickupLocation[0].placeName,
          },
          destinationLocation: {
            latitude: ride.destinationLocation[0].latitude,
            longitude: ride.destinationLocation[0].longitude,
            placeName: ride.destinationLocation[0].placeName,
          },
          price: ride.price,
          selectedDate: ride.selectedDate,
          selectedTime: ride.selectedTime,
          selectedCapacity: ride.selectedCapacity,
          vehicleName: ride.selectedVehicle,
          rideStatus: ride.rideStatus,
          passengerIds: ride.passengerId, // Include all passenger IDs
        });
      }
    }

    res.json(ridesData);
  } catch (err) {
    res.status(502).json({ err });
  }
};

exports.fetchAvailableRides = async (req, res) => {
  try {
    const driverId = req.query.driverId;

    // Query for published rides, excluding the ones posted by the current driver
    const publishedRides = await Ride.find({ driverId: { $ne: driverId } });

    const ridesData = [];

    for (const ride of publishedRides) {
      const user = await User.findOne({ uid: ride.driverId });

      if (user) {
        ridesData.push({
          rideId: ride._id,
          driverName: user.name,
          pickupLocation: {
            latitude: ride.pickupLocation[0].latitude,
            longitude: ride.pickupLocation[0].longitude,
            placeName: ride.pickupLocation[0].placeName,
          },
          destinationLocation: {
            latitude: ride.destinationLocation[0].latitude,
            longitude: ride.destinationLocation[0].longitude,
            placeName: ride.destinationLocation[0].placeName,
          },
          price: ride.price,
          selectedDate: ride.selectedDate,
          selectedTime: ride.selectedTime,
          selectedCapacity: ride.selectedCapacity,
          vehicleName: ride.selectedVehicle,
          rideStatus: ride.rideStatus,

          // Add other fields as needed
        });
      }
    }

    res.json(ridesData);
  } catch (err) {
    res.status(502).json({ err });
  }
};
