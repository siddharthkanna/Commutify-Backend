const path = require("path");
const express = require("express");
const passport = require("passport");
const bodyParser = require("body-parser");
require("./db");

const app = express();
const port = 3000;

const authRoutes = require("./routes/auth.routes");

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

// Middleware
app.use(express.json());
app.use(passport.initialize());

// Routes
app.use("/auth", authRoutes);

app.listen(port, () => {
  console.log(`App running on port ${port}`);
});
