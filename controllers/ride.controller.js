const prisma = require("../prisma/prisma-client");

exports.publishRide = async (req, res) => {
  try {
    const {
      driverId,
      pickupLocation,
      destinationLocation,
      waypoints,
      immediateMode,
      scheduledMode,
      selectedVehicle,
      selectedCapacity,
      selectedDate,
      selectedTime,
      price,
      pricePerKm,
      estimatedDuration,
      estimatedDistance,
      isRecurring,
      recurringDays,
      notes
    } = req.body;

    // Find the user by uid
    const user = await prisma.findUserWithVehicles(driverId);

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

    // Prepare ride data
    const rideData = {
      driverId: user.id,
      vehicleId: vehicle.id,
      immediateMode: immediateMode || false,
      scheduledMode: scheduledMode || true,
      selectedCapacity,
      selectedDate: new Date(selectedDate),
      selectedTime: new Date(selectedTime), // Now using DateTime instead of String
      price,
      pricePerKm,
      estimatedDuration,
      estimatedDistance,
      isRecurring: isRecurring || false,
      recurringDays: recurringDays || [],
      notes,
      rideType: "published"
    };

    // Prepare pickup location data
    const pickupData = {
      latitude: pickupLocation[0].latitude,
      longitude: pickupLocation[0].longitude,
      placeName: pickupLocation[0].placeName,
      address: pickupLocation[0].address,
      city: pickupLocation[0].city,
      state: pickupLocation[0].state,
      country: pickupLocation[0].country,
      zipCode: pickupLocation[0].zipCode
    };

    // Prepare destination location data
    const destinationData = {
      latitude: destinationLocation[0].latitude,
      longitude: destinationLocation[0].longitude,
      placeName: destinationLocation[0].placeName,
      address: destinationLocation[0].address,
      city: destinationLocation[0].city,
      state: destinationLocation[0].state,
      country: destinationLocation[0].country,
      zipCode: destinationLocation[0].zipCode
    };

    // Create the ride with locations in a transaction
    const newRide = await prisma.$transaction(async (tx) => {
      // Create pickup location
      const pickup = await tx.location.create({ data: pickupData });
      
      // Create destination location
      const destination = await tx.location.create({ data: destinationData });
      
      // Create ride with the locations
      const ride = await tx.ride.create({
        data: {
          ...rideData,
          pickupId: pickup.id,
          destinationId: destination.id
        }
      });
      
      // Create waypoints if provided
      if (waypoints && waypoints.length > 0) {
        for (let i = 0; i < waypoints.length; i++) {
          const waypointData = {
            rideId: ride.id,
            latitude: waypoints[i].latitude,
            longitude: waypoints[i].longitude,
            placeName: waypoints[i].placeName,
            stopOrder: i + 1, // Start from 1
            estimatedArrival: waypoints[i].estimatedArrival ? new Date(waypoints[i].estimatedArrival) : null
          };
          
          await tx.waypoint.create({ data: waypointData });
        }
      }
      
      return ride;
    });

    res.status(201).json({ 
      message: "Ride published successfully",
      rideId: newRide.id
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

exports.bookRide = async (req, res) => {
  try {
    const { rideId, passengerId, passengerCount = 1, specialRequests } = req.body;

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
      include: {
        bookings: true,
        pickup: true,
        destination: true
      }
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

    // Check if passenger count is valid
    const totalBookedSeats = ride.bookings.reduce((sum, booking) => sum + (booking.passengerCount || 1), 0);
    const remainingSeats = ride.selectedCapacity - totalBookedSeats;
    
    if (passengerCount > remainingSeats) {
      return res.status(400).json({ 
        message: `Not enough seats. Only ${remainingSeats} seats available` 
      });
    }

    // Check if ride date is in the past
    if (new Date(ride.selectedDate) < new Date()) {
      return res.status(400).json({ message: "Cannot book a ride in the past" });
    }

    // Calculate payment amount (either fixed price or based on distance)
    let paymentAmount = ride.price;
    if (ride.pricePerKm && ride.estimatedDistance) {
      paymentAmount = ride.pricePerKm * ride.estimatedDistance;
    }

    // Create a new booking
    const booking = await prisma.booking.create({
      data: {
        passengerId: passenger.id,
        driverId: ride.driverId,
        rideId: ride.id,
        source: ride.pickup.placeName,
        destination: ride.destination.placeName,
        status: "ongoing",
        passengerCount,
        specialRequests,
        paymentAmount,
        paymentStatus: "PENDING",
        bookingDate: new Date()
      }
    });

    // Update the ride status if this is the first booking
    if (ride.rideType === "published") {
      await prisma.ride.update({
        where: { id: ride.id },
        data: {
          rideType: "booked",
          rideStatus: "Upcoming"
        }
      });
    }

    res.json({ 
      message: "Ride booked successfully",
      bookingId: booking.id
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Internal server error", error: err.message });
  }
};

exports.fetchPublishedRides = async (req, res) => {
  try {
    const driverId = req.query.driverId;

    // Find the user by uid
    const user = await prisma.findUserByUid(driverId);

    if (!user) {
      console.log("User not found!");
      return res.status(404).json({ message: "User not found" });
    }

    // Find rides by driver id using the utility function
    const publishedRides = await prisma.ride.findMany({
      where: { 
        driverId: user.id 
      },
      include: {
        pickup: true,
        destination: true,
        bookings: {
          include: {
            passenger: true
          }
        },
        vehicle: true,
        waypoints: {
          orderBy: {
            stopOrder: 'asc'
          }
        }
      },
      orderBy: {
        selectedDate: 'desc'
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
          passengerNumber: passenger.mobileNumber,
          passengerCount: booking.passengerCount,
          specialRequests: booking.specialRequests,
          paymentStatus: booking.paymentStatus,
          paymentAmount: booking.paymentAmount
        };
      });

      const vehicleDetails = {
        vehicleName: ride.vehicle.vehicleName,
        vehicleNumber: ride.vehicle.vehicleNumber,
        vehicleType: ride.vehicle.vehicleType,
        capacity: ride.vehicle.capacity,
        make: ride.vehicle.make,
        model: ride.vehicle.model,
        color: ride.vehicle.color,
        fuelType: ride.vehicle.fuelType
      };

      return {
        rideId: ride.id,
        driverName: user.name,
        pickupLocation: ride.pickup,
        destinationLocation: ride.destination,
        waypoints: ride.waypoints,
        price: ride.price,
        pricePerKm: ride.pricePerKm,
        selectedDate: ride.selectedDate,
        selectedTime: ride.selectedTime,
        selectedCapacity: ride.selectedCapacity,
        estimatedDuration: ride.estimatedDuration,
        estimatedDistance: ride.estimatedDistance,
        isRecurring: ride.isRecurring,
        recurringDays: ride.recurringDays,
        notes: ride.notes,
        vehicle: vehicleDetails,
        rideStatus: ride.rideStatus,
        passengerInfo: passengerInfo,
        createdAt: ride.createdAt
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
    const user = await prisma.findUserByUid(passengerId);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Find bookings for this passenger
    const bookings = await prisma.booking.findMany({
      where: { 
        passengerId: user.id 
      },
      include: {
        ride: {
          include: {
            driver: true,
            vehicle: true,
            pickup: true,
            destination: true,
            waypoints: {
              orderBy: {
                stopOrder: 'asc'
              }
            }
          }
        },
        rating: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    const ridesData = bookings.map(booking => {
      const ride = booking.ride;
      const driver = ride.driver;

      return {
        rideId: ride.id,
        bookingId: booking.id,
        driverName: driver.name,
        driverNumber: driver.mobileNumber,
        driverRating: driver.rating,
        photoUrl: driver.photoUrl,
        pickupLocation: {
          latitude: ride.pickup.latitude,
          longitude: ride.pickup.longitude,
          placeName: ride.pickup.placeName,
          address: ride.pickup.address,
          city: ride.pickup.city,
          state: ride.pickup.state
        },
        destinationLocation: {
          latitude: ride.destination.latitude,
          longitude: ride.destination.longitude,
          placeName: ride.destination.placeName,
          address: ride.destination.address,
          city: ride.destination.city,
          state: ride.destination.state
        },
        waypoints: ride.waypoints,
        price: ride.price,
        pricePerKm: ride.pricePerKm,
        selectedDate: ride.selectedDate,
        selectedTime: ride.selectedTime,
        selectedCapacity: ride.selectedCapacity,
        estimatedDuration: ride.estimatedDuration,
        estimatedDistance: ride.estimatedDistance,
        passengerCount: booking.passengerCount,
        specialRequests: booking.specialRequests,
        paymentStatus: booking.paymentStatus,
        paymentAmount: booking.paymentAmount,
        vehicle: {
          vehicleName: ride.vehicle.vehicleName,
          vehicleNumber: ride.vehicle.vehicleNumber,
          vehicleType: ride.vehicle.vehicleType,
          make: ride.vehicle.make,
          model: ride.vehicle.model,
          color: ride.vehicle.color
        },
        rideStatus: ride.rideStatus,
        bookingStatus: booking.status,
        passengerName: user.name,
        createdAt: booking.createdAt,
        rating: booking.rating
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
    const user = await prisma.findUserByUid(driverId);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Find all rides not by this driver and not completed
    const availableRides = await prisma.ride.findMany({
      where: {
        NOT: { driverId: user.id },
        rideStatus: { not: "Completed" },
        selectedDate: { gte: new Date() }
      },
      include: {
        driver: {
          include: {
            receivedRatings: true
          }
        },
        vehicle: true,
        pickup: true,
        destination: true,
        bookings: true,
        waypoints: {
          orderBy: {
            stopOrder: 'asc'
          }
        }
      },
      orderBy: [
        { selectedDate: 'asc' },
        { createdAt: 'desc' }
      ]
    });

    const ridesData = availableRides.map(ride => {
      // Calculate total booked capacity
      const totalBookedSeats = ride.bookings.reduce((sum, booking) => sum + (booking.passengerCount || 1), 0);
      
      // Calculate remaining capacity
      const remainingCapacity = ride.selectedCapacity - totalBookedSeats;
      
      // Only include rides with available capacity
      if (remainingCapacity <= 0) {
        return null;
      }

      // Calculate driver rating
      let driverRating = null;
      if (ride.driver.receivedRatings && ride.driver.receivedRatings.length > 0) {
        driverRating = ride.driver.receivedRatings.reduce((sum, rating) => sum + rating.rating, 0) / 
                       ride.driver.receivedRatings.length;
      }
      
      return {
        rideId: ride.id,
        driverName: ride.driver.name,
        driverRating: driverRating || ride.driver.rating || 4.5, // Use calculated rating, user rating field, or default
        photoUrl: ride.driver.photoUrl,
        pickupLocation: {
          latitude: ride.pickup.latitude,
          longitude: ride.pickup.longitude,
          placeName: ride.pickup.placeName,
          address: ride.pickup.address,
          city: ride.pickup.city,
          state: ride.pickup.state
        },
        destinationLocation: {
          latitude: ride.destination.latitude,
          longitude: ride.destination.longitude,
          placeName: ride.destination.placeName,
          address: ride.destination.address,
          city: ride.destination.city,
          state: ride.destination.state
        },
        waypoints: ride.waypoints,
        price: ride.price,
        pricePerKm: ride.pricePerKm,
        selectedDate: ride.selectedDate,
        selectedTime: ride.selectedTime,
        selectedCapacity: ride.selectedCapacity,
        estimatedDuration: ride.estimatedDuration,
        estimatedDistance: ride.estimatedDistance,
        isRecurring: ride.isRecurring,
        recurringDays: ride.recurringDays,
        notes: ride.notes,
        remainingCapacity: remainingCapacity,
        vehicle: {
          vehicleName: ride.vehicle.vehicleName,
          vehicleNumber: ride.vehicle.vehicleNumber,
          vehicleType: ride.vehicle.vehicleType,
          make: ride.vehicle.make,
          model: ride.vehicle.model,
          color: ride.vehicle.color
        },
        rideStatus: ride.rideStatus,
        createdAt: ride.createdAt
      };
    }).filter(Boolean); // Remove null entries

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

    // Check if the ride is already completed or canceled
    if (ride.rideStatus === "Completed" || ride.rideStatus === "Cancelled") {
      return res.status(400).json({ message: "Ride is already completed or cancelled" });
    }

    // Update ride status
    await prisma.ride.update({
      where: { id: rideId },
      data: { 
        rideStatus: "Completed",
        updatedAt: new Date()
      }
    });

    // Update all bookings for this ride
    for (const booking of ride.bookings) {
      await prisma.booking.update({
        where: { id: booking.id },
        data: { 
          status: "completed",
          paymentStatus: "COMPLETED",
          updatedAt: new Date()
        }
      });
    }

    res.json({ message: "Ride completed successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error completing the ride", error: err.message });
  }
};

// Combined cancel ride function that handles both driver and passenger cancellations
exports.cancelRide = async (req, res) => {
  try {
    const rideId = req.params.rideId;
    const { userUid, isDriver } = req.body; // Get the user ID and role from request body

    // Find user by uid
    const user = await prisma.user.findUnique({
      where: { uid: userUid }
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Find the ride with bookings
    const ride = await prisma.ride.findUnique({
      where: { id: rideId },
      include: { 
        bookings: true,
        driver: true
      }
    });

    if (!ride) {
      return res.status(404).json({ message: "Ride not found" });
    }

    // Check if the ride is already completed or canceled
    if (ride.rideStatus === "Completed" || ride.rideStatus === "Cancelled") {
      return res.status(400).json({
        message: "Cannot cancel a completed or already canceled ride"
      });
    }

    // Check if the ride is in the past
    if (new Date(ride.selectedDate) < new Date()) {
      return res.status(400).json({ message: "Cannot cancel past rides" });
    }

    // If cancellation is by driver, verify the user is the ride's driver
    if (isDriver) {
      if (ride.driverId !== user.id) {
        return res.status(403).json({ message: "Only the driver of this ride can cancel it" });
      }
      
      // Driver is cancelling - update all bookings
      for (const booking of ride.bookings) {
        await prisma.booking.update({
          where: { id: booking.id },
          data: { 
            status: "cancelled",
            paymentStatus: "REFUNDED",
            updatedAt: new Date()
          }
        });
      }
      
      // Update ride status
      await prisma.ride.update({
        where: { id: rideId },
        data: { 
          rideStatus: "Cancelled",
          updatedAt: new Date()
        }
      });
      
      return res.json({ message: "Ride cancelled successfully by driver" });
    } else {
      // Passenger is cancelling - find booking for this passenger
      const booking = await prisma.booking.findFirst({
        where: {
          rideId: rideId,
          passengerId: user.id
        }
      });

      if (!booking) {
        return res.status(400).json({ message: "You are not part of this ride" });
      }

      // Update booking status
      await prisma.booking.update({
        where: { id: booking.id },
        data: { 
          status: "cancelled",
          paymentStatus: "REFUNDED",
          updatedAt: new Date()
        }
      });

      // Check if all bookings are cancelled to update ride status
      const remainingBookings = await prisma.booking.findMany({
        where: {
          rideId: rideId,
          status: { not: "cancelled" }
        }
      });

      if (remainingBookings.length === 0) {
        await prisma.ride.update({
          where: { id: rideId },
          data: {
            rideStatus: "Cancelled",
            updatedAt: new Date()
          }
        });
      }
      
      return res.json({ message: "Booking cancelled successfully by passenger" });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Internal server error", error: err.message });
  }
};

// You can keep these functions for backward compatibility but make them use the combined function
// exports.cancelRideByDriver = async (req, res) => {
//   req.body.isDriver = true;
//   return exports.cancelRide(req, res);
// };

// exports.cancelRideByPassenger = async (req, res) => {
//   req.body.isDriver = false;
//   return exports.cancelRide(req, res);
// };

// Add new controller methods for messaging
exports.sendMessage = async (req, res) => {
  try {
    const { senderUid, receiverUid, content } = req.body;
    
    if (!senderUid || !receiverUid || !content) {
      return res.status(400).json({ error: "Sender, receiver, and message content are required" });
    }
    
    // Find users
    const sender = await prisma.user.findUnique({ where: { uid: senderUid } });
    const receiver = await prisma.user.findUnique({ where: { uid: receiverUid } });
    
    if (!sender || !receiver) {
      return res.status(404).json({ error: "One or both users not found" });
    }
    
    // Create the message
    const message = await prisma.message.create({
      data: {
        content,
        senderId: sender.id,
        receiverId: receiver.id
      }
    });
    
    res.status(201).json({ message: "Message sent successfully", messageId: message.id });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ error: "An error occurred" });
  }
};

// Get messages between two users
exports.getMessages = async (req, res) => {
  try {
    const { userUid, otherUserUid } = req.params;
    
    // Find users
    const user = await prisma.user.findUnique({ where: { uid: userUid } });
    const otherUser = await prisma.user.findUnique({ where: { uid: otherUserUid } });
    
    if (!user || !otherUser) {
      return res.status(404).json({ error: "One or both users not found" });
    }
    
    // Get messages between the two users
    const messages = await prisma.message.findMany({
      where: {
        OR: [
          { senderId: user.id, receiverId: otherUser.id },
          { senderId: otherUser.id, receiverId: user.id }
        ]
      },
      orderBy: {
        createdAt: 'asc'
      },
      include: {
        sender: {
          select: {
            uid: true,
            name: true,
            photoUrl: true
          }
        },
        receiver: {
          select: {
            uid: true,
            name: true,
            photoUrl: true
          }
        }
      }
    });
    
    // Mark messages from other user as read
    await prisma.message.updateMany({
      where: {
        senderId: otherUser.id,
        receiverId: user.id,
        isRead: false
      },
      data: {
        isRead: true
      }
    });
    
    res.json({ messages });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ error: "An error occurred" });
  }
};
