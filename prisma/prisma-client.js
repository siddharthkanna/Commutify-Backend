const { PrismaClient } = require('@prisma/client');

// Instantiate Prisma client with query logging in development
const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
});

// Error handling wrapper for Prisma operations
async function prismaExec(operation) {
  try {
    return await operation();
  } catch (error) {
    console.error('Prisma operation failed:', error);
    // Add custom error handling here (e.g., logging to monitoring service)
    throw error;
  }
}

// User utility functions
prisma.findUserByUid = async (uid) => {
  return prismaExec(() => prisma.user.findUnique({ 
    where: { 
      uid: uid  // Explicitly use the uid parameter
    } 
  }));
};

prisma.findUserWithVehicles = async (uid) => {
  return prismaExec(() => 
    prisma.user.findUnique({
      where: { uid: uid },
      include: { 
        vehicles: true,
        preferences: true
      }
    })
  );
};

prisma.findUserWithDetails = async (uid) => {
  return prismaExec(() =>
    prisma.user.findUnique({
      where: { uid: uid },
      include: {
        vehicles: true,
        preferences: true,
        receivedRatings: {
          include: { rater: true }
        },
        ridesAsDriver: true,
        ridesAsPassenger: true
      }
    })
  );
};

// Ride utility functions
prisma.getRideWithDetails = async (id) => {
  return prismaExec(() => 
    prisma.ride.findUnique({
      where: { id: id },
      include: {
        driver: true,
        vehicle: true,
        pickup: true,
        destination: true,
        waypoints: {
          orderBy: { stopOrder: 'asc' }
        },
        bookings: {
          include: {
            passenger: true,
            rating: true
          }
        }
      }
    })
  );
};

prisma.getPublishedRidesByDriver = async (driverId) => {
  return prismaExec(() => 
    prisma.ride.findMany({
      where: { driverId: driverId },
      include: {
        pickup: true,
        destination: true,
        waypoints: {
          orderBy: { stopOrder: 'asc' }
        },
        bookings: {
          include: {
            passenger: true,
            rating: true
          }
        },
        vehicle: true
      },
      orderBy: {
        selectedDate: 'desc'
      }
    })
  );
};

prisma.getAvailableRides = async (userId) => {
  return prismaExec(() => 
    prisma.ride.findMany({
      where: {
        NOT: { driverId: userId },
        rideStatus: { not: "Completed" },
        selectedDate: { gte: new Date() }
      },
      include: {
        driver: {
          include: { receivedRatings: true }
        },
        vehicle: true,
        pickup: true,
        destination: true,
        waypoints: {
          orderBy: { stopOrder: 'asc' }
        },
        bookings: true
      },
      orderBy: [
        { selectedDate: 'asc' },
        { createdAt: 'desc' }
      ]
    })
  );
};

// Booking utility functions
prisma.getUserBookings = async (userId) => {
  return prismaExec(() => 
    prisma.booking.findMany({
      where: { passengerId: userId },
      include: {
        ride: {
          include: {
            driver: true,
            vehicle: true,
            pickup: true,
            destination: true,
            waypoints: {
              orderBy: { stopOrder: 'asc' }
            }
          }
        },
        rating: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    })
  );
};

// Transaction helpers
prisma.createRideWithLocations = async (rideData, pickupData, destinationData, waypoints = []) => {
  return prismaExec(() => 
    prisma.$transaction(async (tx) => {
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
            stopOrder: i + 1,
            estimatedArrival: waypoints[i].estimatedArrival ? new Date(waypoints[i].estimatedArrival) : null
          };
          
          await tx.waypoint.create({ data: waypointData });
        }
      }
      
      return ride;
    })
  );
};

// Rating utility functions
prisma.getUserRating = async (userId) => {
  return prismaExec(async () => {
    const ratings = await prisma.rating.findMany({
      where: { ratedId: userId }
    });
    
    if (ratings.length === 0) return null;
    
    return ratings.reduce((sum, rating) => sum + rating.rating, 0) / ratings.length;
  });
};

// Message utility functions
prisma.getConversations = async (userId) => {
  return prismaExec(async () => {
    // Get all unique conversations
    const sentMessages = await prisma.message.findMany({
      where: { senderId: userId },
      distinct: ['receiverId'],
      orderBy: { createdAt: 'desc' },
      include: { receiver: true }
    });
    
    const receivedMessages = await prisma.message.findMany({
      where: { receiverId: userId },
      distinct: ['senderId'],
      orderBy: { createdAt: 'desc' },
      include: { sender: true }
    });
    
    // Create a map of user IDs to their latest messages
    const userMap = new Map();
    
    // Add recipients of sent messages
    sentMessages.forEach(msg => {
      if (!userMap.has(msg.receiverId)) {
        userMap.set(msg.receiverId, {
          userId: msg.receiverId,
          name: msg.receiver.name,
          photoUrl: msg.receiver.photoUrl,
          lastMessageDate: msg.createdAt
        });
      }
    });
    
    // Add senders of received messages
    receivedMessages.forEach(msg => {
      if (!userMap.has(msg.senderId)) {
        userMap.set(msg.senderId, {
          userId: msg.senderId,
          name: msg.sender.name,
          photoUrl: msg.sender.photoUrl,
          lastMessageDate: msg.createdAt
        });
      } else {
        // Update with the most recent message date
        const existing = userMap.get(msg.senderId);
        if (msg.createdAt > existing.lastMessageDate) {
          existing.lastMessageDate = msg.createdAt;
          userMap.set(msg.senderId, existing);
        }
      }
    });
    
    // Convert map to array and sort by most recent message
    return Array.from(userMap.values()).sort((a, b) => b.lastMessageDate - a.lastMessageDate);
  });
};

// Export the enhanced Prisma client
module.exports = prisma; 