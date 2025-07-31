const EventEmitter = require('events');
const GameRound = require('../models/GameRound');
const Player = require('../models/Player');
const provablyFair = require('./provablyFair');
const walletService = require('./walletService');
const cryptoAPI = require('./cryptoAPI');
const config = require('../config/environment');

class GameEngine extends EventEmitter {
  constructor() {
    super();
    this.currentRound = null;
    this.gameState = 'waiting'; // waiting, betting, running, crashed
    this.multiplierTimer = null;
    this.roundTimer = null;
    this.nextRoundTimer = null;
    this.players = new Map(); // Active players in current round
    this.gameStartTime = null;
    this.isShuttingDown = false;
  }

  /**
   * Start the game engine
   */
  async start() {
    try {
      console.log('🎮 Starting Crypto Crash Game Engine...');
      
      // Initialize crypto prices
      await cryptoAPI.getCurrentPrices();
      
      // Start first round
      await this.startNewRound();
      
      console.log('✅ Game Engine started successfully');
      this.emit('engine_started');
    } catch (error) {
      console.error('❌ Failed to start game engine:', error);
      throw error;
    }
  }

  /**
   * Stop the game engine
   */
  async stop() {
    console.log('🛑 Stopping Game Engine...');
    this.isShuttingDown = true;
    
    // Clear all timers
    if (this.multiplierTimer) clearInterval(this.multiplierTimer);
    if (this.roundTimer) clearTimeout(this.roundTimer);
    if (this.nextRoundTimer) clearTimeout(this.nextRoundTimer);
    
    // Complete current round if running
    if (this.gameState === 'running') {
      await this.crashRound();
    }
    
    console.log('✅ Game Engine stopped');
    this.emit('engine_stopped');
  }

  /**
   * Start a new game round
   */
  async startNewRound() {
    if (this.isShuttingDown) return;
    
    try {
      // Generate provably fair crash point
      const seedPair = provablyFair.generateSeedPair();
      const roundId = await GameRound.getNextRoundId();
      const crashData = provablyFair.calculateCrashPoint(seedPair.seed, roundId);
      
      // Create new round in database
      this.currentRound = await GameRound.create({
        roundId,
        seed: seedPair.seed,
        hash: seedPair.hash,
        crashPoint: crashData.crashPoint,
        startTime: new Date(),
        status: 'waiting'
      });

      this.gameState = 'betting';
      this.players.clear();
      this.gameStartTime = null;

      console.log(`🎯 Round ${roundId} created - Crash Point: ${crashData.crashPoint}x (hidden)`);
      
      // Emit round created event
      this.emit('round_created', {
        roundId,
        hash: seedPair.hash,
        status: 'betting'
      });

      // Start betting phase (10 seconds)
      this.roundTimer = setTimeout(() => {
        this.startRound();
      }, config.GAME_ROUND_DURATION);

    } catch (error) {
      console.error('❌ Error starting new round:', error);
      // Retry after 5 seconds
      setTimeout(() => this.startNewRound(), 5000);
    }
  }

  /**
   * Start the actual round (begin multiplier)
   */
  async startRound() {
    if (this.isShuttingDown || !this.currentRound) return;
    
    try {
      this.gameState = 'running';
      this.gameStartTime = Date.now();
      
      // Update round status
      this.currentRound.status = 'running';
      this.currentRound.startTime = new Date(this.gameStartTime);
      await this.currentRound.save();

      console.log(`🚀 Round ${this.currentRound.roundId} started - ${this.players.size} players`);
      
      // Emit round start
      this.emit('round_started', {
        roundId: this.currentRound.roundId,
        startTime: this.gameStartTime,
        playersCount: this.players.size
      });

      // Start multiplier updates
      this.startMultiplierUpdates();
      
      // Calculate when to crash
      const crashTime = provablyFair.calculateCrashTime(this.gameStartTime, this.currentRound.crashPoint);
      const crashDelay = Math.max(0, crashTime - Date.now());
      
      this.roundTimer = setTimeout(() => {
        this.crashRound();
      }, crashDelay);

    } catch (error) {
      console.error('❌ Error starting round:', error);
      await this.crashRound();
    }
  }

  /**
   * Start multiplier updates every 100ms
   */
  startMultiplierUpdates() {
    if (this.multiplierTimer) clearInterval(this.multiplierTimer);
    
    this.multiplierTimer = setInterval(() => {
      if (this.gameState !== 'running' || !this.gameStartTime) {
        clearInterval(this.multiplierTimer);
        return;
      }

      const currentTime = Date.now();
      const multiplier = provablyFair.calculateMultiplier(this.gameStartTime, currentTime);
      
      // Stop if we've reached crash point
      if (multiplier >= this.currentRound.crashPoint) {
        clearInterval(this.multiplierTimer);
        this.crashRound();
        return;
      }

      // Store multiplier in history
      if (this.currentRound.multiplierHistory.length === 0 || 
          currentTime - this.currentRound.multiplierHistory[this.currentRound.multiplierHistory.length - 1].time > 500) {
        this.currentRound.multiplierHistory.push({
          time: currentTime - this.gameStartTime,
          multiplier
        });
      }

      // Emit multiplier update
      this.emit('multiplier_update', {
        roundId: this.currentRound.roundId,
        multiplier: parseFloat(multiplier.toFixed(2)),
        timestamp: currentTime
      });

    }, config.MULTIPLIER_UPDATE_INTERVAL);
  }

  /**
   * Crash the current round
   */
  async crashRound() {
    if (this.gameState !== 'running' || !this.currentRound) return;
    
    try {
      this.gameState = 'crashed';
      const crashTime = Date.now();
      const finalMultiplier = provablyFair.calculateMultiplier(this.gameStartTime, crashTime);
      
      // Clear timers
      if (this.multiplierTimer) clearInterval(this.multiplierTimer);
      if (this.roundTimer) clearTimeout(this.roundTimer);

      // Update round in database
      this.currentRound.status = 'crashed';
      this.currentRound.endTime = new Date(crashTime);
      this.currentRound.duration = crashTime - this.gameStartTime;
      
      // Process uncashed out players (they lose)
      for (const [playerId, playerData] of this.players) {
        if (!playerData.cashedOut) {
          playerData.result = 'lost';
          // Update player bet in round
          const playerBet = this.currentRound.playerBets.find(bet => bet.playerId.toString() === playerId);
          if (playerBet) {
            playerBet.cashedOut = false;
            playerBet.profit = -playerBet.usdAmount;
          }
          
          // Update losing streak for this player
          try {
            await walletService.updateLosingStreak(playerId);
          } catch (error) {
            console.error(`❌ Failed to update losing streak for player ${playerId}:`, error.message);
          }
        }
      }

      await this.currentRound.save();

      console.log(`💥 Round ${this.currentRound.roundId} crashed at ${this.currentRound.crashPoint}x - Final: ${finalMultiplier.toFixed(2)}x`);

      // Emit crash event
      this.emit('round_crashed', {
        roundId: this.currentRound.roundId,
        crashPoint: this.currentRound.crashPoint,
        finalMultiplier: parseFloat(finalMultiplier.toFixed(2)),
        duration: this.currentRound.duration,
        playersCount: this.players.size,
        cashoutCount: Array.from(this.players.values()).filter(p => p.cashedOut).length
      });

      // Generate fairness proof after round ends
      const fairnessProof = provablyFair.generateFairnessProof(
        this.currentRound.seed,
        this.currentRound.roundId,
        this.currentRound.crashPoint
      );

      this.emit('fairness_proof', fairnessProof);

      // Complete round
      await this.completeRound();

    } catch (error) {
      console.error('❌ Error crashing round:', error);
      await this.completeRound();
    }
  }

  /**
   * Complete the round and prepare for next
   */
  async completeRound() {
    try {
      if (this.currentRound) {
        this.currentRound.status = 'completed';
        await this.currentRound.save();
      }

      this.gameState = 'waiting';
      this.players.clear();
      this.gameStartTime = null;

      // Wait 2 seconds before starting next round
      if (!this.isShuttingDown) {
        this.nextRoundTimer = setTimeout(() => {
          this.startNewRound();
        }, 2000);
      }

    } catch (error) {
      console.error('❌ Error completing round:', error);
      if (!this.isShuttingDown) {
        setTimeout(() => this.startNewRound(), 5000);
      }
    }
  }

  /**
   * Place a bet in the current round
   * @param {Object} betData - Bet data
   * @returns {Object} Bet result
   */
  async placeBet(betData) {
    const { playerId, username, usdAmount, currency } = betData;

    try {
      // Validate game state
      if (this.gameState !== 'betting') {
        throw new Error(`Cannot place bet - game state is ${this.gameState}`);
      }

      if (!this.currentRound) {
        throw new Error('No active round');
      }

      // Check if player already bet in this round
      if (this.players.has(playerId)) {
        throw new Error('Player already has a bet in this round');
      }

      // Get current crypto price for conversion
      const currentPrice = await cryptoAPI.getPrice(currency);
      
      // Process bet through wallet service
      const betResult = await walletService.processBet({
        playerId,
        usdAmount,
        currency,
        roundId: this.currentRound.roundId,
        priceAtBet: currentPrice
      });

      // Add player bet to round
      const playerBet = {
        playerId,
        username,
        usdAmount,
        cryptoAmount: betResult.cryptoAmount,
        currency,
        priceAtBet: currentPrice,
        cashedOut: false,
        cashoutMultiplier: null,
        cashoutAmount: null,
        cashoutTime: null,
        profit: 0
      };

      this.currentRound.playerBets.push(playerBet);
      this.currentRound.totalBetAmount += usdAmount;
      this.currentRound.playersCount += 1;

      await this.currentRound.save();

      // Track player in current round
      this.players.set(playerId, {
        username,
        usdAmount,
        cryptoAmount: betResult.cryptoAmount,
        currency,
        priceAtBet: currentPrice,
        cashedOut: false,
        joinedAt: Date.now()
      });

      console.log(`💰 Bet placed: ${username} - $${usdAmount} (${betResult.cryptoAmount} ${currency})`);

      // Emit bet placed event
      this.emit('bet_placed', {
        roundId: this.currentRound.roundId,
        playerId,
        username,
        usdAmount,
        cryptoAmount: betResult.cryptoAmount,
        currency,
        totalPlayers: this.players.size,
        totalBetAmount: this.currentRound.totalBetAmount
      });

      return {
        success: true,
        roundId: this.currentRound.roundId,
        bet: playerBet,
        transaction: betResult.transaction
      };

    } catch (error) {
      console.error('❌ Place bet error:', error.message);
      throw error;
    }
  }

  /**
   * Process player cashout
   * @param {string} playerId - Player ID
   * @returns {Object} Cashout result
   */
  async cashOut(playerId) {
    try {
      // Validate game state
      if (this.gameState !== 'running') {
        throw new Error(`Cannot cash out - game state is ${this.gameState}`);
      }

      if (!this.gameStartTime) {
        throw new Error('Round not started yet');
      }

      // Check if player has a bet
      const playerData = this.players.get(playerId);
      if (!playerData) {
        throw new Error('Player has no bet in this round');
      }

      if (playerData.cashedOut) {
        throw new Error('Player already cashed out');
      }

      // Calculate current multiplier
      const currentTime = Date.now();
      const currentMultiplier = provablyFair.calculateMultiplier(this.gameStartTime, currentTime);

      // Check if crash already happened
      if (currentMultiplier >= this.currentRound.crashPoint) {
        throw new Error('Round already crashed');
      }

      // Calculate cashout amounts
      const cashoutCryptoAmount = playerData.cryptoAmount * currentMultiplier;
      const cashoutUsdAmount = parseFloat((playerData.usdAmount * currentMultiplier).toFixed(2));

      // Process cashout through wallet service
      const cashoutResult = await walletService.processCashout({
        playerId,
        usdAmount: cashoutUsdAmount,
        cryptoAmount: cashoutCryptoAmount,
        currency: playerData.currency,
        roundId: this.currentRound.roundId,
        multiplier: currentMultiplier,
        priceAtCashout: playerData.priceAtBet // Use same price for simplicity
      });

      // Update player data
      playerData.cashedOut = true;
      playerData.cashoutMultiplier = currentMultiplier;
      playerData.cashoutAmount = cashoutUsdAmount;
      playerData.cashedOutAt = currentTime;
      playerData.result = 'won';

      // Update round data
      const playerBet = this.currentRound.playerBets.find(bet => bet.playerId.toString() === playerId);
      if (playerBet) {
        playerBet.cashedOut = true;
        playerBet.cashoutMultiplier = currentMultiplier;
        playerBet.cashoutAmount = cashoutCryptoAmount;
        playerBet.cashoutTime = new Date(currentTime);
        playerBet.profit = cashoutUsdAmount - playerData.usdAmount;
      }

      this.currentRound.totalCashoutAmount += cashoutUsdAmount;
      this.currentRound.cashoutCount += 1;

      await this.currentRound.save();

      console.log(`🎉 Cashout: ${playerData.username} - ${currentMultiplier.toFixed(2)}x ($${cashoutUsdAmount})`);

      // Emit cashout event
      this.emit('player_cashout', {
        roundId: this.currentRound.roundId,
        playerId,
        username: playerData.username,
        multiplier: parseFloat(currentMultiplier.toFixed(2)),
        usdAmount: cashoutUsdAmount,
        cryptoAmount: cashoutCryptoAmount,
        currency: playerData.currency,
        profit: cashoutUsdAmount - playerData.usdAmount,
        timestamp: currentTime
      });

      return {
        success: true,
        multiplier: parseFloat(currentMultiplier.toFixed(2)),
        usdAmount: cashoutUsdAmount,
        cryptoAmount: cashoutCryptoAmount,
        currency: playerData.currency,
        profit: cashoutUsdAmount - playerData.usdAmount,
        transaction: cashoutResult.transaction
      };

    } catch (error) {
      console.error('❌ Cashout error:', error.message);
      throw error;
    }
  }

  /**
   * Get current game state
   * @returns {Object} Game state
   */
  getCurrentState() {
    const state = {
      gameState: this.gameState,
      currentRound: this.currentRound ? {
        roundId: this.currentRound.roundId,
        hash: this.currentRound.hash,
        status: this.currentRound.status,
        startTime: this.currentRound.startTime,
        playersCount: this.players.size,
        totalBetAmount: this.currentRound.totalBetAmount
      } : null,
      multiplier: this.gameStartTime ? 
        parseFloat(provablyFair.calculateMultiplier(this.gameStartTime, Date.now()).toFixed(2)) : 1.00,
      timeElapsed: this.gameStartTime ? Date.now() - this.gameStartTime : 0,
      activePlayers: Array.from(this.players.values()).map(p => ({
        username: p.username,
        usdAmount: p.usdAmount,
        currency: p.currency,
        cashedOut: p.cashedOut,
        cashoutMultiplier: p.cashoutMultiplier
      }))
    };

    return state;
  }

  /**
   * Get round history
   * @param {number} limit - Number of rounds to return
   * @returns {Array} Round history
   */
  async getRoundHistory(limit = 20) {
    try {
      const rounds = await GameRound
        .find({ status: 'completed' })
        .sort({ roundId: -1 })
        .limit(limit)
        .select('roundId crashPoint startTime endTime duration playersCount totalBetAmount totalCashoutAmount')
        .lean();

      return rounds.map(round => ({
        ...round,
        houseEdge: round.totalBetAmount > 0 ? 
          (((round.totalBetAmount - round.totalCashoutAmount) / round.totalBetAmount) * 100).toFixed(2) : 0
      }));
    } catch (error) {
      console.error('❌ Get round history error:', error);
      return [];
    }
  }

  /**
   * Get game statistics
   * @returns {Object} Game statistics
   */
  async getGameStats() {
    try {
      const totalRounds = await GameRound.countDocuments({ status: 'completed' });
      const recentRounds = await GameRound
        .find({ status: 'completed' })
        .sort({ roundId: -1 })
        .limit(100);

      if (recentRounds.length === 0) {
        return { error: 'No completed rounds found' };
      }

      const crashPoints = recentRounds.map(r => r.crashPoint);
      const totalVolume = recentRounds.reduce((sum, r) => sum + r.totalBetAmount, 0);
      const totalPayouts = recentRounds.reduce((sum, r) => sum + r.totalCashoutAmount, 0);

      return {
        totalRounds,
        totalVolume,
        totalPayouts,
        houseEdge: totalVolume > 0 ? (((totalVolume - totalPayouts) / totalVolume) * 100).toFixed(2) : 0,
        averagePlayers: (recentRounds.reduce((sum, r) => sum + r.playersCount, 0) / recentRounds.length).toFixed(1),
        averageCrashPoint: (crashPoints.reduce((a, b) => a + b, 0) / crashPoints.length).toFixed(2),
        distribution: provablyFair.getCrashStatistics(recentRounds),
        uptime: process.uptime() * 1000
      };
    } catch (error) {
      console.error('❌ Get game stats error:', error);
      return { error: error.message };
    }
  }
}

module.exports = new GameEngine();