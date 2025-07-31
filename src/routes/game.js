const express = require('express');
const gameEngine = require('../services/gameEngine');
const GameRound = require('../models/GameRound');
const provablyFair = require('../services/provablyFair');
const router = express.Router();

/**
 * Get current game state
 * GET /api/game/state
 */
router.get('/state', async (req, res) => {
  try {
    const gameState = gameEngine.getCurrentState();

    res.json({
      success: true,
      gameState
    });

  } catch (error) {
    console.error('❌ Get game state error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * Place a bet
 * POST /api/game/bet
 */
router.post('/bet', async (req, res) => {
  try {
    const { playerId, username, usdAmount, currency } = req.body;

    // Validate input
    if (!playerId || !username || !usdAmount || !currency) {
      return res.status(400).json({
        success: false,
        error: 'Player ID, username, USD amount, and currency are required'
      });
    }

    if (!playerId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid player ID format'
      });
    }

    if (usdAmount <= 0 || usdAmount > 10000) {
      return res.status(400).json({
        success: false,
        error: 'Bet amount must be between $0.01 and $10,000'
      });
    }

    if (!['bitcoin', 'ethereum'].includes(currency)) {
      return res.status(400).json({
        success: false,
        error: 'Currency must be bitcoin or ethereum'
      });
    }

    // Place bet through game engine
    const betResult = await gameEngine.placeBet({
      playerId,
      username,
      usdAmount,
      currency
    });

    console.log(`🎲 Bet placed via API: ${username} - $${usdAmount} (${currency})`);

    res.json({
      success: true,
      message: 'Bet placed successfully',
      bet: betResult
    });

  } catch (error) {
    console.error('❌ Place bet error:', error);
    
    // Handle specific game engine errors
    if (error.message.includes('Cannot place bet')) {
      return res.status(400).json({
        success: false,
        error: error.message
      });
    }

    if (error.message.includes('already has a bet')) {
      return res.status(409).json({
        success: false,
        error: 'You already have a bet in this round'
      });
    }

    if (error.message.includes('Insufficient')) {
      return res.status(400).json({
        success: false,
        error: error.message
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to place bet'
    });
  }
});

/**
 * Cash out
 * POST /api/game/cashout
 */
router.post('/cashout', async (req, res) => {
  try {
    const { playerId } = req.body;

    if (!playerId) {
      return res.status(400).json({
        success: false,
        error: 'Player ID is required'
      });
    }

    if (!playerId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid player ID format'
      });
    }

    // Process cashout through game engine
    const cashoutResult = await gameEngine.cashOut(playerId);

    console.log(`💰 Cashout via API: Player ${playerId} - ${cashoutResult.multiplier}x`);

    res.json({
      success: true,
      message: 'Cashed out successfully',
      cashout: cashoutResult
    });

  } catch (error) {
    console.error('❌ Cashout error:', error);
    
    // Handle specific game engine errors
    if (error.message.includes('Cannot cash out')) {
      return res.status(400).json({
        success: false,
        error: error.message
      });
    }

    if (error.message.includes('no bet')) {
      return res.status(400).json({
        success: false,
        error: 'You have no bet in the current round'
      });
    }

    if (error.message.includes('already cashed out')) {
      return res.status(400).json({
        success: false,
        error: 'You have already cashed out'
      });
    }

    if (error.message.includes('already crashed')) {
      return res.status(400).json({
        success: false,
        error: 'Round has already crashed'
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to cash out'
    });
  }
});

/**
 * Get round history
 * GET /api/game/history
 */
router.get('/history', async (req, res) => {
  try {
    const { limit = 20, offset = 0 } = req.query;

    const rounds = await GameRound
      .find({ status: 'completed' })
      .sort({ roundId: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(offset))
      .select('roundId crashPoint startTime endTime duration playersCount totalBetAmount totalCashoutAmount playerBets')
      .lean();

    const totalRounds = await GameRound.countDocuments({ status: 'completed' });

    // Add calculated fields
    const enrichedRounds = rounds.map(round => ({
      ...round,
      houseEdge: round.totalBetAmount > 0 ? 
        (((round.totalBetAmount - round.totalCashoutAmount) / round.totalBetAmount) * 100).toFixed(2) : 0,
      cashoutRate: round.playersCount > 0 ? 
        ((round.playerBets.filter(bet => bet.cashedOut).length / round.playersCount) * 100).toFixed(1) : 0,
      averageBet: round.playersCount > 0 ? 
        (round.totalBetAmount / round.playersCount).toFixed(2) : 0
    }));

    res.json({
      success: true,
      rounds: enrichedRounds,
      pagination: {
        total: totalRounds,
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: parseInt(offset) + parseInt(limit) < totalRounds
      }
    });

  } catch (error) {
    console.error('❌ Get round history error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * Get specific round details
 * GET /api/game/round/:roundId
 */
router.get('/round/:roundId', async (req, res) => {
  try {
    const { roundId } = req.params;

    if (!roundId || isNaN(roundId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid round ID'
      });
    }

    const round = await GameRound
      .findOne({ roundId: parseInt(roundId) })
      .populate('playerBets.playerId', 'username')
      .lean();

    if (!round) {
      return res.status(404).json({
        success: false,
        error: 'Round not found'
      });
    }

    // Add fairness proof if round is completed
    let fairnessProof = null;
    if (round.status === 'completed') {
      fairnessProof = provablyFair.generateFairnessProof(
        round.seed,
        round.roundId,
        round.crashPoint
      );
    }

    res.json({
      success: true,
      round: {
        ...round,
        houseEdge: round.totalBetAmount > 0 ? 
          (((round.totalBetAmount - round.totalCashoutAmount) / round.totalBetAmount) * 100).toFixed(2) : 0,
        fairnessProof
      }
    });

  } catch (error) {
    console.error('❌ Get round details error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * Get game statistics
 * GET /api/game/stats
 */
router.get('/stats', async (req, res) => {
  try {
    const stats = await gameEngine.getGameStats();

    res.json({
      success: true,
      statistics: stats
    });

  } catch (error) {
    console.error('❌ Get game stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * Verify fairness of a round
 * POST /api/game/verify-fairness
 */
router.post('/verify-fairness', async (req, res) => {
  try {
    const { seed, roundId, crashPoint } = req.body;

    if (!seed || !roundId || !crashPoint) {
      return res.status(400).json({
        success: false,
        error: 'Seed, round ID, and crash point are required'
      });
    }

    const verification = provablyFair.verifyCrashPoint(
      seed,
      parseInt(roundId),
      parseFloat(crashPoint)
    );

    res.json({
      success: true,
      verification
    });

  } catch (error) {
    console.error('❌ Verify fairness error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * Get fairness proof for a round
 * GET /api/game/fairness-proof/:roundId
 */
router.get('/fairness-proof/:roundId', async (req, res) => {
  try {
    const { roundId } = req.params;

    if (!roundId || isNaN(roundId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid round ID'
      });
    }

    const round = await GameRound.findOne({ 
      roundId: parseInt(roundId),
      status: 'completed'
    });

    if (!round) {
      return res.status(404).json({
        success: false,
        error: 'Completed round not found'
      });
    }

    const fairnessProof = provablyFair.generateFairnessProof(
      round.seed,
      round.roundId,
      round.crashPoint
    );

    res.json({
      success: true,
      fairnessProof
    });

  } catch (error) {
    console.error('❌ Get fairness proof error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * Get player's game history
 * GET /api/game/player-history/:playerId
 */
router.get('/player-history/:playerId', async (req, res) => {
  try {
    const { playerId } = req.params;
    const { limit = 20, offset = 0 } = req.query;

    if (!playerId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid player ID format'
      });
    }

    const rounds = await GameRound
      .find({ 
        'playerBets.playerId': playerId,
        status: 'completed'
      })
      .sort({ roundId: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(offset))
      .lean();

    // Extract player-specific data from each round
    const playerHistory = rounds.map(round => {
      const playerBet = round.playerBets.find(bet => bet.playerId.toString() === playerId);
      
      return {
        roundId: round.roundId,
        crashPoint: round.crashPoint,
        startTime: round.startTime,
        endTime: round.endTime,
        playerBet: playerBet ? {
          usdAmount: playerBet.usdAmount,
          cryptoAmount: playerBet.cryptoAmount,
          currency: playerBet.currency,
          cashedOut: playerBet.cashedOut,
          cashoutMultiplier: playerBet.cashoutMultiplier,
          cashoutAmount: playerBet.cashoutAmount,
          profit: playerBet.profit
        } : null
      };
    });

    const totalRounds = await GameRound.countDocuments({ 
      'playerBets.playerId': playerId,
      status: 'completed'
    });

    res.json({
      success: true,
      history: playerHistory,
      pagination: {
        total: totalRounds,
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: parseInt(offset) + parseInt(limit) < totalRounds
      }
    });

  } catch (error) {
    console.error('❌ Get player history error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * Get crash statistics
 * GET /api/game/crash-stats
 */
router.get('/crash-stats', async (req, res) => {
  try {
    const { days = 7 } = req.query;

    const daysNum = parseInt(days);
    const since = new Date(Date.now() - daysNum * 24 * 60 * 60 * 1000);

    const rounds = await GameRound
      .find({ 
        status: 'completed',
        startTime: { $gte: since }
      })
      .select('crashPoint')
      .lean();

    const crashStatistics = provablyFair.getCrashStatistics(rounds);

    res.json({
      success: true,
      period: `Last ${daysNum} days`,
      statistics: crashStatistics
    });

  } catch (error) {
    console.error('❌ Get crash statistics error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

module.exports = router;