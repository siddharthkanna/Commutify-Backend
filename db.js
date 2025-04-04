const dotenv = require("dotenv");
const prisma = require('./prisma/prisma-client');

dotenv.config();

// Log when successfully connected to the database
prisma.$connect()
  .then(() => {
    console.log("Connected to the Supabase PostgreSQL database");
  })
  .catch((err) => {
    console.error("Error connecting to the database", err);
  });

// Handle Node process termination
process.on('beforeExit', async () => {
  await prisma.$disconnect();
  console.log('Disconnected from the database');
});

module.exports = prisma;

