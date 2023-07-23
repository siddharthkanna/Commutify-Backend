const User = require("../models/user");

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
    const { uid, email, name, mobileNumber, vehicles } = req.body;

    const user = new User({
      uid,
      email,
      name,
      mobileNumber,
      vehicles,
    });

    await user.save();

    res.status(201).json({ message: "User details saved successfully" });
  } catch (error) {
    console.error("Error saving user details:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

exports.getVehiclesByUserId = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findOne({ uid: userId });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Extract the vehicle names from the user data
    const vehicleNames = user.vehicles.map((vehicle) => vehicle.vehicleName);

    res.status(200).json({ vehicleNames });
  } catch (error) {
    console.error("Error fetching user details:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};
