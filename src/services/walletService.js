const mongoose = require('mongoose');
const Player = require('../models/Player');
const Transaction = require('../models/Transaction');
const cryptoAPI = require('./cryptoAPI');

class WalletService {
  constructor() {
    this.lockManager = new Map(); // Prevent concurrent balance updates
  }

  /**
   * Get player's wallet balance with USD equivalent
   * @param {string} playerId - Player ID
   * @returns {Object} Wallet balance data
   */
  async getWalletBalance(playerId) {
    try {
      const player = await Player.findById(playerId);
      if (!player) {
        throw new Error('Player not found');
      }

      // Get current crypto prices
      const prices = await cryptoAPI.getCurrentPrices();
      
      const wallet = {
        playerId: player._id,
        username: player.username,
        balances: {
          bitcoin: {
            amount: player.wallet.bitcoin,
            usdValue: player.wallet.bitcoin * prices.bitcoin.usd
          },
          ethereum: {
            amount: player.wallet.ethereum,
            usdValue: player.wallet.ethereum * prices.ethereum.usd
          }
        },
        totalUsdValue: (player.wallet.bitcoin * prices.bitcoin.usd) + 
                      (player.wallet.ethereum * prices.ethereum.usd),
        prices: {
          bitcoin: prices.bitcoin.usd,
          ethereum: prices.ethereum.usd,
          lastUpdated: prices.fetched_at
        },
        statistics: {
          totalDeposited: player.totalDeposited,
          totalWithdrawn: player.totalWithdrawn,
          gamesPlayed: player.gamesPlayed,
          totalWon: player.totalWon,
          totalLost: player.totalLost,
          netProfit: player.netProfit,
          winRate: player.winRate,
          profitLossRatio: player.totalLost > 0 ? (player.totalWon / player.totalLost).toFixed(2) : 'N/A',
          averageBetSize: player.gamesPlayed > 0 ? ((player.totalWon + player.totalLost) / player.gamesPlayed).toFixed(2) : 0,
          biggestWin: player.biggestWin,
          biggestLoss: player.biggestLoss,
          currentStreak: player.currentStreak,
          bestStreak: player.bestStreak,
          lastPlayedAt: player.lastPlayedAt,
          accountAge: Math.floor((Date.now() - player.createdAt.getTime()) / (1000 * 60 * 60 * 24)), // days
          status: player.netProfit >= 0 ? 'Profitable' : 'In Loss'
        }
      };

      return wallet;
    } catch (error) {
      console.error('❌ Get wallet balance error:', error.message);
      throw error;
    }
  }

  /**
   * Process bet transaction (deduct from wallet)
   * @param {Object} betData - Bet transaction data
   * @returns {Object} Transaction result
   */
  async processBet(betData) {
    const { playerId, usdAmount, currency, roundId, priceAtBet } = betData;
    
    // Acquire lock for this player
    await this.acquireLock(playerId);
    
    try {
      // Start database transaction
      const session = await mongoose.startSession();
      session.startTransaction();

      try {
        // Get player with current balance
        const player = await Player.findById(playerId).session(session);
        if (!player) {
          throw new Error('Player not found');
        }

        // Convert USD to crypto
        const conversion = await cryptoAPI.convertUSDToCrypto(usdAmount, currency, priceAtBet);
        const cryptoAmount = conversion.cryptoAmount;

        // Check if player has sufficient balance
        if (player.wallet[currency] < cryptoAmount) {
          throw new Error(`Insufficient ${currency} balance. Required: ${cryptoAmount}, Available: ${player.wallet[currency]}`);
        }

        // Deduct crypto from wallet
        player.wallet[currency] -= cryptoAmount;
        player.gamesPlayed += 1;
        player.totalLost += usdAmount;
        player.lastPlayedAt = new Date();
        
        // Update biggest loss if this is the largest bet
        if (usdAmount > player.biggestLoss) {
          player.biggestLoss = usdAmount;
        }
        
        // Update streak (negative for losses, will be updated on wins)

        await player.save({ session });

        // Create transaction record
        const transaction = await Transaction.create([{
          playerId,
          roundId,
          type: 'bet',
          usdAmount,
          cryptoAmount,
          currency,
          priceAtTime: priceAtBet,
          status: 'confirmed',
          metadata: {
            betPlaced: true
          }
        }], { session });

        await session.commitTransaction();

        console.log(`✅ Bet processed: ${player.username} bet $${usdAmount} (${cryptoAmount} ${currency})`);

        return {
          success: true,
          transaction: transaction[0],
          newBalance: player.wallet[currency],
          usdAmount,
          cryptoAmount,
          currency,
          player: {
            id: player._id,
            username: player.username,
            gamesPlayed: player.gamesPlayed
          }
        };

      } catch (error) {
        await session.abortTransaction();
        throw error;
      } finally {
        session.endSession();
      }

    } finally {
      this.releaseLock(playerId);
    }
  }

  /**
   * Process cashout transaction (add to wallet)
   * @param {Object} cashoutData - Cashout transaction data
   * @returns {Object} Transaction result
   */
  async processCashout(cashoutData) {
    const { playerId, usdAmount, cryptoAmount, currency, roundId, multiplier, priceAtCashout } = cashoutData;
    
    // Acquire lock for this player
    await this.acquireLock(playerId);
    
    try {
      // Start database transaction
      const session = await mongoose.startSession();
      session.startTransaction();

      try {
        // Get player
        const player = await Player.findById(playerId).session(session);
        if (!player) {
          throw new Error('Player not found');
        }

        // Add crypto to wallet
        player.wallet[currency] += cryptoAmount;
        player.totalWon += usdAmount;
        player.lastPlayedAt = new Date();
        
        // Calculate profit for this round
        const originalBet = cryptoAmount / multiplier; // Original bet amount in crypto
        const profit = usdAmount - (originalBet * priceAtCashout); // Profit in USD
        
        // Update biggest win if this is the largest profit
        if (profit > player.biggestWin) {
          player.biggestWin = profit;
        }
        
        // Update winning streak
        if (profit > 0) {
          player.currentStreak = player.currentStreak > 0 ? player.currentStreak + 1 : 1;
          if (player.currentStreak > player.bestStreak) {
            player.bestStreak = player.currentStreak;
          }
        } else {
          player.currentStreak = 0;
        }

        await player.save({ session });

        // Create transaction record
        const transaction = await Transaction.create([{
          playerId,
          roundId,
          type: 'cashout',
          usdAmount,
          cryptoAmount,
          currency,
          priceAtTime: priceAtCashout,
          status: 'confirmed',
          metadata: {
            multiplier,
            cashedOut: true,
            profit: usdAmount - (cryptoAmount / multiplier * priceAtCashout) // Original bet in USD
          }
        }], { session });

        await session.commitTransaction();

        console.log(`✅ Cashout processed: ${player.username} won $${usdAmount} (${cryptoAmount} ${currency}) at ${multiplier}x`);

        return {
          success: true,
          transaction: transaction[0],
          newBalance: player.wallet[currency],
          usdAmount,
          cryptoAmount,
          currency,
          multiplier,
          player: {
            id: player._id,
            username: player.username,
            totalWon: player.totalWon
          }
        };

      } catch (error) {
        await session.abortTransaction();
        throw error;
      } finally {
        session.endSession();
      }

    } finally {
      this.releaseLock(playerId);
    }
  }

  /**
   * Add funds to wallet (deposit simulation)
   * @param {Object} depositData - Deposit data
   * @returns {Object} Transaction result
   */
  async processDeposit(depositData) {
    const { playerId, usdAmount, currency } = depositData;
    
    await this.acquireLock(playerId);
    
    try {
      const session = await mongoose.startSession();
      session.startTransaction();

      try {
        const player = await Player.findById(playerId).session(session);
        if (!player) {
          throw new Error('Player not found');
        }

        // Convert USD to crypto at current price
        const conversion = await cryptoAPI.convertUSDToCrypto(usdAmount, currency);
        const cryptoAmount = conversion.cryptoAmount;

        // Add crypto to wallet
        player.wallet[currency] += cryptoAmount;
        player.totalDeposited += usdAmount;

        await player.save({ session });

        // Create transaction record
        const transaction = await Transaction.create([{
          playerId,
          roundId: 0, // No round for deposits
          type: 'deposit',
          usdAmount,
          cryptoAmount,
          currency,
          priceAtTime: conversion.price,
          status: 'confirmed'
        }], { session });

        await session.commitTransaction();

        console.log(`✅ Deposit processed: ${player.username} deposited $${usdAmount} (${cryptoAmount} ${currency})`);

        return {
          success: true,
          transaction: transaction[0],
          newBalance: player.wallet[currency],
          usdAmount,
          cryptoAmount,
          currency
        };

      } catch (error) {
        await session.abortTransaction();
        throw error;
      } finally {
        session.endSession();
      }

    } finally {
      this.releaseLock(playerId);
    }
  }

  /**
   * Get player's transaction history
   * @param {string} playerId - Player ID
   * @param {Object} options - Query options
   * @returns {Array} Transaction history
   */
  async getTransactionHistory(playerId, options = {}) {
    try {
      const {
        type = null,
        currency = null,
        limit = 50,
        offset = 0,
        sortBy = 'createdAt',
        sortOrder = 'desc'
      } = options;

      const query = { playerId };
      
      if (type) query.type = type;
      if (currency) query.currency = currency;

      const transactions = await Transaction
        .find(query)
        .sort({ [sortBy]: sortOrder === 'desc' ? -1 : 1 })
        .limit(limit)
        .skip(offset)
        .populate('playerId', 'username')
        .lean();

      // Add USD values at current prices for display
      const prices = await cryptoAPI.getCurrentPrices();
      
      const enrichedTransactions = transactions.map(tx => ({
        ...tx,
        currentUsdValue: tx.cryptoAmount * prices[tx.currency].usd,
        priceChange: ((prices[tx.currency].usd - tx.priceAtTime) / tx.priceAtTime * 100).toFixed(2)
      }));

      return enrichedTransactions;
    } catch (error) {
      console.error('❌ Get transaction history error:', error.message);
      throw error;
    }
  }

  /**
   * Validate wallet transaction
   * @param {Object} transactionData - Transaction data to validate
   * @returns {Object} Validation result
   */
  validateTransaction(transactionData) {
    const { playerId, usdAmount, currency, type } = transactionData;
    const errors = [];

    // Validate required fields
    if (!playerId) errors.push('Player ID is required');
    if (!usdAmount || usdAmount <= 0) errors.push('USD amount must be positive');
    if (!currency || !['bitcoin', 'ethereum'].includes(currency)) {
      errors.push('Currency must be bitcoin or ethereum');
    }
    if (!type || !['bet', 'cashout', 'deposit', 'withdrawal'].includes(type)) {
      errors.push('Invalid transaction type');
    }

    // Validate amounts
    if (usdAmount < 0.01) errors.push('Minimum transaction amount is $0.01');
    if (usdAmount > 100000) errors.push('Maximum transaction amount is $100,000');

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Get wallet statistics for a player
   * @param {string} playerId - Player ID
   * @returns {Object} Wallet statistics
   */
  async getWalletStatistics(playerId) {
    try {
      const [player, transactions] = await Promise.all([
        Player.findById(playerId),
        Transaction.find({ playerId }).sort({ createdAt: -1 }).limit(100)
      ]);

      if (!player) {
        throw new Error('Player not found');
      }

      const stats = {
        totalTransactions: transactions.length,
        totalVolume: transactions.reduce((sum, tx) => sum + tx.usdAmount, 0),
        averageTransactionSize: transactions.length > 0 ? 
          (transactions.reduce((sum, tx) => sum + tx.usdAmount, 0) / transactions.length).toFixed(2) : 0,
        transactionsByType: {
          bet: transactions.filter(tx => tx.type === 'bet').length,
          cashout: transactions.filter(tx => tx.type === 'cashout').length,
          deposit: transactions.filter(tx => tx.type === 'deposit').length,
          withdrawal: transactions.filter(tx => tx.type === 'withdrawal').length
        },
        transactionsByCurrency: {
          bitcoin: transactions.filter(tx => tx.currency === 'bitcoin').length,
          ethereum: transactions.filter(tx => tx.currency === 'ethereum').length
        },
        recentActivity: transactions.slice(0, 10).map(tx => ({
          type: tx.type,
          amount: tx.usdAmount,
          currency: tx.currency,
          timestamp: tx.createdAt
        })),
        profitLoss: {
          totalWon: player.totalWon,
          totalLost: player.totalLost,
          netProfit: player.netProfit,
          winRate: player.winRate
        }
      };

      return stats;
    } catch (error) {
      console.error('❌ Get wallet statistics error:', error.message);
      throw error;
    }
  }

  /**
   * Acquire lock for player to prevent concurrent transactions
   * @param {string} playerId - Player ID
   */
  async acquireLock(playerId) {
    while (this.lockManager.has(playerId)) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    this.lockManager.set(playerId, Date.now());
  }

  /**
   * Release lock for player
   * @param {string} playerId - Player ID
   */
  releaseLock(playerId) {
    this.lockManager.delete(playerId);
  }

  /**
   * Update player streak for losses (when they don't cash out)
   * @param {string} playerId - Player ID
   * @returns {Object} Update result
   */
  async updateLosingStreak(playerId) {
    await this.acquireLock(playerId);
    
    try {
      const session = await mongoose.startSession();
      session.startTransaction();

      try {
        const player = await Player.findById(playerId).session(session);
        if (!player) {
          throw new Error('Player not found');
        }

        // Update losing streak
        player.currentStreak = player.currentStreak < 0 ? player.currentStreak - 1 : -1;
        
        await player.save({ session });
        await session.commitTransaction();

        return { success: true, currentStreak: player.currentStreak };

      } catch (error) {
        await session.abortTransaction();
        throw error;
      } finally {
        session.endSession();
      }

    } finally {
      this.releaseLock(playerId);
    }
  }

  /**
   * Check if player has sufficient balance for bet
   * @param {string} playerId - Player ID
   * @param {number} usdAmount - Bet amount in USD
   * @param {string} currency - Cryptocurrency
   * @returns {Object} Balance check result
   */
  async checkSufficientBalance(playerId, usdAmount, currency) {
    try {
      const player = await Player.findById(playerId);
      if (!player) {
        return { sufficient: false, error: 'Player not found' };
      }

      const conversion = await cryptoAPI.convertUSDToCrypto(usdAmount, currency);
      const requiredCrypto = conversion.cryptoAmount;
      const availableCrypto = player.wallet[currency];

      return {
        sufficient: availableCrypto >= requiredCrypto,
        available: availableCrypto,
        required: requiredCrypto,
        usdAmount,
        currency,
        price: conversion.price
      };
    } catch (error) {
      return { sufficient: false, error: error.message };
    }
  }

  /**
   * Get current lock status (for debugging)
   * @returns {Object} Lock status
   */
  getLockStatus() {
    return {
      activelocks: this.lockManager.size,
      lockedPlayers: Array.from(this.lockManager.keys()),
      lockDetails: Array.from(this.lockManager.entries()).map(([playerId, timestamp]) => ({
        playerId,
        lockedAt: new Date(timestamp).toISOString(),
        duration: Date.now() - timestamp
      }))
    };
  }
}

module.exports = new WalletService();