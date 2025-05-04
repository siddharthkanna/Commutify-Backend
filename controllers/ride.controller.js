const prisma = require("../prisma/prisma-client");
const { hydrateRide, buildSuccessResponse, buildErrorResponse } = require("../utils/hydrators");
const { cacheData, getCachedData, invalidateCache } = require("../utils/redis");
const { 
  isRideRouteMatch,
  RideStatus,
  RideType,
  BookingStatus,
  calculateRemainingCapacity
} = require("../utils/ride.helpers");

const CACHE_DURATIONS = {
  RIDE_STATS: 300,  // 5 minutes
  RIDE_DETAILS: 60, // 1 minute
  BOOKED_RIDES: 60,  // 1 minute
  PUBLISHED_RIDES: 60 // 1 minute
};

const generateCacheKey = (type, id, ...args) => {
  return `${type}:${id}:${args.join(':')}`;
};

exports.publishRide = async (req, res) => {
  try {
    const driverId = req.user.id;
    const {
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

    const user = await prisma.user.findUnique({
      where: { uid: driverId },
      include: { vehicles: true }
    });

    if (!user) {
      return res.status(404).json({ message: "User not found ffffhbfhfgh" });
    }

    const vehicle = await prisma.vehicle.findFirst({
      where: {
        vehicleNumber: selectedVehicle.vehicleNumber,
        ownerId: user.id
      }
    });

    if (!vehicle) {
      return res.status(404).json({ message: "Vehicle not found" });
    }

    if (selectedCapacity > vehicle.capacity) {
      return res.status(400).json({ message: "Selected capacity exceeds vehicle capacity" });
    }

    const rideData = {
      driverId: user.id,
      vehicleId: vehicle.id,
      immediateMode: immediateMode || false,
      scheduledMode: scheduledMode || true,
      selectedCapacity,
      selectedDate: new Date(selectedDate),
      selectedTime: new Date(selectedTime),
      price,
      pricePerKm,
      estimatedDuration,
      estimatedDistance,
      isRecurring: isRecurring || false,
      recurringDays: recurringDays || [],
      notes,
      rideType: RideType.Published
    };

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

    const newRide = await prisma.$transaction(async (tx) => {
      const pickup = await tx.location.create({ data: pickupData });
      
      const destination = await tx.location.create({ data: destinationData });
      
      const ride = await tx.ride.create({
        data: {
          ...rideData,
          pickupId: pickup.id,
          destinationId: destination.id
        }
      });
      
      if (waypoints && waypoints.length > 0) {
        for (let i = 0; i < waypoints.length; i++) {
          const waypointData = {
            rideId: ride.id,
            latitude: waypoints[i].latitude,
            longitude: waypoints[i].longitude,
            placeName: waypoints[i].placeName,
            stopOrder: i + 1,
            estimatedArrival: waypoints[i].estimatedArrival ? new Date(waypoints[i].estimatedArrival) : null
          };
          
          await tx.waypoint.create({ data: waypointData });
        }
      }
      
      return ride;
    });

    await invalidateCache(generateCacheKey('user', driverId, 'published-rides'));
    
    res.status(201).json({ 
      message: "Ride published successfully",
      rideId: newRide.id
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.bookRide = async (req, res) => {
  try {
    const { rideId = req.params.rideId, passengerCount = 1, specialRequests } = req.body;
    const passengerId = req.user.id;

    if (!rideId) {
      return res.status(400).json({ message: "Ride ID is required" });
    }

    const [passenger, ride] = await Promise.all([
      prisma.user.findUnique({ where: { uid: passengerId } }),
      prisma.ride.findUnique({
        where: { id: rideId },
        include: { bookings: true, pickup: true, destination: true }
      })
    ]);

    if (!passenger) {
      return res.status(404).json({ message: "Passenger not found" });
    }

    if (!ride) {
      return res.status(404).json({ message: "Ride not found" });
    }

    const existingBooking = ride.bookings.find(b => b.passengerId === passenger.id && b.status !== BookingStatus.Cancelled);

    if (existingBooking) {
      return res.status(400).json({ message: "Ride is already booked by the passenger" });
    }

    const remainingCapacity = calculateRemainingCapacity(ride);
    if (remainingCapacity < passengerCount) {
      return res.status(400).json({ 
        message: `Not enough seats. Only ${remainingCapacity} seats available` 
      });
    }

    const paymentAmount = ride.pricePerKm && ride.estimatedDistance
      ? ride.pricePerKm * ride.estimatedDistance
      : ride.price;

    const booking = await prisma.$transaction(async (tx) => {
      const updatedRide = await tx.ride.findUnique({
        where: { id: rideId },
        include: { bookings: true }
      });
      
      if (!updatedRide) {
        throw new Error('Ride not found');
      }
      
      const updatedCapacity = calculateRemainingCapacity(updatedRide);
      if (passengerCount > updatedCapacity) {
        throw new Error(`Not enough seats. Only ${updatedCapacity} available`);
      }
      
      const bookingData = {
        passengerId: passenger.id,
        driverId: ride.driverId,
        rideId: ride.id,
        source: ride.pickup.placeName,
        destination: ride.destination.placeName,
        status: BookingStatus.Ongoing,
        passengerCount,
        specialRequests,
        paymentAmount,
        paymentStatus: "PENDING",
        bookingDate: new Date()
      };

      return tx.booking.create({ data: bookingData });
    });

    if (ride.rideType === RideType.Published) {
      await prisma.ride.update({
        where: { id: ride.id },
        data: { rideType: RideType.Booked, rideStatus: RideStatus.Upcoming }
      });
    }

    await Promise.all([
      invalidateCache(generateCacheKey('user', passengerId, 'booked-rides')),
      invalidateCache(generateCacheKey('user', ride.driverId, 'published-rides'))
    ]);

    res.json({ 
      message: "Ride booked successfully",
      bookingId: booking.id
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.fetchPublishedRides = async (req, res) => {
  try {
    const userId = req.user.id;

    if (!userId) {
      return res.status(400).json({ message: "User ID is required as a route parameter or query parameter" });
    }

    const cacheKey = generateCacheKey('user', userId, 'published-rides');
    const cachedRides = await getCachedData(cacheKey);
    
    if (cachedRides) {
      return res.json(cachedRides);
    }
    const user = await prisma.findUserByUid(userId);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
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

    await cacheData(cacheKey, ridesData, CACHE_DURATIONS.PUBLISHED_RIDES);

    res.json(ridesData);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
};


exports.fetchBookedRides = async (req, res) => {
  try {
    const userId = req.user.id;

    if (!userId) {
      return res.status(400).json({ message: "User ID is required as a route parameter or query parameter" });
    }

    const cacheKey = generateCacheKey('user', userId, 'booked-rides');
    const cachedRides = await getCachedData(cacheKey);
    
    if (cachedRides) {
      return res.json(cachedRides);
    }

    const user = await prisma.findUserByUid(userId);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

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
   
    await cacheData(cacheKey, ridesData, CACHE_DURATIONS.BOOKED_RIDES);
    res.json(ridesData);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
};

exports.fetchAvailableRides = async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      maxPrice,
      pickupLat,
      pickupLng,
      destinationLat,
      destinationLng
    } = req.query;

    let user = null;
    if (userId) {
      user = await prisma.findUserByUid(userId);
      if (!user) {
        return res.status(404).json(buildErrorResponse("User not found"));
      }
    }

    const whereClause = {
      rideStatus: { not: RideStatus.Completed }
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
        longitude: parseFloat(pickupLng)
      };
    }

    if (destinationLat && destinationLng) {
      userDestination = {
        latitude: parseFloat(destinationLat),
        longitude: parseFloat(destinationLng)
      };
    }

    const ridesData = availableRides
      .map(ride => {
        const totalBookedSeats = ride.bookings
          .filter(booking => booking.status !== BookingStatus.Cancelled)
          .reduce(    
            (sum, booking) => sum + (booking.passengerCount || 1),
            0
          );
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
    res.status(502).json(buildErrorResponse("Error fetching available rides", err));
  }
};

//Complete Ride
exports.completeRide = async (req, res) => {
  try {
    const userUid = req.user.id;
    const rideId = req.params.rideId;

    const user = await prisma.user.findUnique({
      where: { uid: userUid }
    });

    if (!user) {
      return res.status(404).json(buildErrorResponse("User not found"));
    }
    const ride = await prisma.ride.findFirst({
      where: { 
        id: rideId,
        driverId: user.id
      },
      include: {
        bookings: true
      }
    });

    if (!ride) {
      return res.status(404).json(
        buildErrorResponse("Ride not found or you're not authorized to complete it")
      );
    }

    if (ride.rideStatus === "Completed") {
      return res.status(400).json(buildErrorResponse("Ride is already completed"));
    }

    const updatedRide = await prisma.$transaction(async (tx) => {
      const ride = await tx.ride.update({
        where: { id: rideId },
        data: { 
          rideStatus: RideStatus.Completed,
          updatedAt: new Date()
        }
      });

      await tx.booking.updateMany({
        where: { 
          rideId: rideId,
          status: {
            not: BookingStatus.Cancelled
          }
        },
        data: { 
          status: BookingStatus.Completed,
          updatedAt: new Date()
        }
      });

      return ride;
    });

    await invalidateCache(generateCacheKey('user', userUid, 'published-rides'));
    for (const booking of ride.bookings) {
      await invalidateCache(generateCacheKey('user', booking.passengerId, 'booked-rides'));
    }

    const hydratedRide = hydrateRide(updatedRide);
    res.json(buildSuccessResponse({ 
      message: "Ride completed successfully",
      ride: hydratedRide 
    }));
  } catch (err) {
    res.status(500).json(buildErrorResponse("Error completing ride", err));
  }
};

exports.cancelRide = async (req, res) => {
  try {
    const rideId = req.params.rideId;
    const userId = req.user.id;
    const { role } = req.body; 

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

    if (ride.rideStatus === RideStatus.Completed || ride.rideStatus === RideStatus.Cancelled) {
      return res.status(400).json({
        message: "Cannot cancel a completed or already canceled ride"
      });
    }

    const isDriver = ride.driverId === user.id;
    const isPassenger = ride.bookings.some(booking => booking.passengerId === user.id);
    
    if (role === 'driver' && !isDriver) {
      return res.status(403).json({ message: "You are not the driver of this ride" });
    }
    
    if (role === 'passenger' && !isPassenger) {
      return res.status(403).json({ message: "You are not a passenger on this ride" });
    }
    
    if (isDriver) {
      for (const booking of ride.bookings) {
        await prisma.booking.update({
          where: { id: booking.id },
          data: { 
            status: BookingStatus.Cancelled,
            paymentStatus: "REFUNDED",
            updatedAt: new Date()
          }
        });
      }
      
      await prisma.ride.update({
        where: { id: rideId },
        data: { 
          rideStatus: RideStatus.Cancelled,
          updatedAt: new Date()
        }
      });
      
      await invalidateCache(generateCacheKey('user', userId, 'published-rides'));
      for (const booking of ride.bookings) {
        const passenger = await prisma.user.findUnique({
          where: { id: booking.passengerId },
          select: { uid: true }
        });
        if (passenger) {
          await invalidateCache(generateCacheKey('user', passenger.uid, 'booked-rides'));
        }
      }
      
      return res.json({ 
        success: true,
        message: "Ride cancelled successfully",
        cancelledBy: "driver"
      });
    } else if (isPassenger) {
      const booking = await prisma.booking.findFirst({
        where: {
          rideId: rideId,
          passengerId: user.id
        }
      });

      await prisma.booking.update({
        where: { id: booking.id },
        data: { 
          status: BookingStatus.Cancelled,
          paymentStatus: "REFUNDED",
          updatedAt: new Date()
        }
      });

      const remainingBookings = await prisma.booking.findMany({
        where: {
          rideId: rideId,
          status: { not: BookingStatus.Cancelled }
        }
      });

      if (remainingBookings.length === 0) {
        await prisma.ride.update({
      where: { id: rideId },
          data: {
            rideType: RideType.Published, 
            rideStatus: RideStatus.Upcoming, 
            updatedAt: new Date()
          }
        });
      }
      
      await invalidateCache(generateCacheKey('user', userId, 'booked-rides'));
      await invalidateCache(generateCacheKey('user', ride.driver.uid, 'published-rides'));

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
    res.status(500).json({ 
      success: false,
      message: "Error cancelling ride", 
      error: err.message 
    });
  }
};

exports.getRideStats = async (req, res) => {
  try {
    const userId = req.user.id;
    
    if (!userId) {
      return res.status(400).json(buildErrorResponse("User ID is required as a route parameter"));
    }
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
      totalRidesCompleted: publishedRides.filter(ride => ride.rideStatus === RideStatus.Completed).length,
      totalRidesCancelled: publishedRides.filter(ride => ride.rideStatus === RideStatus.Cancelled).length,
      totalRidesUpcoming: publishedRides.filter(ride => ride.rideStatus === RideStatus.Upcoming).length,
      totalRidesInProgress: publishedRides.filter(ride => ride.rideStatus === RideStatus.InProgress).length,
      totalPassengersServed: publishedRides.reduce((sum, ride) => sum + ride.bookings.length, 0),
      totalEarnings: publishedRides.reduce((sum, ride) => {
        if (ride.rideStatus === RideStatus.Completed) {
          return sum + ride.bookings.reduce((bookingSum, booking) => 
            booking.paymentStatus === "COMPLETED" ? bookingSum + (booking.paymentAmount || 0) : bookingSum, 
          0);
        }
        return sum;
      }, 0)
    };

    const passengerStats = {
      totalRidesBooked: bookedRides.length,
      totalRidesCompleted: bookedRides.filter(booking => booking.status === BookingStatus.Completed).length,
      totalRidesCancelled: bookedRides.filter(booking => booking.status === BookingStatus.Cancelled).length,
      totalRidesUpcoming: bookedRides.filter(booking => booking.status === BookingStatus.Ongoing || booking.status === BookingStatus.Confirmed).length,
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

    await cacheData(cacheKey, stats, CACHE_DURATIONS.RIDE_STATS);

    res.json(buildSuccessResponse(stats, "Ride statistics retrieved successfully"));
  } catch (err) {
    res.status(500).json(buildErrorResponse("Failed to retrieve ride statistics", err));
  }
};
