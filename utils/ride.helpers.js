const turf = require('@turf/turf');

const isPointBetween = (point, start, end, tolerance = 0.01) => {
  const minLat = Math.min(start.latitude, end.latitude) - tolerance;
  const maxLat = Math.max(start.latitude, end.latitude) + tolerance;
  const minLng = Math.min(start.longitude, end.longitude) - tolerance;
  const maxLng = Math.max(start.longitude, end.longitude) + tolerance;
  
  return (
    point.latitude >= minLat && 
    point.latitude <= maxLat && 
    point.longitude >= minLng && 
    point.longitude <= maxLng
  );
};

const isWithinDistance = (point1, point2, maxDistanceKm = 2) => {
  const from = turf.point([point1.longitude, point1.latitude]);
  const to = turf.point([point2.longitude, point2.latitude]);
  const distance = turf.distance(from, to);
  return distance <= maxDistanceKm;
};

const isSameLocation = (point1, point2) => {
  return isWithinDistance(point1, point2, 0.05);
};

const isRideRouteMatch = (ride, userPickup, userDestination) => {
  if (!userPickup || !userDestination || 
      !userPickup.latitude || !userPickup.longitude ||
      !userDestination.latitude || !userDestination.longitude ||
      !ride.pickup.latitude || !ride.pickup.longitude ||
      !ride.destination.latitude || !ride.destination.longitude) {
    return false;
  }

  const ridePickup = { 
    latitude: ride.pickup.latitude, 
    longitude: ride.pickup.longitude 
  };
  
  const rideDestination = { 
    latitude: ride.destination.latitude, 
    longitude: ride.destination.longitude 
  };

  // Check if pickup point is along the route
  const isPickupValid = isPointBetween(userPickup, ridePickup, rideDestination);
  
  // Check if destination is:
  // 1. Along the route, OR
  // 2. Within 1km of the ride destination, OR
  // 3. Essentially the same location as the ride destination
  const isDestinationValid = 
    isPointBetween(userDestination, ridePickup, rideDestination) ||
    isWithinDistance(userDestination, rideDestination) ||
    isSameLocation(userDestination, rideDestination);

  return isPickupValid && isDestinationValid;
};


const RideStatus = {
  Upcoming: "Upcoming",
  InProgress: "InProgress",
  Completed: "Completed",
  Cancelled: "Cancelled"
};

const RideType = {
  Published: "published",
  Booked: "booked"
};

const BookingStatus = {
  Ongoing: "ongoing",
  Confirmed: "confirmed",
  Cancelled: "cancelled",
  Completed: "completed"
};



const calculateRemainingCapacity = (ride) => {
  const totalBookedSeats = ride.bookings
    .filter(booking => booking.status !== BookingStatus.Cancelled)
    .reduce((sum, booking) => sum + (booking.passengerCount || 1), 0);
  return ride.selectedCapacity - totalBookedSeats;
};


module.exports = {
  isPointBetween,
  isRideRouteMatch,
  isWithinDistance,
  isSameLocation,
  RideStatus,
  RideType,
  BookingStatus,
  calculateRemainingCapacity
}; 