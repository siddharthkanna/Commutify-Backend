const mongoose = require("mongoose");
const dotenv = require("dotenv");

dotenv.config({path: "./vars/.env"});

const uri = process.env.mongoURI;
const dbName = process.env.dbName;

mongoose
  .connect(`${uri}/${dbName}`, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => {
    console.log("Connected to the MongoDB server");
  })

  .catch((err) => {
    console.log("Error connecting to the MongoDB server", err);
  });

