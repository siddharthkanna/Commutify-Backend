# Commutify Backend

A backend service for the Commutify ride-sharing application, now powered by Supabase and Prisma ORM.

## Database Setup with Supabase + Prisma

This project uses Supabase (PostgreSQL) with Prisma ORM for data management. Follow these steps to set up and use the database system:

### Prerequisites

- Node.js (v14 or higher)
- A Supabase account with a new project set up
- Your Supabase PostgreSQL credentials

### Getting Started

1. Clone this repository
2. Run the setup script which will install dependencies and initialize the database:
   ```
   npm run setup
   ```

   Or do it step by step:
   ```
   npm install
   npm run db:init
   ```

3. Configure your Supabase connection:
   - Update the `.env` file with your Supabase credentials:
   ```
   DATABASE_URL="postgresql://postgres:[YOUR-PASSWORD]@db.[YOUR-SUPABASE-PROJECT-ID].supabase.co:5432/postgres"
   SUPABASE_URL="https://[YOUR-SUPABASE-PROJECT-ID].supabase.co"
   SUPABASE_KEY="[YOUR-SUPABASE-ANON-KEY]"
   SUPABASE_SERVICE_KEY="[YOUR-SUPABASE-SERVICE-ROLE-KEY]"
   ```
   - You can find these credentials in your Supabase project settings

4. Start the server:
   ```
   npm start
   ```

### Database Management

- **Generate Prisma client**: `npm run prisma:generate`
- **Push schema changes**: `npm run prisma:push`
- **Open Prisma Studio**: `npm run prisma:studio`

> **Note**: All Prisma commands are configured to use `npx` to avoid "command not found" errors.

### Project Structure

- `/prisma` - Prisma schema and client
- `/controllers` - API controllers
- `/routes` - API routes
- `/utils` - Utility functions including Supabase client
- `/scripts` - Database initialization scripts

## API Documentation

[API documentation would go here]
