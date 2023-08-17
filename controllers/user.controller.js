const User = require("../models/user");
const mongoose = require("mongoose");

exports.checkUserExists = async (req, res) => {
  try {
    const { uid } = req.body;

    const existingUser = await User.findOne({ $or: [{ uid }] });

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
    const { uid, email, name, mobileNumber, vehicles, photoUrl } = req.body;

    const user = new User({
      uid,
      email,
      name,
      mobileNumber,
      vehicles,
      photoUrl,
    });

    await user.save();

    res.status(201).json({ message: "User details saved successfully" });
  } catch (error) {
    console.error("Error saving user details:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

exports.getVehicles = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findOne({ uid: userId });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const vehicles = user.vehicles.map((vehicle) => {
      return {
        vehicleId: vehicle._id.toString(),
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
    const user = await User.findOneAndUpdate(
      { uid },
      { name: newName, mobileNumber: newMobileNumber },
      { new: true }
    );

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

    const user = await User.findOne({ uid: userId });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({
      name: user.name,
      mobileNumber: user.mobileNumber.toString(),
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
    const user = await User.findOne({ uid: userId });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    user.vehicles.push({ vehicleNumber, vehicleName, vehicleType });
    await user.save();

    res.status(201).json({ message: "Vehicle added successfully", user });
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
    const user = await User.findOne({ uid: userId });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const vehicle = user.vehicles.find(
      (vehicle) => vehicle._id.toString() === vehicleId
    );

    if (!vehicle) {
      return res.status(404).json({ error: "Vehicle not found for this user" });
    }

    vehicle.vehicleNumber = vehicleNumber;
    vehicle.vehicleName = vehicleName;
    vehicle.vehicleType = vehicleType;

    await user.save();

    res.json({ message: "Vehicle details updated successfully", vehicle });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ error: "An error occurred" });
  }
};

exports.deleteVehicle = async (req, res) => {
  const userId = req.params.userId;
  const vehicleId = req.params.vehicleId;

  try {
    const user = await User.findOne({ uid: userId });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const vehicleIndex = user.vehicles.find(
      (vehicle) => vehicle._id.toString() === vehicleId
    );

    if (vehicleIndex === -1) {
      return res.status(404).json({ error: "Vehicle not found" });
    }

    user.vehicles.splice(vehicleIndex, 1);
    await user.save();

    res.json({ message: "Vehicle deleted successfully" });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ error: "An error occurred" });
  }
};
