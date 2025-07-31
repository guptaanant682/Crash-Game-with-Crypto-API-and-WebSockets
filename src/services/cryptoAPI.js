const axios = require('axios');
const config = require('../config/environment');

class CryptoAPIService {
  constructor() {
    this.cache = new Map();
    this.lastFetch = new Map();
    this.isLoading = new Map();
    
    this.api = axios.create({
      baseURL: config.COINGECKO_BASE_URL,
      timeout: 10000,
      headers: {
        'X-CG-Demo-API-Key': config.COINGECKO_API_KEY,
        'Accept': 'application/json'
      }
    });

    // Setup axios interceptors for error handling
    this.api.interceptors.response.use(
      response => response,
      error => {
        console.error('CoinGecko API Error:', error.response?.data || error.message);
        return Promise.reject(error);
      }
    );
  }

  /**
   * Get current prices for supported cryptocurrencies
   * @param {boolean} forceRefresh - Force refresh cache
   * @returns {Object} Price data
   */
  async getCurrentPrices(forceRefresh = false) {
    const cacheKey = 'current_prices';
    const now = Date.now();
    
    // Check cache validity
    if (!forceRefresh && this.cache.has(cacheKey)) {
      const lastFetch = this.lastFetch.get(cacheKey);
      if (now - lastFetch < config.PRICE_CACHE_DURATION) {
        return this.cache.get(cacheKey);
      }
    }

    // Prevent concurrent requests
    if (this.isLoading.get(cacheKey)) {
      await this.waitForLoading(cacheKey);
      return this.cache.get(cacheKey);
    }

    this.isLoading.set(cacheKey, true);

    try {
      const response = await this.api.get('/simple/price', {
        params: {
          ids: config.SUPPORTED_CURRENCIES.join(','),
          vs_currencies: 'usd',
          include_24hr_change: true,
          include_last_updated_at: true
        }
      });

      const priceData = {
        bitcoin: {
          usd: response.data.bitcoin.usd,
          change_24h: response.data.bitcoin.usd_24h_change,
          last_updated: response.data.bitcoin.last_updated_at
        },
        ethereum: {
          usd: response.data.ethereum.usd,
          change_24h: response.data.ethereum.usd_24h_change,
          last_updated: response.data.ethereum.last_updated_at
        },
        fetched_at: now
      };

      // Update cache
      this.cache.set(cacheKey, priceData);
      this.lastFetch.set(cacheKey, now);
      this.isLoading.set(cacheKey, false);

      console.log('✅ Crypto prices updated:', {
        BTC: `$${priceData.bitcoin.usd.toLocaleString()}`,
        ETH: `$${priceData.ethereum.usd.toLocaleString()}`
      });

      return priceData;
    } catch (error) {
      this.isLoading.set(cacheKey, false);
      
      // Return cached data if available during API failure
      if (this.cache.has(cacheKey)) {
        console.warn('⚠️ Using cached prices due to API error');
        return this.cache.get(cacheKey);
      }

      // Fallback prices if no cache available
      console.error('❌ No cached prices available, using fallback');
      const fallbackPrices = {
        bitcoin: { usd: 45000, change_24h: 0, last_updated: now },
        ethereum: { usd: 3000, change_24h: 0, last_updated: now },
        fetched_at: now
      };
      
      this.cache.set(cacheKey, fallbackPrices);
      this.lastFetch.set(cacheKey, now);
      
      return fallbackPrices;
    }
  }

  /**
   * Get price for specific cryptocurrency
   * @param {string} currency - Currency name (bitcoin, ethereum)
   * @returns {number} USD price
   */
  async getPrice(currency) {
    const prices = await this.getCurrentPrices();
    return prices[currency]?.usd || 0;
  }

  /**
   * Convert USD to cryptocurrency
   * @param {number} usdAmount - Amount in USD
   * @param {string} currency - Target currency
   * @param {number} customPrice - Custom price (optional)
   * @returns {Object} Conversion result
   */
  async convertUSDToCrypto(usdAmount, currency, customPrice = null) {
    try {
      const price = customPrice || await this.getPrice(currency);
      
      if (price <= 0) {
        throw new Error(`Invalid price for ${currency}: ${price}`);
      }

      const cryptoAmount = usdAmount / price;
      
      return {
        usdAmount,
        cryptoAmount: parseFloat(cryptoAmount.toFixed(8)),
        currency,
        price,
        timestamp: Date.now()
      };
    } catch (error) {
      console.error('❌ USD to Crypto conversion error:', error.message);
      throw error;
    }
  }

  /**
   * Convert cryptocurrency to USD
   * @param {number} cryptoAmount - Amount in crypto
   * @param {string} currency - Source currency
   * @param {number} customPrice - Custom price (optional)
   * @returns {Object} Conversion result
   */
  async convertCryptoToUSD(cryptoAmount, currency, customPrice = null) {
    try {
      const price = customPrice || await this.getPrice(currency);
      
      if (price <= 0) {
        throw new Error(`Invalid price for ${currency}: ${price}`);
      }

      const usdAmount = cryptoAmount * price;
      
      return {
        cryptoAmount,
        usdAmount: parseFloat(usdAmount.toFixed(2)),
        currency,
        price,
        timestamp: Date.now()
      };
    } catch (error) {
      console.error('❌ Crypto to USD conversion error:', error.message);
      throw error;
    }
  }

  /**
   * Get historical price data
   * @param {string} currency - Currency name
   * @param {number} days - Number of days back
   * @returns {Array} Historical price data
   */
  async getHistoricalPrices(currency, days = 7) {
    const cacheKey = `historical_${currency}_${days}`;
    const now = Date.now();
    
    // Check cache (longer cache for historical data - 1 hour)
    if (this.cache.has(cacheKey)) {
      const lastFetch = this.lastFetch.get(cacheKey);
      if (now - lastFetch < 3600000) { // 1 hour
        return this.cache.get(cacheKey);
      }
    }

    try {
      const response = await this.api.get(`/coins/${currency}/market_chart`, {
        params: {
          vs_currency: 'usd',
          days: days,
          interval: days > 1 ? 'daily' : 'hourly'
        }
      });

      const historicalData = response.data.prices.map(([timestamp, price]) => ({
        timestamp,
        price: parseFloat(price.toFixed(2)),
        date: new Date(timestamp).toISOString()
      }));

      this.cache.set(cacheKey, historicalData);
      this.lastFetch.set(cacheKey, now);

      return historicalData;
    } catch (error) {
      console.error('❌ Historical price fetch error:', error.message);
      return [];
    }
  }

  /**
   * Wait for concurrent loading to complete
   * @param {string} cacheKey - Cache key to wait for
   */
  async waitForLoading(cacheKey) {
    while (this.isLoading.get(cacheKey)) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  /**
   * Clear all cached data
   */
  clearCache() {
    this.cache.clear();
    this.lastFetch.clear();
    console.log('🗑️ Crypto price cache cleared');
  }

  /**
   * Get cache status
   * @returns {Object} Cache information
   */
  getCacheStatus() {
    return {
      cacheSize: this.cache.size,
      cachedKeys: Array.from(this.cache.keys()),
      lastFetchTimes: Array.from(this.lastFetch.entries()).map(([key, time]) => ({
        key,
        lastFetch: new Date(time).toISOString(),
        age: Date.now() - time
      }))
    };
  }
}

module.exports = new CryptoAPIService();