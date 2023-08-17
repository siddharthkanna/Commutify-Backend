const mongoose = require("mongoose");
const Ride = require("./Ride");

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
      vehicleId: {
        type: mongoose.Schema.Types.ObjectId,
      },

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
  photoUrl: {
    type: String,
    required: false,
  },
});

const User = mongoose.model("User", userSchema);

module.exports = User;
