const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  uid: {
    type: String,
    required: true,
  },
  name: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
  },
  role: {
    type: String,
    enum: ["driver", "passenger"],
    required: false,
  },
  vehicles: [
    {
      vehicleNumber: {
        type: String,
        required: true,
      },
      vehicleName: {
        type: String,
        required: true,
      },
      vehicleType: {
        type: String,
        required: true,
      },
    },
  ],
  mobileNumber: { type: Number, required: true },
  ridesAsDriver: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Ride",
    },
  ],
  ridesAsPassenger: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Ride",
    },
  ],
});



const User = mongoose.model("User", userSchema);

module.exports = User;
