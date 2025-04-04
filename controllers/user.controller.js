const prisma = require("../prisma/prisma-client");

exports.checkUserExists = async (req, res) => {
  try {
    const { uid } = req.body;

    const existingUser = await prisma.user.findUnique({
      where: { uid }
    });

    if (existingUser) {
      res.status(201).json({ exists: true });
    } else {
      res.status(201).json({ exists: false });
    }
  } catch (error) {
    console.error("Error checking user existence:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

exports.createUser = async (req, res) => {
  try {
    const { uid, email, name, mobileNumber, roles = ['PASSENGER'], vehicles = [], photoUrl, bio } = req.body;

    const user = await prisma.user.create({
      data: {
        uid,
        email,
        name,
        mobileNumber: mobileNumber.toString(),
        photoUrl,
        bio,
        roles,
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
        },
        vehicles: {
          create: vehicles.map(vehicle => ({
            vehicleNumber: vehicle.vehicleNumber,
            vehicleName: vehicle.vehicleName,
            vehicleType: vehicle.vehicleType || 'SEDAN', // Default to SEDAN if not specified
            capacity: vehicle.capacity || 4,
            color: vehicle.color,
            make: vehicle.make,
            model: vehicle.model,
            year: vehicle.year,
            fuelType: vehicle.fuelType
          }))
        }
      },
      include: {
        preferences: true
      }
    });

    res.status(201).json({ message: "User details saved successfully", userId: user.id });
  } catch (error) {
    console.error("Error saving user details:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

exports.getVehicles = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await prisma.user.findUnique({
      where: { uid: userId },
      include: { vehicles: true }
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const vehicles = user.vehicles.map((vehicle) => {
      return {
        vehicleId: vehicle.id,
        vehicleName: vehicle.vehicleName,
        vehicleNumber: vehicle.vehicleNumber,
        vehicleType: vehicle.vehicleType,
        color: vehicle.color,
        make: vehicle.make,
        model: vehicle.model,
        year: vehicle.year,
        fuelType: vehicle.fuelType,
        fuelEfficiency: vehicle.fuelEfficiency,
        capacity: vehicle.capacity,
        features: vehicle.features,
        photos: vehicle.photos,
        isActive: vehicle.isActive
      };
    });

    res.status(200).json({ vehicles });
  } catch (error) {
    console.error("Error fetching user details:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

exports.updateUserDetails = async (req, res) => {
  const { uid, newName, newMobileNumber, bio, roles, photoUrl } = req.body;

  try {
    const updateData = {};
    
    if (newName) updateData.name = newName;
    if (newMobileNumber) updateData.mobileNumber = newMobileNumber.toString();
    if (bio !== undefined) updateData.bio = bio;
    if (roles) updateData.roles = roles;
    if (photoUrl) updateData.photoUrl = photoUrl;

    const user = await prisma.user.update({
      where: { uid },
      data: updateData
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({ message: "Details updated successfully", user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "An error occurred" });
  }
};

exports.getUserDetails = async (req, res) => {
  try {
    const userId = req.params.userId;

    const user = await prisma.user.findUnique({
      where: { uid: userId },
      include: {
        ridesAsDriver: true,
        ridesAsPassenger: true,
        preferences: true,
        vehicles: true,
        receivedRatings: {
          include: {
            rater: true
          }
        }
      }
    });
    
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Calculate average rating
    let avgRating = null;
    if (user.receivedRatings.length > 0) {
      avgRating = user.receivedRatings.reduce((sum, rating) => sum + rating.rating, 0) / user.receivedRatings.length;
    }

    res.json({
      name: user.name,
      mobileNumber: user.mobileNumber,
      email: user.email,
      bio: user.bio,
      photoUrl: user.photoUrl,
      roles: user.roles,
      rating: avgRating,
      ridesAsDriver: user.ridesAsDriver.length,
      ridesAsPassenger: user.ridesAsPassenger.length,
      preferences: user.preferences,
      vehicles: user.vehicles.map(v => ({
        id: v.id,
        vehicleNumber: v.vehicleNumber,
        vehicleName: v.vehicleName,
        vehicleType: v.vehicleType,
        isActive: v.isActive,
        capacity: v.capacity
      }))
    });
  } catch (error) {
    res.status(500).json({ error });
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

  if (!vehicleNumber || !vehicleName || !vehicleType) {
    return res.status(400).json({ error: "Vehicle number, name, and type are required" });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { uid: userId }
    });
    
    if (!user) {
      return res.status(404).json({ error: "User not found" });
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

    res.status(201).json({ message: "Vehicle added successfully", vehicle });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ error: "An error occurred" });
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
    return res.status(400).json({ error: "Vehicle number, name, and type are required" });
  }

  try {
    // First check if user exists
    const user = await prisma.user.findUnique({
      where: { uid: userId }
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Then check if vehicle belongs to user
    const vehicle = await prisma.vehicle.findFirst({
      where: {
        id: vehicleId,
        ownerId: user.id
      }
    });

    if (!vehicle) {
      return res.status(404).json({ error: "Vehicle not found for this user" });
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

    res.json({ message: "Vehicle details updated successfully", vehicle: updatedVehicle });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ error: "An error occurred" });
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
      return res.status(404).json({ error: "User not found" });
    }

    // Then check if vehicle belongs to user
    const vehicle = await prisma.vehicle.findFirst({
      where: {
        id: vehicleId,
        ownerId: user.id
      }
    });

    if (!vehicle) {
      return res.status(404).json({ error: "Vehicle not found for this user" });
    }

    // Delete the vehicle
    await prisma.vehicle.delete({
      where: { id: vehicleId }
    });

    res.json({ message: "Vehicle deleted successfully" });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ error: "An error occurred" });
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
      return res.status(404).json({ error: "User not found" });
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
      
      return res.json({ preferences });
    }
    
    res.json({ preferences: user.preferences });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ error: "An error occurred" });
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
      return res.status(404).json({ error: "User not found" });
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
    
    res.json({ message: "Preferences updated successfully", preferences });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ error: "An error occurred" });
  }
};

// Submit a rating
exports.submitRating = async (req, res) => {
  try {
    const { raterUid, ratedUid, bookingId, rating, comment } = req.body;
    
    if (!raterUid || !ratedUid || !rating || rating < 1 || rating > 5) {
      return res.status(400).json({ error: "Valid rater, rated user and rating (1-5) are required" });
    }
    
    // Find users
    const rater = await prisma.user.findUnique({ where: { uid: raterUid } });
    const rated = await prisma.user.findUnique({ where: { uid: ratedUid } });
    
    if (!rater || !rated) {
      return res.status(404).json({ error: "One or both users not found" });
    }
    
    // Check if booking exists if bookingId is provided
    let booking = null;
    if (bookingId) {
      booking = await prisma.booking.findUnique({ where: { id: bookingId } });
      if (!booking) {
        return res.status(404).json({ error: "Booking not found" });
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
    
    res.status(201).json({ message: "Rating submitted successfully", rating: newRating });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ error: "An error occurred" });
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
      return res.status(404).json({ error: "User not found" });
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
    
    res.json({ ratings });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ error: "An error occurred" });
  }
};
