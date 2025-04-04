/**
 * Hydrators utility
 * 
 * This module contains functions to standardize the formatting of data entities
 * throughout the application. They help ensure consistency in API responses
 * and reduce code duplication.
 */

/**
 * Transforms a Prisma User model into a standardized user object
 * @param {Object} user - The Prisma User object
 * @param {Object} options - Options for including related data
 * @returns {Object} Standardized user object
 */
exports.hydrateUser = (user, options = {}) => {
  if (!user) return null;

  const {
    includePreferences = false,
    includeVehicles = false,
    includeRideStats = false,
    includeRatings = false
  } = options;
  
  // Base user object that's always included
  const userObject = {
    id: user.id,
    uid: user.uid,
    email: user.email,
    name: user.name,
    mobileNumber: user.mobileNumber,
    roles: user.roles,
    photoUrl: user.photoUrl,
    bio: user.bio || null
  };

  // Add optional fields based on what was included in the query and options
  if (includePreferences && user.preferences) {
    userObject.preferences = user.preferences;
  }

  if (includeVehicles && user.vehicles) {
    userObject.vehicles = user.vehicles.map(v => exports.hydrateVehicle(v));
  }

  if (includeRideStats) {
    userObject.ridesAsDriver = Array.isArray(user.ridesAsDriver) 
      ? user.ridesAsDriver.length 
      : null;
    
    userObject.ridesAsPassenger = Array.isArray(user.ridesAsPassenger) 
      ? user.ridesAsPassenger.length 
      : null;
  }

  if (includeRatings && user.receivedRatings) {
    // Calculate average rating
    let avgRating = null;
    if (user.receivedRatings.length > 0) {
      avgRating = user.receivedRatings.reduce((sum, r) => sum + r.rating, 0) / user.receivedRatings.length;
      // Round to 1 decimal place
      avgRating = Math.round(avgRating * 10) / 10;
    }
    userObject.rating = avgRating;

    // Include a sample of recent ratings if available
    if (options.includeRatingDetails) {
      userObject.recentRatings = user.receivedRatings
        .slice(0, 3) // Take up to 3 recent ratings
        .map(rating => ({
          rating: rating.rating,
          comment: rating.comment,
          raterName: rating.rater?.name || 'Anonymous',
          raterPhoto: rating.rater?.photoUrl
        }));
    }
  }

  return userObject;
};

/**
 * Transforms a Prisma Vehicle model into a standardized vehicle object
 * @param {Object} vehicle - The Prisma Vehicle object
 * @returns {Object} Standardized vehicle object
 */
exports.hydrateVehicle = (vehicle) => {
  if (!vehicle) return null;
  
  return {
    id: vehicle.id,
    vehicleNumber: vehicle.vehicleNumber,
    vehicleName: vehicle.vehicleName,
    vehicleType: vehicle.vehicleType,
    capacity: vehicle.capacity,
    color: vehicle.color || null,
    make: vehicle.make || null,
    model: vehicle.model || null,
    year: vehicle.year || null,
    isActive: vehicle.isActive
  };
};

/**
 * Transforms a Prisma Ride model into a standardized ride object
 * @param {Object} ride - The Prisma Ride object
 * @param {Object} options - Options for including related data
 * @returns {Object} Standardized ride object
 */
exports.hydrateRide = (ride, options = {}) => {
  if (!ride) return null;

  const {
    includeDriver = false,
    includeVehicle = false,
    includeLocations = true,
    includeBookings = false
  } = options;
  
  // Base ride object
  const rideObject = {
    id: ride.id,
    price: ride.price,
    pricePerKm: ride.pricePerKm,
    selectedCapacity: ride.selectedCapacity,
    selectedDate: ride.selectedDate,
    selectedTime: ride.selectedTime,
    estimatedDuration: ride.estimatedDuration,
    estimatedDistance: ride.estimatedDistance,
    rideType: ride.rideType,
    rideStatus: ride.rideStatus,
    isRecurring: ride.isRecurring,
    recurringDays: ride.recurringDays,
    notes: ride.notes,
    createdAt: ride.createdAt,
    updatedAt: ride.updatedAt
  };

  // Include optional fields
  if (includeDriver && ride.driver) {
    rideObject.driver = exports.hydrateUser(ride.driver, { includeRatings: true });
  }

  if (includeVehicle && ride.vehicle) {
    rideObject.vehicle = exports.hydrateVehicle(ride.vehicle);
  }

  if (includeLocations) {
    if (ride.pickup) {
      rideObject.pickup = exports.hydrateLocation(ride.pickup);
    }
    
    if (ride.destination) {
      rideObject.destination = exports.hydrateLocation(ride.destination);
    }

    if (ride.waypoints) {
      rideObject.waypoints = ride.waypoints.map(wp => exports.hydrateWaypoint(wp));
    }
  }

  if (includeBookings && ride.bookings) {
    rideObject.bookings = ride.bookings.map(booking => exports.hydrateBooking(booking));
    
    // Add calculated fields based on bookings
    rideObject.totalBookedSeats = ride.bookings.reduce(
      (sum, booking) => sum + (booking.passengerCount || 1), 0
    );
    
    rideObject.remainingCapacity = ride.selectedCapacity - rideObject.totalBookedSeats;
  }

  return rideObject;
};

/**
 * Transforms a Prisma Location model into a standardized location object
 * @param {Object} location - The Prisma Location object
 * @returns {Object} Standardized location object
 */
exports.hydrateLocation = (location) => {
  if (!location) return null;
  
  return {
    id: location.id,
    latitude: location.latitude,
    longitude: location.longitude,
    placeName: location.placeName,
    address: location.address,
    city: location.city,
    state: location.state,
    country: location.country,
    zipCode: location.zipCode
  };
};

/**
 * Transforms a Prisma Waypoint model into a standardized waypoint object
 * @param {Object} waypoint - The Prisma Waypoint object
 * @returns {Object} Standardized waypoint object
 */
exports.hydrateWaypoint = (waypoint) => {
  if (!waypoint) return null;
  
  return {
    id: waypoint.id,
    latitude: waypoint.latitude,
    longitude: waypoint.longitude,
    placeName: waypoint.placeName,
    stopOrder: waypoint.stopOrder,
    estimatedArrival: waypoint.estimatedArrival
  };
};

/**
 * Transforms a Prisma Booking model into a standardized booking object
 * @param {Object} booking - The Prisma Booking object
 * @param {Object} options - Options for including related data
 * @returns {Object} Standardized booking object
 */
exports.hydrateBooking = (booking, options = {}) => {
  if (!booking) return null;

  const {
    includePassenger = false,
    includeRide = false,
    includeRating = false
  } = options;
  
  // Base booking object
  const bookingObject = {
    id: booking.id,
    passengerCount: booking.passengerCount,
    source: booking.source,
    destination: booking.destination,
    status: booking.status,
    bookingDate: booking.bookingDate,
    paymentStatus: booking.paymentStatus,
    paymentAmount: booking.paymentAmount,
    paymentMethod: booking.paymentMethod,
    specialRequests: booking.specialRequests,
    createdAt: booking.createdAt,
    updatedAt: booking.updatedAt
  };

  // Include optional fields
  if (includePassenger && booking.passenger) {
    bookingObject.passenger = exports.hydrateUser(booking.passenger);
  }

  if (includeRide && booking.ride) {
    bookingObject.ride = exports.hydrateRide(booking.ride);
  }

  if (includeRating && booking.rating) {
    bookingObject.rating = {
      id: booking.rating.id,
      rating: booking.rating.rating,
      comment: booking.rating.comment,
      createdAt: booking.rating.createdAt
    };
  }

  return bookingObject;
};

/**
 * Builds a standard success response object
 * @param {Object} data - The data to include in the response
 * @param {String} message - Optional success message
 * @returns {Object} Standardized success response
 */
exports.buildSuccessResponse = (data, message = null) => {
  const response = {
    success: true,
    data
  };
  
  if (message) {
    response.message = message;
  }
  
  return response;
};

/**
 * Builds a standard error response object
 * @param {String} message - Error message
 * @param {Object} error - Optional error details
 * @returns {Object} Standardized error response
 */
exports.buildErrorResponse = (message, error = null) => {
  const response = {
    success: false,
    message
  };
  
  if (error && process.env.NODE_ENV !== 'production') {
    response.error = error.toString();
  }
  
  return response;
}; 