const prisma = require("../prisma/prisma-client");

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

    // Find the user by uid
    const user = await prisma.user.findUnique({
      where: { uid: driverId },
      include: { vehicles: true }
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Find the vehicle
    const vehicle = await prisma.vehicle.findFirst({
      where: {
        vehicleNumber: selectedVehicle.vehicleNumber,
        ownerId: user.id
      }
    });

    if (!vehicle) {
      return res.status(404).json({ message: "Vehicle not found" });
    }

    // Create pickup and destination locations
    const newRide = await prisma.ride.create({
      data: {
        driverId: user.id,
        vehicleId: vehicle.id,
        immediateMode,
        scheduledMode,
        selectedCapacity,
        selectedDate: new Date(selectedDate),
        selectedTime,
        price,
        rideType: "published",
        pickupLocations: {
          create: [
            {
              latitude: pickupLocation[0].latitude,
              longitude: pickupLocation[0].longitude,
              placeName: pickupLocation[0].placeName
            }
          ]
        },
        destinationLocations: {
          create: [
            {
              latitude: destinationLocation[0].latitude,
              longitude: destinationLocation[0].longitude,
              placeName: destinationLocation[0].placeName
            }
          ]
        }
      }
    });

    res.status(201).json({ message: "Ride published successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

exports.bookRide = async (req, res) => {
  try {
    const { rideId, passengerId } = req.body;

    // Find the user by uid
    const passenger = await prisma.user.findUnique({
      where: { uid: passengerId }
    });

    if (!passenger) {
      return res.status(404).json({ message: "Passenger not found" });
    }

    // Find the ride by its ID
    const ride = await prisma.ride.findUnique({
      where: { id: rideId },
      include: { bookings: true }
    });

    if (!ride) {
      return res.status(404).json({ message: "Ride not found" });
    }

    // Check if the ride is already booked by this passenger
    const existingBooking = await prisma.booking.findFirst({
      where: {
        rideId: ride.id,
        passengerId: passenger.id
      }
    });

    if (existingBooking) {
      return res.status(400).json({ message: "Ride is already booked by the passenger" });
    }

    // Check if there are available seats
    if (ride.bookings.length >= ride.selectedCapacity) {
      return res.status(400).json({ message: "No available seats for this ride" });
    }

    // Get the ride driver
    const driver = await prisma.user.findUnique({
      where: { id: ride.driverId }
    });

    // Create a new booking
    await prisma.booking.create({
      data: {
        passengerId: passenger.id,
        driverId: driver.id,
        rideId: ride.id,
        source: ride.pickupLocations[0]?.placeName || "Unknown",
        destination: ride.destinationLocations[0]?.placeName || "Unknown",
        status: "ongoing"
      }
    });

    // Update the ride
    await prisma.ride.update({
      where: { id: ride.id },
      data: {
        rideType: "booked",
        rideStatus: "Upcoming"
      }
    });

    res.json({ message: "Ride booked successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Internal server error", error: err.message });
  }
};

exports.fetchPublishedRides = async (req, res) => {
  try {
    const driverId = req.query.driverId;

    // Find the user by uid
    const user = await prisma.user.findUnique({
      where: { uid: driverId }
    });

    if (!user) {
      console.log("User not found!");
      return res.status(404).json({ message: "User not found" });
    }

    // Find rides by driver id
    const publishedRides = await prisma.ride.findMany({
      where: { driverId: user.id },
      include: {
        pickupLocations: true,
        destinationLocations: true,
        bookings: {
          include: {
            passenger: true
          }
        },
        vehicle: true
      }
    });

    const ridesData = publishedRides.map(ride => {
      const passengerInfo = ride.bookings.map(booking => {
        const passenger = booking.passenger;
        return {
          passengerId: passenger.uid,
          passengerName: passenger.name,
          passengerStatus: booking.status,
          passengerPhotoUrl: passenger.photoUrl,
          passengerNumber: passenger.mobileNumber
        };
      });

      const vehicleDetails = {
        vehicleName: ride.vehicle.vehicleName,
        vehicleNumber: ride.vehicle.vehicleNumber,
        vehicleType: ride.vehicle.vehicleType
      };

      return {
        rideId: ride.id,
        driverName: user.name,
        pickupLocation: ride.pickupLocations[0],
        destinationLocation: ride.destinationLocations[0],
        price: ride.price,
        selectedDate: ride.selectedDate,
        selectedTime: ride.selectedTime,
        selectedCapacity: ride.selectedCapacity,
        vehicle: vehicleDetails,
        rideStatus: ride.rideStatus,
        passengerInfo: passengerInfo
      };
    });

    res.json(ridesData);
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: err.message });
  }
};

exports.fetchBookedRides = async (req, res) => {
  try {
    const passengerId = req.query.passengerId;

    // Find the user by uid
    const user = await prisma.user.findUnique({
      where: { uid: passengerId }
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Find bookings for this passenger
    const bookings = await prisma.booking.findMany({
      where: { passengerId: user.id },
      include: {
        ride: {
          include: {
            driver: true,
            vehicle: true,
            pickupLocations: true,
            destinationLocations: true
          }
        }
      }
    });

    const ridesData = bookings.map(booking => {
      const ride = booking.ride;
      const driver = ride.driver;

      return {
        rideId: ride.id,
        driverName: driver.name,
        driverNumber: driver.mobileNumber,
        photoUrl: driver.photoUrl,
        pickupLocation: ride.pickupLocations[0] ? {
          latitude: ride.pickupLocations[0].latitude,
          longitude: ride.pickupLocations[0].longitude,
          placeName: ride.pickupLocations[0].placeName
        } : null,
        destinationLocation: ride.destinationLocations[0] ? {
          latitude: ride.destinationLocations[0].latitude,
          longitude: ride.destinationLocations[0].longitude,
          placeName: ride.destinationLocations[0].placeName
        } : null,
        price: ride.price,
        selectedDate: ride.selectedDate,
        selectedTime: ride.selectedTime,
        selectedCapacity: ride.selectedCapacity,
        vehicle: {
          vehicleName: ride.vehicle.vehicleName,
          vehicleNumber: ride.vehicle.vehicleNumber,
          vehicleType: ride.vehicle.vehicleType
        },
        rideStatus: ride.rideStatus,
        passengerStatus: booking.status,
        passengerName: user.name
      };
    });

    res.json(ridesData);
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: err.message });
  }
};

exports.fetchAvailableRides = async (req, res) => {
  try {
    const driverId = req.query.driverId;

    // Find the user by uid
    const user = await prisma.user.findUnique({
      where: { uid: driverId }
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Find all rides not by this driver and not completed
    const availableRides = await prisma.ride.findMany({
      where: {
        NOT: { driverId: user.id },
        rideStatus: { not: "Completed" }
      },
      include: {
        driver: true,
        vehicle: true,
        pickupLocations: true,
        destinationLocations: true
      }
    });

    const ridesData = availableRides.map(ride => {
      return {
        rideId: ride.id,
        driverName: ride.driver.name,
        photoUrl: ride.driver.photoUrl,
        pickupLocation: ride.pickupLocations[0] ? {
          latitude: ride.pickupLocations[0].latitude,
          longitude: ride.pickupLocations[0].longitude,
          placeName: ride.pickupLocations[0].placeName
        } : null,
        destinationLocation: ride.destinationLocations[0] ? {
          latitude: ride.destinationLocations[0].latitude,
          longitude: ride.destinationLocations[0].longitude,
          placeName: ride.destinationLocations[0].placeName
        } : null,
        price: ride.price,
        selectedDate: ride.selectedDate,
        selectedTime: ride.selectedTime,
        selectedCapacity: ride.selectedCapacity,
        vehicle: {
          vehicleName: ride.vehicle.vehicleName,
          vehicleNumber: ride.vehicle.vehicleNumber,
          vehicleType: ride.vehicle.vehicleType
        },
        rideStatus: ride.rideStatus
      };
    });

    res.json(ridesData);
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: err.message });
  }
};

//Complete Ride
exports.completeRide = async (req, res) => {
  try {
    const rideId = req.params.rideId;

    // Find the ride
    const ride = await prisma.ride.findUnique({
      where: { id: rideId },
      include: { bookings: true }
    });

    if (!ride) {
      return res.status(404).json({ message: "Ride not found" });
    }

    // Update ride status
    await prisma.ride.update({
      where: { id: rideId },
      data: { rideStatus: "Completed" }
    });

    // Update all bookings for this ride
    for (const booking of ride.bookings) {
      await prisma.booking.update({
        where: { id: booking.id },
        data: { status: "confirmed" }
      });
    }

    res.json({ message: "Ride completed successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error completing the ride", error: err.message });
  }
};

exports.cancelRideByDriver = async (req, res) => {
  try {
    const rideId = req.params.rideId;

    // Find the ride
    const ride = await prisma.ride.findUnique({
      where: { id: rideId },
      include: { bookings: true }
    });

    if (!ride) {
      return res.status(404).json({ message: "Ride not found" });
    }

    // Check if the ride is already completed or canceled
    if (ride.rideStatus === "Completed" || ride.rideStatus === "Cancelled") {
      return res.status(400).json({
        message: "Cannot cancel a completed or already canceled ride",
      });
    }

    // Update all bookings for this ride
    for (const booking of ride.bookings) {
      await prisma.booking.update({
        where: { id: booking.id },
        data: { status: "cancelled" }
      });
    }

    // Update ride status
    await prisma.ride.update({
      where: { id: rideId },
      data: { rideStatus: "Cancelled" }
    });

    res.json({ message: "Ride cancelled successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Internal server error", error: err.message });
  }
};

// Passenger cancels the ride
exports.cancelRideByPassenger = async (req, res) => {
  try {
    const rideId = req.params.rideId;
    const passengerId = req.query.passengerId; // Get the passenger ID from the query parameter

    // Find user by uid
    const user = await prisma.user.findUnique({
      where: { uid: passengerId }
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Find the ride
    const ride = await prisma.ride.findUnique({
      where: { id: rideId }
    });

    if (!ride) {
      return res.status(404).json({ message: "Ride not found" });
    }

    // Find booking for this passenger and ride
    const booking = await prisma.booking.findFirst({
      where: {
        rideId: rideId,
        passengerId: user.id
      }
    });

    if (!booking) {
      return res.status(400).json({ message: "Passenger is not part of the ride" });
    }

    // Update booking status
    await prisma.booking.update({
      where: { id: booking.id },
      data: { status: "cancelled" }
    });

    res.json({ message: "Ride cancelled successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Internal server error", error: err.message });
  }
};
