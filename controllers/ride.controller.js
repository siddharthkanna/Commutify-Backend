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

    ride.passengerId.push({ id: passengerId.toString(), status: "Upcoming" });
    ride.rideType = "booked";
    ride.rideStatus = "Upcoming";
    ride.selectedCapacity -= 1;

    await ride.save();

    res.json({ message: "Ride booked successfully" });
  } catch (err) {
    res.status(500).json({ message: "Internal server error", err });
  }
};

exports.fetchPublishedRides = async (req, res) => {
  try {
    const driverId = req.query.driverId;

    const user = await User.findOne({ uid: driverId });

    if (!user) {
      console.log("User not found!");
      return res.status(404).json({ message: "User not found" });
    }

    const publishedRides = await Ride.find({ driverId });

    const ridesData = await Promise.all(
      publishedRides.map(async (ride) => {
        const passengerInfo = await Promise.all(
          ride.passengerId.map(async (passenger) => {
            // Populate passenger information
            const passengerUser = await User.findOne({ uid: passenger.id });
            return {
              passengerId: passenger.id,
              passengerName: passengerUser
                ? passengerUser.name
                : "Unknown Passenger",
              passengerStatus: passenger.status,
              passengerPhotoUrl: passengerUser ? passengerUser.photoUrl : null,
              passengerNumber: passengerUser.mobileNumber.toString(),
            };
          })
        );

        const vehicleDetails = {
          vehicleName: ride.selectedVehicle.vehicleName,
          vehicleNumber: ride.selectedVehicle.vehicleNumber,
          vehicleType: ride.selectedVehicle.vehicleType,
        };

        return {
          rideId: ride._id,
          driverName: user.name,
          pickupLocation: ride.pickupLocation[0],
          destinationLocation: ride.destinationLocation[0],
          price: ride.price,
          selectedDate: ride.selectedDate,
          selectedTime: ride.selectedTime,
          selectedCapacity: ride.selectedCapacity,
          vehicle: vehicleDetails,
          rideStatus: ride.rideStatus,
          passengerInfo: passengerInfo,
        };
      })
    );

    res.json(ridesData);
  } catch (err) {
    console.log(err);
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
      "passengerId.id": passengerId,
    });

    const ridesData = [];

    for (const ride of bookedRides) {
      const driver = await User.findOne({ uid: ride.driverId });

      if (driver) {
        const passenger = ride.passengerId.find(
          (passenger) => passenger.id === passengerId
        );

        const passengerStatus = passenger ? passenger.status : "Unknown";
        const passengerName = passenger ? user.name : "Unknown";

        const vehicleDetails = {
          vehicleName: ride.selectedVehicle.vehicleName,
          vehicleNumber: ride.selectedVehicle.vehicleNumber,
          vehicleType: ride.selectedVehicle.vehicleType,
        };

        ridesData.push({
          rideId: ride._id,
          driverName: driver.name,
          driverNumber: driver.mobileNumber.toString(),
          photoUrl: driver.photoUrl,
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
          vehicle: vehicleDetails,
          rideStatus: ride.rideStatus,
          passengerStatus: passengerStatus,
          passengerName: passengerName,
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

    const publishedRides = await Ride.find({
      driverId: { $ne: driverId },
      rideStatus: { $ne: "Completed" },
    });

    const ridesData = [];

    for (const ride of publishedRides) {
      const user = await User.findOne({ uid: ride.driverId });

      if (user) {
        ridesData.push({
          rideId: ride._id,
          driverName: user.name,
          photoUrl: user.photoUrl,
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
          vehicle: ride.selectedVehicle,
          rideStatus: ride.rideStatus,
        });
      }
    }

    res.json(ridesData);
  } catch (err) {
    res.status(502).json({ err });
  }
};

//Complete Ride
exports.completeRide = async (req, res) => {
  try {
    const rideId = req.params.rideId;

    const ride = await Ride.findById(rideId);

    if (!ride) {
      return res.status(404).json({ message: "Ride not found" });
    }

    ride.rideStatus = "Completed";
    await ride.save();

    const driver = await User.findOne({ uid: ride.driverId });
    if (driver) {
      driver.ridesAsDriver.push(ride);
      await driver.save();
    }

    for (const passenger of ride.passengerId) {
      const passengerId = passenger.id;
      const passengerToUpdate = await User.findOne({ uid: passengerId });
      if (passengerToUpdate) {
        passengerToUpdate.ridesAsPassenger.push(ride);
        passenger.status = "Completed";
        await passengerToUpdate.save();
      }
    }

    res.json({ message: "Ride completed successfully" });
  } catch (err) {
    res.status(500).json({ message: "Error completing the ride", error: err });
  }
};

exports.cancelRideByDriver = async (req, res) => {
  try {
    const rideId = req.params.rideId;

    // Find the ride by its ID
    const ride = await Ride.findById(rideId);

    if (!ride) {
      return res.status(404).json({ message: "Ride not found" });
    }

    // Get the driverId from the ride
    const driverId = ride.driverId;

    // Check if the ride is already completed or canceled
    if (ride.rideStatus === "Completed" || ride.rideStatus === "Cancelled") {
      return res.status(400).json({
        message: "Cannot cancel a completed or already canceled ride",
      });
    }

    // Set the status of all passengers to "Cancelled"
    for (const passenger of ride.passengerId) {
      passenger.status = "Cancelled";
      const passengerToUpdate = await User.findOne({ uid: passenger.id });
      if (passengerToUpdate) {
        passengerToUpdate.ridesAsPassenger =
          passengerToUpdate.ridesAsPassenger.filter(
            (rideId) => rideId.toString() !== ride._id.toString()
          );
        await passengerToUpdate.save();
      }
    }

    // Update the ride status to "Cancelled"
    ride.rideStatus = "Cancelled";
    await ride.save();

    // Remove the ride from the driver's ridesAsDriver array
    const driver = await User.findOne({ uid: driverId });
    if (driver) {
      driver.ridesAsDriver = driver.ridesAsDriver.filter(
        (rideId) => rideId.toString() !== ride._id.toString()
      );
      await driver.save();
    }

    res.json({ message: "Ride cancelled successfully" });
  } catch (err) {
    res.status(500).json({ message: "Internal server error", error: err });
  }
};

// Passenger cancels the ride
exports.cancelRideByPassenger = async (req, res) => {
  try {
    const rideId = req.params.rideId;
    const passengerId = req.query.passengerId; // Get the passenger ID from the query parameter

    // Find the ride by its ID
    const ride = await Ride.findById(rideId);

    if (!ride) {
      return res.status(404).json({ message: "Ride not found" });
    }

    // Find the passenger in the ride's passengerId array
    const passenger = ride.passengerId.find(
      (passenger) => passenger.id === passengerId
    );

    if (!passenger) {
      return res
        .status(400)
        .json({ message: "Passenger is not part of the ride" });
    }

    passenger.status = "Cancelled";

    ride.selectedCapacity += 1;

    await ride.save();

    res.json({ message: "Ride cancelled successfully" });
  } catch (err) {
    res.status(500).json({ message: "Internal server error", error: err });
  }
};
