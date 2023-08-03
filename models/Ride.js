// models/Ride.js

const mongoose = require("mongoose");

const rideSchema = new mongoose.Schema({
  driverId: {
    type: String,
    required: true,
  },
  passengerId: [{ type: String }],
  pickupLocation: [
    {
      latitude: {
        type: Number,
        required: true,
      },
      longitude: {
        type: Number,
        required: true,
      },
      placeName: {
        type: String,
        required: true,
      },
    },
  ],
  destinationLocation: [
    {
      latitude: {
        type: Number,
        required: true,
      },
      longitude: {
        type: Number,
        required: true,
      },
      placeName: {
        type: String,
        required: true,
      },
    },
  ],
  immediateMode: {
    type: Boolean,
    required: true,
  },
  scheduledMode: {
    type: Boolean,
    required: true,
  },
  selectedVehicle: {
    type: String,
    required: true,
  },
  selectedCapacity: {
    type: Number,
    required: true,
  },
  selectedDate: {
    type: Date,
    required: true,
  },
  selectedTime: {
    type: String,
    required: true,
  },
  price: {
    type: Number,
    required: true,
  },

  rideType: {
    type: String,
    enum: ["booked", "published"],
    required: true,
  },
  rideStatus: {
    type: String,
    enum: ["Upcoming", "Completed", "Cancelled"],
    default: "Upcoming",
    required: false,
  },
});

const Ride = mongoose.model("Ride", rideSchema);

module.exports = Ride;
