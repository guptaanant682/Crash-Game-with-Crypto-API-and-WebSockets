const express = require('express');
const walletService = require('../services/walletService');
const cryptoAPI = require('../services/cryptoAPI');
const Player = require('../models/Player');
const router = express.Router();

/**
 * Get wallet balance
 * GET /api/wallet/balance/:playerId
 */
router.get('/balance/:playerId', async (req, res) => {
  try {
    const { playerId } = req.params;

    if (!playerId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid player ID format'
      });
    }

    const walletData = await walletService.getWalletBalance(playerId);

    res.json({
      success: true,
      wallet: walletData
    });

  } catch (error) {
    console.error('❌ Get wallet balance error:', error);
    
    if (error.message === 'Player not found') {
      return res.status(404).json({
        success: false,
        error: 'Player not found'
      });
    }

    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * Process deposit
 * POST /api/wallet/deposit
 */
router.post('/deposit', async (req, res) => {
  try {
    const { playerId, usdAmount, currency } = req.body;

    // Validate input
    const validation = walletService.validateTransaction({
      playerId,
      usdAmount,
      currency,
      type: 'deposit'
    });

    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        error: validation.errors.join(', ')
      });
    }

    // Process deposit
    const result = await walletService.processDeposit({
      playerId,
      usdAmount,
      currency
    });

    res.json({
      success: true,
      message: 'Deposit processed successfully',
      deposit: result
    });

  } catch (error) {
    console.error('❌ Process deposit error:', error);
    
    if (error.message === 'Player not found') {
      return res.status(404).json({
        success: false,
        error: 'Player not found'
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to process deposit'
    });
  }
});

/**
 * Check sufficient balance for bet
 * POST /api/wallet/check-balance
 */
router.post('/check-balance', async (req, res) => {
  try {
    const { playerId, usdAmount, currency } = req.body;

    if (!playerId || !usdAmount || !currency) {
      return res.status(400).json({
        success: false,
        error: 'Player ID, USD amount, and currency are required'
      });
    }

    const balanceCheck = await walletService.checkSufficientBalance(
      playerId,
      usdAmount,
      currency
    );

    res.json({
      success: true,
      balanceCheck
    });

  } catch (error) {
    console.error('❌ Check balance error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * Get transaction history
 * GET /api/wallet/transactions/:playerId
 */
router.get('/transactions/:playerId', async (req, res) => {
  try {
    const { playerId } = req.params;
    const {
      type,
      currency,
      limit = 50,
      offset = 0,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    if (!playerId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid player ID format'
      });
    }

    const transactions = await walletService.getTransactionHistory(playerId, {
      type,
      currency,
      limit: parseInt(limit),
      offset: parseInt(offset),
      sortBy,
      sortOrder
    });

    res.json({
      success: true,
      transactions,
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        total: transactions.length
      }
    });

  } catch (error) {
    console.error('❌ Get transaction history error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * Get wallet statistics
 * GET /api/wallet/stats/:playerId
 */
router.get('/stats/:playerId', async (req, res) => {
  try {
    const { playerId } = req.params;

    if (!playerId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid player ID format'
      });
    }

    const stats = await walletService.getWalletStatistics(playerId);

    res.json({
      success: true,
      statistics: stats
    });

  } catch (error) {
    console.error('❌ Get wallet statistics error:', error);
    
    if (error.message === 'Player not found') {
      return res.status(404).json({
        success: false,
        error: 'Player not found'
      });
    }

    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * Get current crypto prices
 * GET /api/wallet/prices
 */
router.get('/prices', async (req, res) => {
  try {
    const { forceRefresh = false } = req.query;

    const prices = await cryptoAPI.getCurrentPrices(forceRefresh === 'true');

    res.json({
      success: true,
      prices: {
        bitcoin: {
          usd: prices.bitcoin.usd,
          change24h: prices.bitcoin.change_24h,
          lastUpdated: new Date(prices.bitcoin.last_updated * 1000).toISOString()
        },
        ethereum: {
          usd: prices.ethereum.usd,
          change24h: prices.ethereum.change_24h,
          lastUpdated: new Date(prices.ethereum.last_updated * 1000).toISOString()
        },
        fetchedAt: new Date(prices.fetched_at).toISOString(),
        cacheStatus: cryptoAPI.getCacheStatus()
      }
    });

  } catch (error) {
    console.error('❌ Get crypto prices error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch crypto prices'
    });
  }
});

/**
 * Convert USD to crypto
 * POST /api/wallet/convert/usd-to-crypto
 */
router.post('/convert/usd-to-crypto', async (req, res) => {
  try {
    const { usdAmount, currency, customPrice } = req.body;

    if (!usdAmount || !currency) {
      return res.status(400).json({
        success: false,
        error: 'USD amount and currency are required'
      });
    }

    if (usdAmount <= 0) {
      return res.status(400).json({
        success: false,
        error: 'USD amount must be positive'
      });
    }

    if (!['bitcoin', 'ethereum'].includes(currency)) {
      return res.status(400).json({
        success: false,
        error: 'Currency must be bitcoin or ethereum'
      });
    }

    const conversion = await cryptoAPI.convertUSDToCrypto(
      usdAmount,
      currency,
      customPrice
    );

    res.json({
      success: true,
      conversion
    });

  } catch (error) {
    console.error('❌ USD to crypto conversion error:', error);
    res.status(500).json({
      success: false,
      error: 'Conversion failed'
    });
  }
});

/**
 * Convert crypto to USD
 * POST /api/wallet/convert/crypto-to-usd
 */
router.post('/convert/crypto-to-usd', async (req, res) => {
  try {
    const { cryptoAmount, currency, customPrice } = req.body;

    if (!cryptoAmount || !currency) {
      return res.status(400).json({
        success: false,
        error: 'Crypto amount and currency are required'
      });
    }

    if (cryptoAmount <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Crypto amount must be positive'
      });
    }

    if (!['bitcoin', 'ethereum'].includes(currency)) {
      return res.status(400).json({
        success: false,
        error: 'Currency must be bitcoin or ethereum'
      });
    }

    const conversion = await cryptoAPI.convertCryptoToUSD(
      cryptoAmount,
      currency,
      customPrice
    );

    res.json({
      success: true,
      conversion
    });

  } catch (error) {
    console.error('❌ Crypto to USD conversion error:', error);
    res.status(500).json({
      success: false,
      error: 'Conversion failed'
    });
  }
});

/**
 * Get historical crypto prices
 * GET /api/wallet/prices/history/:currency
 */
router.get('/prices/history/:currency', async (req, res) => {
  try {
    const { currency } = req.params;
    const { days = 7 } = req.query;

    if (!['bitcoin', 'ethereum'].includes(currency)) {
      return res.status(400).json({
        success: false,
        error: 'Currency must be bitcoin or ethereum'
      });
    }

    const daysNum = parseInt(days);
    if (daysNum < 1 || daysNum > 365) {
      return res.status(400).json({
        success: false,
        error: 'Days must be between 1 and 365'
      });
    }

    const historicalPrices = await cryptoAPI.getHistoricalPrices(currency, daysNum);

    res.json({
      success: true,
      currency,
      days: daysNum,
      prices: historicalPrices
    });

  } catch (error) {
    console.error('❌ Get historical prices error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch historical prices'
    });
  }
});

/**
 * Get wallet lock status (for debugging)
 * GET /api/wallet/lock-status
 */
router.get('/lock-status', async (req, res) => {
  try {
    const lockStatus = walletService.getLockStatus();

    res.json({
      success: true,
      lockStatus
    });

  } catch (error) {
    console.error('❌ Get lock status error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

module.exports = router;