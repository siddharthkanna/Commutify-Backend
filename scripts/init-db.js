const { execSync } = require('child_process');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

console.log('Initializing Supabase database with Prisma...');

try {
  // Generate Prisma client
  console.log('Generating Prisma client...');
  execSync('npx prisma generate', { stdio: 'inherit' });
  
  // Push schema to the database
  console.log('Pushing schema to Supabase PostgreSQL database...');
  execSync('npx prisma db push', { stdio: 'inherit' });
  
  console.log('Database initialization completed successfully!');
  console.log('\nNext steps:');
  console.log('1. Ensure your Supabase credentials are correctly set in .env file');
  console.log('2. Test your application with the new database');
  console.log('\nCommands you can use:');
  console.log('- npm run prisma:studio  # to open Prisma Studio and manage your data');
  console.log('- npm start              # to start the server');
} catch (error) {
  console.error('Error initializing database:', error.message);
  process.exit(1);
} 