// Helper function to check if a point is between two other points
const isPointBetween = (point, start, end, tolerance = 0.01) => {
  // Basic bounding box check
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

  // Check direct route match
  if (isPointBetween(userPickup, ridePickup, rideDestination) &&
      isPointBetween(userDestination, ridePickup, rideDestination)) {
    return true;
  }

  // // Check waypoint routes only if we have waypoints with coordinates
  // if (ride.waypoints?.length > 0) {
  //   // Create an array of route segments including waypoints
  //   const routePoints = [ridePickup, ...ride.waypoints
  //     .filter(w => w.latitude && w.longitude)
  //     .map(w => ({
  //       latitude: w.latitude,
  //       longitude: w.longitude
  //     })), rideDestination];

  //   // Check each consecutive pair of points in the route
  //   for (let i = 0; i < routePoints.length - 1; i++) {
  //     const segmentStart = routePoints[i];
  //     const segmentEnd = routePoints[i + 1];
      
  //     if (isPointBetween(userPickup, segmentStart, segmentEnd) &&
  //         isPointBetween(userDestination, segmentStart, segmentEnd)) {
  //       return true;
  //     }
  //   }
  // }

  return false;
};

module.exports = {
  isPointBetween,
  isRideRouteMatch
}; 