const mongoose = require('mongoose');

const rideSchema = new mongoose.Schema({
  driver: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  passengers: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    source: {
      type: String,
      required: true,
    },
    destination: {
      type: String,
      required: true,
    },
  }],
  availableSeats: {
    type: Number,
    required: true,
    default: 0,
  },
  departureTime: {
    type: Date,
    required: true,
  },
  // Other ride properties...
});

const Ride = mongoose.model('Ride', rideSchema);

module.exports = Ride;
