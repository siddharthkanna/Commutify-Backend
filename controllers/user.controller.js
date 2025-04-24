const prisma = require("../prisma/prisma-client");
const { hydrateUser, hydrateVehicle, buildSuccessResponse, buildErrorResponse } = require("../utils/hydrators");
const { cacheData, getCachedData, invalidateCache } = require("../utils/redis");

const CACHE_DURATIONS = {
  USER_DETAILS: 3600,        // 1 hour
  USER_PREFERENCES: 7200,    // 2 hours
  VEHICLE_DETAILS: 86400,    // 24 hours
  RIDE_DETAILS: 300,         // 5 minutes
  RATINGS: 1800             // 30 minutes
};

const generateCacheKey = (type, id, ...args) => {
  return `${type}:${id}:${args.join(':')}`;
};

/**
 * Handles user authentication with Supabase
 * Only checks if user exists, doesn't create a new user
 */
exports.handleAuth = async (req, res) => {
  try {
    const { 
      uid, 
      email
    } = req.body;

    // Input validation
    if (!uid || !email) {
      return res.status(400).json(buildErrorResponse("User ID and email are required"));
    }

    // Try to find the user first
    let user = await prisma.user.findUnique({
      where: { uid },
      include: {
        preferences: true,
        vehicles: {
          where: { isActive: true }
        }
      }
    });

    // If user exists, return the user data
    if (user) {
      return res.status(200).json({
        success: true,
        isNewUser: false,
        user: hydrateUser(user, {
          includePreferences: true,
          includeVehicles: true
        })
      });
    }

    // If user doesn't exist, just return isNewUser: true
    res.status(200).json({
      success: true,
      isNewUser: true,
      message: "User needs to be created"
    });
  } catch (error) {
    console.error("Auth error:", error);
    res.status(500).json(buildErrorResponse("Authentication error", error));
  }
};

/**
 * Creates a new user with given details
 */
exports.createNewUser = async (req, res) => {
  try {
    const { 
      uid, 
      email, 
      name, 
      photoUrl = null, 
      mobileNumber = null,
      role = 'PASSENGER', // Default role if not provided
      vehicle = null // Optional vehicle details
    } = req.body;

    // Input validation
    if (!uid || !email) {
      return res.status(400).json(buildErrorResponse("User ID and email are required"));
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { uid }
    });

    if (existingUser) {
      return res.status(409).json(buildErrorResponse("User already exists"));
    }

    // Create user data object
    const userData = {
      uid,
      email,
      name: name || email.split('@')[0], // Use email username as fallback
      mobileNumber: mobileNumber ? mobileNumber.toString() : "",
      photoUrl,
      roles: [role], // Use provided role or default to PASSENGER
      // Create default user preferences
      preferences: {
        create: {
          smoking: false,
          pets: false,
          music: true,
          conversation: true,
          airConditioned: true,
          maximumDetour: 15
        }
      }
    };
    
    // Add vehicle if provided
    let createdVehicle = null;
    
    // Create the user
    const user = await prisma.user.create({
      data: userData,
      include: {
        preferences: true
      }
    });
    
    // If vehicle details are provided, create the vehicle for the user
    if (vehicle && typeof vehicle === 'object') {
      // Extract vehicle details
      const { 
        vehicleNumber, 
        vehicleName, 
        vehicleType, 
        capacity = 4, 
        color = null, 
        make = null, 
        model = null, 
        year = null, 
        fuelType = null, 
        fuelEfficiency = null,
        features = []
      } = vehicle;
      
      // Basic validation for required vehicle fields
      if (vehicleNumber && vehicleName && vehicleType) {
        // Check if a vehicle with this number already exists
        const existingVehicle = await prisma.vehicle.findUnique({
          where: { vehicleNumber }
        });

        if (existingVehicle) {
          console.log("Found existing vehicle with the same number during user creation:", existingVehicle);
          // Don't fail user creation, just don't create the vehicle
          responseData = {
            success: true,
            user: hydrateUser(user, { includePreferences: true }),
            warning: "Vehicle with this number already exists and was not created"
          };
          return res.status(201).json(responseData);
        }
        
        createdVehicle = await prisma.vehicle.create({
          data: {
            vehicleNumber,
            vehicleName,
            vehicleType,
            capacity,
            color,
            make,
            model,
            year,
            fuelType,
            fuelEfficiency,
            features,
            photos: [],
            ownerId: user.id,
            isActive: true
          }
        });
      }
    }

    // Return the user with vehicle if created
    const responseData = {
      success: true,
      user: hydrateUser(user, { includePreferences: true })
    };
    
    if (createdVehicle) {
      responseData.vehicle = hydrateVehicle(createdVehicle);
    }

    res.status(201).json(responseData);
  } catch (error) {
    console.error("User creation error:", error);
    res.status(500).json(buildErrorResponse("User creation error", error));
  }
};

// Keep the previous function for backward compatibility
exports.checkUserExists = async (req, res) => {
  try {
    const { uid } = req.body;

    if (!uid) {
      return res.status(400).json(buildErrorResponse("User ID is required"));
    }

    const existingUser = await prisma.user.findUnique({
      where: { uid }
    });

    res.status(200).json(buildSuccessResponse({ exists: !!existingUser }));
  } catch (error) {
    console.error("Error checking user existence:", error);
    res.status(500).json(buildErrorResponse("Internal Server Error", error));
  }
};

// This function is now handled by createNewUser but kept for backward compatibility
exports.createUser = async (req, res) => {
  try {
    return exports.createNewUser(req, res);
  } catch (error) {
    console.error("Error in user creation:", error);
    res.status(500).json(buildErrorResponse("User creation failed", error));
  }
};

exports.updateUserDetails = async (req, res) => {
  try {
    const { uid } = req.body;
    
    // Input validation
    if (!uid) {
      return res.status(400).json(buildErrorResponse("User ID is required"));
    }

    // Extract updatable fields
    const {
      name,
      mobileNumber,
      bio,
      roles,
      photoUrl
    } = req.body;

    // Build update data object with only provided fields
    const updateData = {};
    if (name) updateData.name = name;
    if (mobileNumber) updateData.mobileNumber = mobileNumber.toString();
    if (bio !== undefined) updateData.bio = bio;
    if (roles) updateData.roles = roles;
    if (photoUrl) updateData.photoUrl = photoUrl;

    // Only perform update if there's something to update
    if (Object.keys(updateData).length === 0) {
      return res.status(400).json(buildErrorResponse("No fields to update were provided"));
    }

    // Perform the update
    const user = await prisma.user.update({
      where: { uid },
      data: updateData,
      include: {
        preferences: true,
        vehicles: {
          where: { isActive: true }
        }
      }
    });

    // Invalidate the user cache
    await invalidateCache(`user:${uid}`);

    res.json(buildSuccessResponse(
      { user: hydrateUser(user, { includePreferences: true, includeVehicles: true }) },
      "User details updated successfully"
    ));
  } catch (err) {
    console.error("Error updating user:", err);
    res.status(500).json(buildErrorResponse("User update failed", err));
  }
};

exports.getUserDetails = async (req, res) => {
  try {
    const userId = req.params.userId;
    const cacheKey = generateCacheKey('user', userId, 'details');
    
    const cachedUser = await getCachedData(cacheKey);
    if (cachedUser) return res.json(buildSuccessResponse({ user: cachedUser }));

    // Input validation
    if (!userId) {
      return res.status(400).json(buildErrorResponse("User ID is required"));
    }

    // If not in cache, get from database
    const user = await prisma.user.findUnique({
      where: { uid: userId },
      include: {
        ridesAsDriver: {
          select: { id: true }
        },
        ridesAsPassenger: {
          select: { id: true }
        },
        preferences: true,
        vehicles: {
          where: { isActive: true }
        },
        receivedRatings: {
          select: {
            rating: true,
            rater: {
              select: {
                name: true,
                photoUrl: true
              }
            }
          }
        }
      }
    });
    
    if (!user) {
      return res.status(404).json(buildErrorResponse("User not found"));
    }

    // Use the hydrator with all options enabled
    const userResponse = hydrateUser(user, {
      includePreferences: true,
      includeVehicles: true,
      includeRideStats: true,
      includeRatings: true,
      includeRatingDetails: true
    });

    // Cache the hydrated user data
    await cacheData(cacheKey, userResponse, CACHE_DURATIONS.USER_DETAILS);

    res.json(buildSuccessResponse({ user: userResponse }));
  } catch (error) {
    console.error("Error fetching user details:", error);
    res.status(500).json(buildErrorResponse("Failed to retrieve user details", error));
  }
};

exports.getVehicles = async (req, res) => {
  try {
    const { userId } = req.params;
    const cacheKey = generateCacheKey('user', userId, 'vehicles');

    // Try to get vehicles from cache first
    const cachedVehicles = await getCachedData(cacheKey);
    if (cachedVehicles) {
      return res.status(200).json(buildSuccessResponse({ vehicles: cachedVehicles }));
    }

    const user = await prisma.user.findUnique({
      where: { uid: userId },
      include: { vehicles: true }
    });

    if (!user) {
      return res.status(404).json(buildErrorResponse("User not found"));
    }

    const vehicles = user.vehicles.map(vehicle => hydrateVehicle(vehicle));

    // Cache the hydrated vehicles data
    await cacheData(cacheKey, vehicles, CACHE_DURATIONS.VEHICLE_DETAILS);

    res.status(200).json(buildSuccessResponse({ vehicles }));
  } catch (error) {
    console.error("Error fetching vehicles:", error);
    res.status(500).json(buildErrorResponse("Failed to retrieve vehicles", error));
  }
};

exports.addVehicle = async (req, res) => {
  const userId = req.params.userId;
  const { 
    vehicleNumber, 
    vehicleName, 
    vehicleType, 
    capacity, 
    color, 
    make, 
    model, 
    year, 
    fuelType, 
    fuelEfficiency,
    features
  } = req.body;
  console.log("vehicle details ", req.body);
  if (!vehicleNumber || !vehicleName || !vehicleType) {
    return res.status(400).json(buildErrorResponse("Vehicle number, name, and type are required"));
  }

  try {
    const user = await prisma.user.findUnique({
      where: { uid: userId }
    });
    
    if (!user) {
      return res.status(404).json(buildErrorResponse("User not found"));
    }

    // Check if a vehicle with this number already exists
    const existingVehicle = await prisma.vehicle.findUnique({
      where: { vehicleNumber: vehicleNumber }
    });

    if (existingVehicle) {
      console.log("Found existing vehicle with the same number:", existingVehicle);
      return res.status(400).json(buildErrorResponse("A vehicle with this number already exists"));
    }

    const vehicle = await prisma.vehicle.create({
      data: {
        vehicleNumber,
        vehicleName,
        vehicleType,
        capacity: capacity || 4,
        color,
        make,
        model,
        year,
        fuelType,
        fuelEfficiency,
        features: features || [],
        photos: [],
        ownerId: user.id
      }
    });

    // Invalidate the vehicles cache for this user
    await invalidateCache(generateCacheKey('user', userId, 'vehicles'));
    // Also invalidate the user details cache as it includes vehicles
    await invalidateCache(generateCacheKey('user', userId, 'details'));

    console.log("vehicle created ", vehicle);

    res.status(201).json(buildSuccessResponse(
      { vehicle: hydrateVehicle(vehicle) }, 
      "Vehicle added successfully"
    ));
  } catch (error) {
    console.error("Error adding vehicle:", error);
    res.status(500).json(buildErrorResponse("Failed to add vehicle", error));
  }
};

exports.updateVehicle = async (req, res) => {
  const userId = req.params.userId;
  const vehicleId = req.params.vehicleId;
  const { 
    vehicleNumber, 
    vehicleName, 
    vehicleType, 
    capacity, 
    color, 
    make, 
    model, 
    year, 
    fuelType, 
    fuelEfficiency,
    features,
    photos,
    isActive
  } = req.body;

  if (!vehicleNumber || !vehicleName || !vehicleType) {
    return res.status(400).json(buildErrorResponse("Vehicle number, name, and type are required"));
  }

  try {
    // First check if user exists
    const user = await prisma.user.findUnique({
      where: { uid: userId }
    });

    if (!user) {
      return res.status(404).json(buildErrorResponse("User not found"));
    }

    // Then check if vehicle belongs to user
    const vehicle = await prisma.vehicle.findFirst({
      where: {
        id: vehicleId,
        ownerId: user.id
      }
    });

    if (!vehicle) {
      return res.status(404).json(buildErrorResponse("Vehicle not found for this user"));
    }

    // If vehicle number is changed, check if it conflicts with an existing vehicle
    if (vehicleNumber !== vehicle.vehicleNumber) {
      const existingVehicle = await prisma.vehicle.findUnique({
        where: { vehicleNumber }
      });

      if (existingVehicle && existingVehicle.id !== vehicleId) {
        console.log("Found existing vehicle with the same number during update:", existingVehicle);
        return res.status(400).json(buildErrorResponse("A different vehicle with this number already exists"));
      }
    }

    // Update the vehicle
    const updatedVehicle = await prisma.vehicle.update({
      where: { id: vehicleId },
      data: {
        vehicleNumber,
        vehicleName,
        vehicleType,
        capacity: capacity || vehicle.capacity,
        color,
        make,
        model,
        year,
        fuelType,
        fuelEfficiency,
        features: features || vehicle.features,
        photos: photos || vehicle.photos,
        isActive: isActive !== undefined ? isActive : vehicle.isActive
      }
    });

    // Invalidate the vehicles cache for this user
    await invalidateCache(generateCacheKey('user', userId, 'vehicles'));
    // Also invalidate the user details cache as it includes vehicles
    await invalidateCache(generateCacheKey('user', userId, 'details'));

    res.json(buildSuccessResponse(
      { vehicle: hydrateVehicle(updatedVehicle) },
      "Vehicle details updated successfully"
    ));
  } catch (error) {
    console.error("Error updating vehicle:", error);
    res.status(500).json(buildErrorResponse("Failed to update vehicle", error));
  }
};

exports.deleteVehicle = async (req, res) => {
  const userId = req.params.userId;
  const vehicleId = req.params.vehicleId;

  try {
    // First check if user exists
    const user = await prisma.user.findUnique({
      where: { uid: userId }
    });

    if (!user) {
      return res.status(404).json(buildErrorResponse("User not found"));
    }

    // Then check if vehicle belongs to user
    const vehicle = await prisma.vehicle.findFirst({
      where: {
        id: vehicleId,
        ownerId: user.id
      }
    });

    if (!vehicle) {
      return res.status(404).json(buildErrorResponse("Vehicle not found for this user"));
    }

    // Delete the vehicle
    await prisma.vehicle.delete({
      where: { id: vehicleId }
    });

    // Invalidate the vehicles cache for this user
    await invalidateCache(generateCacheKey('user', userId, 'vehicles'));
    // Also invalidate the user details cache as it includes vehicles
    await invalidateCache(generateCacheKey('user', userId, 'details'));

    res.json(buildSuccessResponse(null, "Vehicle deleted successfully"));
  } catch (error) {
    console.error("Error deleting vehicle:", error);
    res.status(500).json(buildErrorResponse("Failed to delete vehicle", error));
  }
};

// Get or update user preferences
exports.getUserPreferences = async (req, res) => {
  try {
    const userId = req.params.userId;
    
    const user = await prisma.user.findUnique({
      where: { uid: userId },
      include: { preferences: true }
    });
    
    if (!user) {
      return res.status(404).json(buildErrorResponse("User not found"));
    }
    
    if (!user.preferences) {
      // Create default preferences if none exist
      const preferences = await prisma.userPreference.create({
        data: {
          userId: user.id,
          smoking: false,
          pets: false,
          music: true,
          conversation: true,
          airConditioned: true,
          maximumDetour: 15
        }
      });
      
      return res.json(buildSuccessResponse({ preferences }));
    }
    
    res.json(buildSuccessResponse({ preferences: user.preferences }));
  } catch (error) {
    console.error("Error fetching preferences:", error);
    res.status(500).json(buildErrorResponse("Failed to retrieve preferences", error));
  }
};

// Update user preferences
exports.updateUserPreferences = async (req, res) => {
  try {
    const userId = req.params.userId;
    const { 
      smoking, 
      pets, 
      music, 
      conversation, 
      airConditioned, 
      maximumDetour 
    } = req.body;
    
    const user = await prisma.user.findUnique({
      where: { uid: userId },
      include: { preferences: true }
    });
    
    if (!user) {
      return res.status(404).json(buildErrorResponse("User not found"));
    }
    
    let preferences;
    
    if (!user.preferences) {
      // Create preferences if they don't exist
      preferences = await prisma.userPreference.create({
        data: {
          userId: user.id,
          smoking: smoking !== undefined ? smoking : false,
          pets: pets !== undefined ? pets : false,
          music: music !== undefined ? music : true,
          conversation: conversation !== undefined ? conversation : true,
          airConditioned: airConditioned !== undefined ? airConditioned : true,
          maximumDetour: maximumDetour !== undefined ? maximumDetour : 15
        }
      });
    } else {
      // Update existing preferences
      const updateData = {};
      if (smoking !== undefined) updateData.smoking = smoking;
      if (pets !== undefined) updateData.pets = pets;
      if (music !== undefined) updateData.music = music;
      if (conversation !== undefined) updateData.conversation = conversation;
      if (airConditioned !== undefined) updateData.airConditioned = airConditioned;
      if (maximumDetour !== undefined) updateData.maximumDetour = maximumDetour;
      
      preferences = await prisma.userPreference.update({
        where: { userId: user.id },
        data: updateData
      });
    }

    // Invalidate the user cache when preferences are updated
    await invalidateCache(`user:${userId}`);
    
    res.json(buildSuccessResponse(
      { preferences },
      "Preferences updated successfully"
    ));
  } catch (error) {
    console.error("Error updating preferences:", error);
    res.status(500).json(buildErrorResponse("Failed to update preferences", error));
  }
};

// Submit a rating
exports.submitRating = async (req, res) => {
  try {
    const { raterUid, ratedUid, bookingId, rating, comment } = req.body;
    
    if (!raterUid || !ratedUid || !rating || rating < 1 || rating > 5) {
      return res.status(400).json(buildErrorResponse("Valid rater, rated user and rating (1-5) are required"));
    }
    
    // Find users
    const rater = await prisma.user.findUnique({ where: { uid: raterUid } });
    const rated = await prisma.user.findUnique({ where: { uid: ratedUid } });
    
    if (!rater || !rated) {
      return res.status(404).json(buildErrorResponse("One or both users not found"));
    }
    
    // Check if booking exists if bookingId is provided
    let booking = null;
    if (bookingId) {
      booking = await prisma.booking.findUnique({ where: { id: bookingId } });
      if (!booking) {
        return res.status(404).json(buildErrorResponse("Booking not found"));
      }
    }
    
    // Create the rating
    const newRating = await prisma.rating.create({
      data: {
        rating,
        comment,
        raterId: rater.id,
        ratedId: rated.id,
        bookingId: booking?.id
      }
    });
    
    // Update user's average rating
    const userRatings = await prisma.rating.findMany({
      where: { ratedId: rated.id }
    });
    
    const avgRating = userRatings.reduce((sum, r) => sum + r.rating, 0) / userRatings.length;
    
    await prisma.user.update({
      where: { id: rated.id },
      data: { rating: avgRating }
    });
    
    res.status(201).json(buildSuccessResponse(
      { rating: newRating },
      "Rating submitted successfully"
    ));
  } catch (error) {
    console.error("Error submitting rating:", error);
    res.status(500).json(buildErrorResponse("Failed to submit rating", error));
  }
};

// Get user ratings
exports.getUserRatings = async (req, res) => {
  try {
    const userId = req.params.userId;
    
    const user = await prisma.user.findUnique({
      where: { uid: userId }
    });
    
    if (!user) {
      return res.status(404).json(buildErrorResponse("User not found"));
    }
    
    const ratings = await prisma.rating.findMany({
      where: { ratedId: user.id },
      include: {
        rater: {
          select: {
            name: true,
            photoUrl: true,
            uid: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    
    res.json(buildSuccessResponse({ ratings }));
  } catch (error) {
    console.error("Error fetching ratings:", error);
    res.status(500).json(buildErrorResponse("Failed to retrieve ratings", error));
  }
};
