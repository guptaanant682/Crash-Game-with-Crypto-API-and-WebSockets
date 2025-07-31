require('dotenv').config();

module.exports = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: process.env.PORT || 3000,
  MONGODB_URI: process.env.MONGODB_URI,
  COINGECKO_API_KEY: process.env.COINGECKO_API_KEY,
  CORS_ORIGIN: process.env.CORS_ORIGIN || '*',
  GAME_ROUND_DURATION: parseInt(process.env.GAME_ROUND_DURATION) || 10000,
  MULTIPLIER_UPDATE_INTERVAL: parseInt(process.env.MULTIPLIER_UPDATE_INTERVAL) || 100,
  PRICE_CACHE_DURATION: parseInt(process.env.PRICE_CACHE_DURATION) || 10000,
  COINGECKO_BASE_URL: 'https://api.coingecko.com/api/v3',
  SUPPORTED_CURRENCIES: ['bitcoin', 'ethereum'],
  MAX_CRASH_MULTIPLIER: 120,
  MIN_CRASH_MULTIPLIER: 1.01,
  GROWTH_FACTOR: parseFloat(process.env.GROWTH_FACTOR) || 0.04
};