const { createClient } = require('redis');
const dotenv = require('dotenv');

dotenv.config();

const redisClient = createClient({
    url: process.env.REDIS_URL
});

redisClient.on('error', (err) => console.error('Redis Client Error:', err));
redisClient.on('connect', () => console.log('Connected to Redis'));

redisClient.connect().catch(console.error);

const DEFAULT_EXPIRATION = 3600;

const cacheData = async (key, data, expiration = DEFAULT_EXPIRATION) => {
    try {
        await redisClient.setEx(key, expiration, JSON.stringify(data));
        return true;
    } catch (error) {
        console.error('Redis cache error:', error);
        return false;
    }
};

const getCachedData = async (key) => {
    try {
        const data = await redisClient.get(key);
        return data ? JSON.parse(data) : null;
    } catch (error) {
        console.error('Redis get error:', error);
        return null;
    }
};

const invalidateCache = async (key) => {
    try {
        await redisClient.del(key);
        return true;
    } catch (error) {
        console.error('Redis delete error:', error);
        return false;
    }
};

module.exports = {
    redisClient,
    cacheData,
    getCachedData,
    invalidateCache
}; 