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
    const { uid, email, name, mobileNumber, vehicles = [], photoUrl } = req.body;

    const user = await prisma.user.create({
      data: {
        uid,
        email,
        name,
        mobileNumber: mobileNumber.toString(),
        photoUrl,
        vehicles: {
          create: vehicles.map(vehicle => ({
            vehicleNumber: vehicle.vehicleNumber,
            vehicleName: vehicle.vehicleName,
            vehicleType: vehicle.vehicleType
          }))
        }
      }
    });

    res.status(201).json({ message: "User details saved successfully" });
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
      };
    });

    res.status(200).json({ vehicles });
  } catch (error) {
    console.error("Error fetching user details:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

exports.updateUserDetails = async (req, res) => {
  const { uid, newName, newMobileNumber } = req.body;

  try {
    const user = await prisma.user.update({
      where: { uid },
      data: { 
        name: newName, 
        mobileNumber: newMobileNumber.toString() 
      }
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    console.log(user.name);

    res.json({ message: "Details updated successfully" });
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
        ridesAsPassenger: true
      }
    });
    
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({
      name: user.name,
      mobileNumber: user.mobileNumber,
      email: user.email,
      ridesAsDriver: user.ridesAsDriver.length,
      ridesAsPassenger: user.ridesAsPassenger.length,
    });
  } catch (error) {
    res.status(500).json({ error });
  }
};

exports.addVehicle = async (req, res) => {
  const userId = req.params.userId;
  const { vehicleNumber, vehicleName, vehicleType } = req.body;

  if (!vehicleNumber || !vehicleName || !vehicleType) {
    return res.status(400).json({ error: "All fields are required" });
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
  const { vehicleNumber, vehicleName, vehicleType } = req.body;

  if (!vehicleNumber || !vehicleName || !vehicleType) {
    return res.status(400).json({ error: "All fields are required" });
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
        vehicleType
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
