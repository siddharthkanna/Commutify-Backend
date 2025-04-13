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

// Helper function to check if two points are approximately the same location
const isApproximatelySameLocation = (point1, point2, tolerance = 0.01) => {
  return (
    Math.abs(point1.latitude - point2.latitude) < tolerance &&
    Math.abs(point1.longitude - point2.longitude) < tolerance
  );
};

// Helper function to parse location data from request
const parseLocationData = (locationString) => {
  if (!locationString) return null;
  
  try {
    // If it's already an object, return it
    if (typeof locationString === 'object') {
      return locationString;
    }
    
    // Try to parse as JSON in case it's a stringified object
    try {
      const parsed = JSON.parse(locationString);
      return parsed;
    } catch (jsonError) {
      // If it's not valid JSON, assume it's a place name string
      // Create a simple location object with just the place name
      return {
        placeName: locationString
      };
    }
  } catch (e) {
    console.error("Error processing location data:", e);
    return null;
  }
};

// Helper function to check if two locations match by name or coordinates
const doLocationsMatch = (location1, location2, tolerance = 0.01) => {
  // If we have coordinates for both, check if they're approximately the same
  if (location1.latitude && location1.longitude && 
      location2.latitude && location2.longitude) {
    return (
      Math.abs(location1.latitude - location2.latitude) < tolerance &&
      Math.abs(location1.longitude - location2.longitude) < tolerance
    );
  }
  
  // If we have names for both, check if they're similar
  if (location1.placeName && location2.placeName) {
    // Simple case-insensitive substring check
    const name1 = location1.placeName.toLowerCase();
    const name2 = location2.placeName.toLowerCase();
    
    return name1.includes(name2) || name2.includes(name1);
  }
  
  // If one has a name and one has coordinates, no match
  return false;
};

// Helper function to check if a ride's route matches user's requirements
const isRideRouteMatch = (ride, userPickup, userDestination) => {
  // If no location filters were provided, all rides match
  if (!userPickup || !userDestination) {
    return true;
  }
  
  // Check if the ride's destination matches user's destination
  const destinationMatches = doLocationsMatch(ride.destination, userDestination);
  
  if (destinationMatches) {
    return true;
  }
  
  // If we only have place names and no coordinates, 
  // we can't do proper route matching, so just check names
  if ((!userPickup.latitude || !userPickup.longitude) ||
      (!userDestination.latitude || !userDestination.longitude)) {
    
    // Check if pickup location matches
    const pickupMatches = userPickup.placeName && 
      ride.pickup.placeName && 
      doLocationsMatch(ride.pickup, userPickup);
    
    // If either pickup or destination matches, consider it a match
    if (pickupMatches) {
      return true;
    }
    
    // Check waypoints by name
    if (ride.waypoints && ride.waypoints.length > 0) {
      return ride.waypoints.some(waypoint => {
        return (userDestination.placeName && 
                waypoint.placeName &&
                doLocationsMatch({ placeName: waypoint.placeName }, userDestination));
      });
    }
    
    return false;
  }
  
  // If we have coordinates, continue with the existing route matching logic
  const ridePickup = { 
    latitude: ride.pickup.latitude, 
    longitude: ride.pickup.longitude 
  };
  
  const rideDestination = { 
    latitude: ride.destination.latitude, 
    longitude: ride.destination.longitude 
  };
  
  // Check if user's pickup is between ride's pickup and destination
  const pickupIsBetween = isPointBetween(userPickup, ridePickup, rideDestination);
  
  // Check if user's destination is between ride's pickup and destination
  const destinationIsBetween = isPointBetween(userDestination, ridePickup, rideDestination);
  
  // Check waypoints as well
  let waypointsMatch = false;
  if (ride.waypoints && ride.waypoints.length > 0) {
    waypointsMatch = ride.waypoints.some(waypoint => {
      const waypointPoint = { 
        latitude: waypoint.latitude, 
        longitude: waypoint.longitude 
      };
      
      // Either waypoint near user destination or user pickup near waypoint
      return isApproximatelySameLocation(waypointPoint, userDestination) || 
             isPointBetween(userPickup, ridePickup, waypointPoint) || 
             isPointBetween(userDestination, waypointPoint, rideDestination);
    });
  }
  
  return pickupIsBetween || destinationIsBetween || waypointsMatch;
};

module.exports = {
  isPointBetween,
  isApproximatelySameLocation,
  parseLocationData,
  doLocationsMatch,
  isRideRouteMatch
}; 