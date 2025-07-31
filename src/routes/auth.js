const express = require('express');
const Player = require('../models/Player');
const router = express.Router();

/**
 * Register a new player
 * POST /api/auth/register
 */
router.post('/register', async (req, res) => {
  try {
    const { username, email } = req.body;

    // Validate input
    if (!username || !email) {
      return res.status(400).json({
        success: false,
        error: 'Username and email are required'
      });
    }

    // Validate username format
    if (username.length < 3 || username.length > 20) {
      return res.status(400).json({
        success: false,
        error: 'Username must be between 3 and 20 characters'
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid email format'
      });
    }

    // Check if username or email already exists
    const existingPlayer = await Player.findOne({
      $or: [{ username }, { email: email.toLowerCase() }]
    });

    if (existingPlayer) {
      return res.status(409).json({
        success: false,
        error: 'Username or email already exists'
      });
    }

    // Create new player with starter crypto amounts
    const player = new Player({
      username: username.trim(),
      email: email.toLowerCase().trim(),
      wallet: {
        bitcoin: 0.001,    // ~$45 at $45k BTC
        ethereum: 0.01     // ~$30 at $3k ETH
      }
    });

    await player.save();

    console.log(`👤 New player registered: ${username} (${email})`);

    res.status(201).json({
      success: true,
      message: 'Player registered successfully',
      player: {
        id: player._id,
        username: player.username,
        email: player.email,
        wallet: player.wallet,
        createdAt: player.createdAt
      }
    });

  } catch (error) {
    console.error('❌ Register error:', error);
    
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        error: 'Username or email already exists'
      });
    }

    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * Login player (simple authentication)
 * POST /api/auth/login
 */
router.post('/login', async (req, res) => {
  try {
    const { username, email } = req.body;

    if (!username && !email) {
      return res.status(400).json({
        success: false,
        error: 'Username or email is required'
      });
    }

    // Find player by username or email
    const query = username ? { username } : { email: email.toLowerCase() };
    const player = await Player.findOne(query);

    if (!player) {
      return res.status(404).json({
        success: false,
        error: 'Player not found'
      });
    }

    if (!player.isActive) {
      return res.status(403).json({
        success: false,
        error: 'Account is deactivated'
      });
    }

    console.log(`🔑 Player logged in: ${player.username}`);

    res.json({
      success: true,
      message: 'Login successful',
      player: {
        id: player._id,
        username: player.username,
        email: player.email,
        wallet: player.wallet,
        statistics: {
          gamesPlayed: player.gamesPlayed,
          totalWon: player.totalWon,
          totalLost: player.totalLost,
          netProfit: player.netProfit,
          winRate: player.winRate
        },
        createdAt: player.createdAt
      }
    });

  } catch (error) {
    console.error('❌ Login error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * Get player profile
 * GET /api/auth/profile/:playerId
 */
router.get('/profile/:playerId', async (req, res) => {
  try {
    const { playerId } = req.params;

    if (!playerId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid player ID format'
      });
    }

    const player = await Player.findById(playerId);

    if (!player) {
      return res.status(404).json({
        success: false,
        error: 'Player not found'
      });
    }

    res.json({
      success: true,
      player: {
        id: player._id,
        username: player.username,
        email: player.email,
        wallet: player.wallet,
        statistics: {
          gamesPlayed: player.gamesPlayed,
          totalWon: player.totalWon,
          totalLost: player.totalLost,
          totalDeposited: player.totalDeposited,
          totalWithdrawn: player.totalWithdrawn,
          netProfit: player.netProfit,
          winRate: player.winRate
        },
        isActive: player.isActive,
        createdAt: player.createdAt,
        updatedAt: player.updatedAt
      }
    });

  } catch (error) {
    console.error('❌ Get profile error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * Update player profile
 * PUT /api/auth/profile/:playerId
 */
router.put('/profile/:playerId', async (req, res) => {
  try {
    const { playerId } = req.params;
    const { username, email } = req.body;

    if (!playerId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid player ID format'
      });
    }

    const player = await Player.findById(playerId);

    if (!player) {
      return res.status(404).json({
        success: false,
        error: 'Player not found'
      });
    }

    // Update fields if provided
    if (username) {
      if (username.length < 3 || username.length > 20) {
        return res.status(400).json({
          success: false,
          error: 'Username must be between 3 and 20 characters'
        });
      }

      // Check if username is taken by another player
      const existingPlayer = await Player.findOne({ 
        username, 
        _id: { $ne: playerId } 
      });

      if (existingPlayer) {
        return res.status(409).json({
          success: false,
          error: 'Username already taken'
        });
      }

      player.username = username.trim();
    }

    if (email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid email format'
        });
      }

      // Check if email is taken by another player
      const existingPlayer = await Player.findOne({ 
        email: email.toLowerCase(), 
        _id: { $ne: playerId } 
      });

      if (existingPlayer) {
        return res.status(409).json({
          success: false,
          error: 'Email already taken'
        });
      }

      player.email = email.toLowerCase().trim();
    }

    await player.save();

    console.log(`📝 Player profile updated: ${player.username}`);

    res.json({
      success: true,
      message: 'Profile updated successfully',
      player: {
        id: player._id,
        username: player.username,
        email: player.email,
        updatedAt: player.updatedAt
      }
    });

  } catch (error) {
    console.error('❌ Update profile error:', error);
    
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        error: 'Username or email already exists'
      });
    }

    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * Get all players (for leaderboard)
 * GET /api/auth/players
 */
router.get('/players', async (req, res) => {
  try {
    const { 
      limit = 50, 
      offset = 0, 
      sortBy = 'netProfit', 
      sortOrder = 'desc' 
    } = req.query;

    const players = await Player
      .find({ isActive: true })
      .select('username gamesPlayed totalWon totalLost netProfit winRate createdAt')
      .sort({ [sortBy]: sortOrder === 'desc' ? -1 : 1 })
      .limit(parseInt(limit))
      .skip(parseInt(offset))
      .lean();

    const totalPlayers = await Player.countDocuments({ isActive: true });

    res.json({
      success: true,
      players: players.map((player, index) => ({
        rank: parseInt(offset) + index + 1,
        id: player._id,
        username: player.username,
        gamesPlayed: player.gamesPlayed,
        totalWon: player.totalWon,
        totalLost: player.totalLost,
        netProfit: player.netProfit,
        winRate: player.winRate,
        memberSince: player.createdAt
      })),
      pagination: {
        total: totalPlayers,
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: parseInt(offset) + parseInt(limit) < totalPlayers
      }
    });

  } catch (error) {
    console.error('❌ Get players error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

module.exports = router;