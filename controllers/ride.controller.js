const prisma = require("../prisma/prisma-client");
const { hydrateRide, hydrateUser, buildSuccessResponse, buildErrorResponse } = require("../utils/hydrators");
const { cacheData, getCachedData, invalidateCache } = require("../utils/redis");
const { 
  parseLocationData, 
  isRideRouteMatch 
} = require("../utils/ride.helpers");

// Cache durations
const CACHE_DURATIONS = {
  RIDE_STATS: 300,  // 5 minutes
  RIDE_DETAILS: 300 // 5 minutes
};

// Cache key generators
const generateCacheKey = (type, id, ...args) => {
  return `${type}:${id}:${args.join(':')}`;
};

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
    console.log("Starting bookRide with request:", { params: req.params, body: req.body });

    const rideId = req.params.rideId || req.body.rideId; 
    const userId = req.body.userId || req.body.passengerId;  
    const { passengerCount = 1, specialRequests } = req.body;  

    console.log("Extracted request data:", { rideId, userId, passengerCount, specialRequests });

    // Input validation
    if (!rideId || !userId) {
      console.log("Missing required fields:", { rideId, userId });
      return res.status(400).json({ message: "Ride ID and User ID are required" });
    }

    // Find the user by uid
    const passenger = await prisma.user.findUnique({
      where: { uid: userId }
    });
    console.log("Found passenger:", passenger);

    if (!passenger) {
      console.log("Passenger not found for userId:", userId);
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
    console.log("Found ride:", ride);

    if (!ride) {
      console.log("Ride not found for rideId:", rideId);
      return res.status(404).json({ message: "Ride not found" });
    }

    // Check if the ride is already booked by this passenger
    const existingBooking = await prisma.booking.findFirst({
      where: {
        rideId: ride.id,
        passengerId: passenger.id
      }
    });
    console.log("Existing booking check:", existingBooking);

    if (existingBooking) {
      console.log("Ride already booked by passenger:", { rideId, passengerId: passenger.id });
      return res.status(400).json({ message: "Ride is already booked by the passenger" });
    }

    // Check if there are available seats
    if (ride.bookings.length >= ride.selectedCapacity) {
      console.log("No available seats:", { bookings: ride.bookings.length, capacity: ride.selectedCapacity });
      return res.status(400).json({ message: "No available seats for this ride" });
    }

    // Check if passenger count is valid
    const totalBookedSeats = ride.bookings.reduce((sum, booking) => sum + (booking.passengerCount || 1), 0);
    const remainingSeats = ride.selectedCapacity - totalBookedSeats;
    console.log("Seat availability check:", { totalBookedSeats, remainingSeats, requestedSeats: passengerCount });
    
    if (passengerCount > remainingSeats) {
      console.log("Not enough seats available:", { requested: passengerCount, remaining: remainingSeats });
      return res.status(400).json({ 
        message: `Not enough seats. Only ${remainingSeats} seats available` 
      });
    }

    // Check if ride date is in the past
    // if (new Date(ride.selectedDate) < new Date()) {
    //   console.log("Ride date is in the past:", { selectedDate: ride.selectedDate });
    //   return res.status(400).json({ message: "Cannot book a ride in the past" });
    // }

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
    console.log("Created new booking:", booking);

    // Update the ride status if this is the first booking
    if (ride.rideType === "published") {
      console.log("Updating ride status for first booking");
      await prisma.ride.update({
        where: { id: ride.id },
        data: {
          rideType: "booked",
          rideStatus: "Upcoming"
        }
      });
    }

    console.log("Booking completed successfully:", { bookingId: booking.id });
    res.json({ 
      message: "Ride booked successfully",
      bookingId: booking.id
    });
  } catch (err) {
    console.error("Error in bookRide:", err);
    res.status(500).json({ message: "Internal server error", error: err.message });
  }
};

exports.fetchPublishedRides = async (req, res) => {
  try {
    const userId = req.params.userId || req.query.userId;
    console.log("Fetching published rides for userId:", userId);

    if (!userId) {
      console.log("No userId provided in request parameters");
      return res.status(400).json({ message: "User ID is required as a route parameter or query parameter" });
    }

    // Find the user by uid
    const user = await prisma.findUserByUid(userId);

    console.log("Found user:", user);

    if (!user) {
      console.log("User not found for userId:", userId);
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
    console.log("Found published rides count:", publishedRides.length);

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

    console.log("Sending back ridesData with length:", ridesData.length);

    res.json(ridesData);
  } catch (err) {
    console.error("Error fetching published rides:", err);
    res.status(502).json({ error: err.message });
  }
};

exports.fetchBookedRides = async (req, res) => {
  try {
    const userId = req.params.userId || req.query.userId;
    console.log("Fetching booked rides for userId:", userId);

    if (!userId) {
      console.log("No userId provided in request parameters");
      return res.status(400).json({ message: "User ID is required as a route parameter or query parameter" });
    }

    // Find the user by uid
    const user = await prisma.findUserByUid(userId);
    console.log("Found user:", user);

    if (!user) {
      console.log("User not found for userId:", userId);
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
    console.log("Found bookings count:", bookings.length);

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
    console.log("Sending back ridesData with length:", ridesData);

    res.json(ridesData);
  } catch (err) {
    console.error("Error fetching booked rides:", err);
    res.status(502).json({ error: err.message });
  }
};

exports.fetchAvailableRides = async (req, res) => {
  console.log("Fetching available rides");
  try {
    const { 
      userId, 
      maxPrice, 
      pickupLocation, 
      destinationLocation,
      pickupLat,
      pickupLng,
      destinationLat,
      destinationLng 
    } = req.query;
    
    console.log("Request query:", req.query);
    console.log("User ID:", userId);
    console.log("Max Price:", maxPrice);
    
    // Find the user if userId is provided
    let user = null;
    if (userId) {
      user = await prisma.findUserByUid(userId);
      if (!user) {
        return res.status(404).json(buildErrorResponse("User not found"));
      }
    }
    console.log("User found:", user);
    
    const whereClause = {
      rideStatus: { not: "Completed" },
      //selectedDate: { gte: new Date() }
    };

    if (user) {
      whereClause.NOT = { driverId: user.id };
    }
    
    if (maxPrice) {
      whereClause.price = { lte: parseFloat(maxPrice) };
    }

    const availableRides = await prisma.ride.findMany({
      where: whereClause,
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

    let userPickup = null;
    let userDestination = null;

    if (pickupLat && pickupLng) {
      userPickup = {
        latitude: parseFloat(pickupLat),
        longitude: parseFloat(pickupLng),
        placeName: pickupLocation || "User pickup"
      };
      console.log("Using pickup coordinates:", userPickup);
    } else if (pickupLocation) {
      userPickup = parseLocationData(pickupLocation);
      console.log("Using pickup location name:", userPickup);
    }

    if (destinationLat && destinationLng) {
      userDestination = {
        latitude: parseFloat(destinationLat),
        longitude: parseFloat(destinationLng),
        placeName: destinationLocation || "User destination"
      };
      console.log("Using destination coordinates:", userDestination);
    } else if (destinationLocation) {
      userDestination = parseLocationData(destinationLocation);
      console.log("Using destination location name:", userDestination);
    }

    // Use hydrators to format the response
    const ridesData = availableRides
      .map(ride => {
        const totalBookedSeats = ride.bookings.reduce((sum, booking) => sum + (booking.passengerCount || 1), 0);
        
        const remainingCapacity = ride.selectedCapacity - totalBookedSeats;
        
        if (remainingCapacity <= 0) {
          return null;
        }
        
        if (!isRideRouteMatch(ride, userPickup, userDestination)) {
          return null;
        }

        const hydratedRide = hydrateRide(ride, {
          includeDriver: true,
          includeVehicle: true,
          includeLocations: true,
          includeBookings: false
        });
        
        hydratedRide.remainingCapacity = remainingCapacity;
        
        return hydratedRide;
      })
      .filter(Boolean); 

    res.json(buildSuccessResponse(ridesData));
  } catch (err) {
    console.error(err);
    res.status(502).json(buildErrorResponse("Error fetching available rides", err));
  }
};

//Complete Ride
exports.completeRide = async (req, res) => {
  try {
    const rideId = req.params.rideId;
    const { userId } = req.body;  

    if (userId) {
      const user = await prisma.user.findUnique({ where: { uid: userId } });
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      const ride = await prisma.ride.findUnique({
        where: { id: rideId },
        include: { bookings: true }
      });
      
      if (!ride) {
        return res.status(404).json({ message: "Ride not found" });
      }
      
      if (ride.driverId !== user.id) {
        return res.status(403).json({ message: "Only the driver can complete this ride" });
      }
      
      await prisma.ride.update({
        where: { id: rideId },
        data: { 
          rideStatus: "Completed",
          updatedAt: new Date()
        }
      });

      for (const booking of ride.bookings) {
        await prisma.booking.update({
          where: { id: booking.id },
          data: { 
            status: "completed",
            paymentStatus: "COMPLETED",
            updatedAt: new Date()
          }
        });

        // Invalidate passenger's ride stats cache
        const passengerId = booking.passengerId;
        const passengerUser = await prisma.user.findUnique({ 
          where: { id: passengerId },
          select: { uid: true }
        });
        if (passengerUser) {
          await invalidateCache(generateCacheKey('user', passengerUser.uid, 'ride-stats'));
        }
      }

      // Invalidate driver's ride stats cache
      await invalidateCache(generateCacheKey('user', userId, 'ride-stats'));

      res.json({ message: "Ride completed successfully" });
    } else {
      return res.status(400).json({ message: "User ID is required" });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error completing the ride", error: err.message });
  }
};

exports.cancelRide = async (req, res) => {
  console.log("Cancelling ride");
  try {
    const rideId = req.params.rideId;
    const { userId, role } = req.body; 
    console.log("Ride ID:", rideId);
    console.log("User ID:", userId);
    console.log("Role:", role);
    if (!rideId || !userId) {
      return res.status(400).json({ message: "Ride ID and User ID are required" });
    }

    const user = await prisma.user.findUnique({
      where: { uid: userId }
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

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

    if (ride.rideStatus === "Completed" || ride.rideStatus === "Cancelled") {
      return res.status(400).json({
        message: "Cannot cancel a completed or already canceled ride"
      });
    }

    const isDriver = ride.driverId === user.id;
    const isPassenger = ride.bookings.some(booking => booking.passengerId === user.id);
    
    // If role is specified, verify it matches reality
    if (role === 'driver' && !isDriver) {
      return res.status(403).json({ message: "You are not the driver of this ride" });
    }
    
    if (role === 'passenger' && !isPassenger) {
      return res.status(403).json({ message: "You are not a passenger on this ride" });
    }
    
    if (isDriver) {
      // If driver cancels, cancel all bookings and the ride
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
      
      await prisma.ride.update({
        where: { id: rideId },
        data: { 
          rideStatus: "Cancelled",
          updatedAt: new Date()
        }
      });
      
      return res.json({ 
        success: true,
        message: "Ride cancelled successfully",
        cancelledBy: "driver"
      });
    } else if (isPassenger) {
      // If passenger cancels, only cancel their booking
      const booking = await prisma.booking.findFirst({
        where: {
          rideId: rideId,
          passengerId: user.id
        }
      });

      await prisma.booking.update({
        where: { id: booking.id },
        data: { 
          status: "cancelled",
          paymentStatus: "REFUNDED",
          updatedAt: new Date()
        }
      });

      // Update ride type back to "published" if it was the only booking
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
            rideType: "published", // Change back to published instead of cancelling
            rideStatus: "Upcoming", // Keep the ride status as Upcoming
            updatedAt: new Date()
          }
        });
      }
      
      return res.json({ 
        success: true,
        message: "Booking cancelled successfully",
        cancelledBy: "passenger"
      });
    } else {
      return res.status(403).json({ 
        message: "You don't have permission to cancel this ride" 
      });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ 
      success: false,
      message: "Error cancelling ride", 
      error: err.message 
    });
  }
};

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

exports.getMessages = async (req, res) => {
  try {
    const { userId, otherUserId } = req.params; 
    
    const user = await prisma.user.findUnique({ where: { uid: userId } });
    const otherUser = await prisma.user.findUnique({ where: { uid: otherUserId } });
    
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


exports.getRideStats = async (req, res) => {
  try {
    const userId = req.params.userId;
    
    if (!userId) {
      return res.status(400).json(buildErrorResponse("User ID is required as a route parameter"));
    }

    // Try to get stats from cache first
    const cacheKey = generateCacheKey('user', userId, 'ride-stats');
    const cachedStats = await getCachedData(cacheKey);
    
    if (cachedStats) {
      return res.json(buildSuccessResponse(cachedStats, "Ride statistics retrieved from cache"));
    }

    const user = await prisma.findUserByUid(userId);
    
    if (!user) {
      return res.status(404).json(buildErrorResponse("User not found"));
    }

    const publishedRides = await prisma.ride.findMany({
      where: { driverId: user.id },
      include: {
        bookings: true,
        destination: true,
        pickup: true
      }
    });

    const bookedRides = await prisma.booking.findMany({
      where: { passengerId: user.id },
      include: {
        ride: {
          include: {
            destination: true,
            pickup: true
          }
        }
      }
    });

    const driverStats = {
      totalRidesPublished: publishedRides.length,
      totalRidesCompleted: publishedRides.filter(ride => ride.rideStatus === "Completed").length,
      totalRidesCancelled: publishedRides.filter(ride => ride.rideStatus === "Cancelled").length,
      totalRidesUpcoming: publishedRides.filter(ride => ride.rideStatus === "Upcoming").length,
      totalRidesInProgress: publishedRides.filter(ride => ride.rideStatus === "InProgress").length,
      totalPassengersServed: publishedRides.reduce((sum, ride) => sum + ride.bookings.length, 0),
      totalEarnings: publishedRides.reduce((sum, ride) => {
        if (ride.rideStatus === "Completed") {
          return sum + ride.bookings.reduce((bookingSum, booking) => 
            booking.paymentStatus === "COMPLETED" ? bookingSum + (booking.paymentAmount || 0) : bookingSum, 
          0);
        }
        return sum;
      }, 0)
    };

    const passengerStats = {
      totalRidesBooked: bookedRides.length,
      totalRidesCompleted: bookedRides.filter(booking => booking.status === "completed").length,
      totalRidesCancelled: bookedRides.filter(booking => booking.status === "cancelled").length,
      totalRidesUpcoming: bookedRides.filter(booking => booking.status === "ongoing" || booking.status === "confirmed").length,
      totalSpent: bookedRides.reduce((sum, booking) => 
        booking.paymentStatus === "COMPLETED" ? sum + (booking.paymentAmount || 0) : sum, 
      0)
    };

    const totalDistance = [
      ...publishedRides.map(ride => ride.estimatedDistance || 0),
      ...bookedRides.map(booking => booking.ride?.estimatedDistance || 0)
    ].reduce((sum, distance) => sum + distance, 0);

    const destinationCounts = {};
    
    publishedRides.forEach(ride => {
      if (ride.destination && ride.destination.city) {
        const city = ride.destination.city;
        destinationCounts[city] = (destinationCounts[city] || 0) + 1;
      }
    });
    
    bookedRides.forEach(booking => {
      if (booking.ride?.destination?.city) {
        const city = booking.ride.destination.city;
        destinationCounts[city] = (destinationCounts[city] || 0) + 1;
      }
    });
    
    const topDestinations = Object.entries(destinationCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([city, count]) => ({ city, count }));

    const now = new Date();
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(now.getFullYear() - 1);
    
    const ridesByMonth = Array(12).fill(0).map(() => ({ asDriver: 0, asPassenger: 0 }));
    
    publishedRides.forEach(ride => {
      const date = new Date(ride.selectedDate);
      if (date >= oneYearAgo && date <= now) {
        const monthIndex = (date.getMonth() - oneYearAgo.getMonth() + 12) % 12;
        ridesByMonth[monthIndex].asDriver++;
      }
    });
    
    bookedRides.forEach(booking => {
      const date = new Date(booking.ride?.selectedDate);
      if (date && date >= oneYearAgo && date <= now) {
        const monthIndex = (date.getMonth() - oneYearAgo.getMonth() + 12) % 12;
        ridesByMonth[monthIndex].asPassenger++;
      }
    });
    
    const monthNames = [];
    for (let i = 0; i < 12; i++) {
      const d = new Date();
      d.setMonth((oneYearAgo.getMonth() + i) % 12);
      monthNames.push(d.toLocaleString('default', { month: 'short' }));
    }
    
    const stats = {
      userId: user.uid,
      userName: user.name,
      asDriver: driverStats,
      asPassenger: passengerStats,
      aggregate: {
        totalRides: driverStats.totalRidesPublished + passengerStats.totalRidesBooked,
        totalDistance: Math.round(totalDistance),
        totalRidesCompleted: driverStats.totalRidesCompleted + passengerStats.totalRidesCompleted,
        netFinancial: Math.round((driverStats.totalEarnings - passengerStats.totalSpent) * 100) / 100
      },
      topDestinations,
      rideActivity: {
        months: monthNames,
        data: ridesByMonth
      }
    };

    // Cache the stats
    await cacheData(cacheKey, stats, CACHE_DURATIONS.RIDE_STATS);

    res.json(buildSuccessResponse(stats, "Ride statistics retrieved successfully"));
  } catch (err) {
    res.status(500).json(buildErrorResponse("Failed to retrieve ride statistics", err));
  }
};
