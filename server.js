const path = require("path");
const express = require("express");
const passport = require("passport");
const bodyParser = require("body-parser");
require("./db");

const app = express();
const port = process.env.PORT || 5000;

const authRoutes = require("./routes/auth.routes");
const rideRoutes = require("./routes/ride.routes");

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

// Middleware
app.use(express.json());
app.use(passport.initialize());

// Routes
app.use("/auth", authRoutes);
app.use("/ride", rideRoutes);

app.listen(port, () => {
  console.log(`App running on port ${port}`);
});
