const socketIo = require('socket.io');
const gameEngine = require('../services/gameEngine');
const Player = require('../models/Player');

class GameSocketManager {
  constructor() {
    this.io = null;
    this.connectedPlayers = new Map(); // socketId -> playerData
    this.playerSockets = new Map(); // playerId -> socketId
    this.connectionStats = {
      totalConnections: 0,
      activeConnections: 0,
      totalDisconnections: 0
    };
  }

  /**
   * Initialize Socket.IO server
   * @param {Object} server - HTTP server instance
   */
  initialize(server) {
    this.io = socketIo(server, {
      cors: {
        origin: "*",
        methods: ["GET", "POST"],
        credentials: true
      },
      pingTimeout: 60000,
      pingInterval: 25000,
      transports: ['websocket', 'polling']
    });

    this.setupEventHandlers();
    this.setupGameEngineListeners();

    console.log('🔌 WebSocket server initialized');
  }

  /**
   * Setup Socket.IO event handlers
   */
  setupEventHandlers() {
    this.io.on('connection', (socket) => {
      this.handleConnection(socket);
    });
  }

  /**
   * Handle new socket connection
   * @param {Object} socket - Socket instance
   */
  handleConnection(socket) {
    this.connectionStats.totalConnections++;
    this.connectionStats.activeConnections++;

    console.log(`🔗 Client connected: ${socket.id} (${this.connectionStats.activeConnections} active)`);

    // Send current game state immediately
    this.sendGameState(socket);

    // Handle player authentication
    socket.on('authenticate', async (data) => {
      await this.handleAuthentication(socket, data);
    });

    // Handle bet placement via WebSocket
    socket.on('place_bet', async (data) => {
      await this.handlePlaceBet(socket, data);
    });

    // Handle cashout via WebSocket
    socket.on('cashout', async (data) => {
      await this.handleCashout(socket, data);
    });

    // Handle ping for connection health
    socket.on('ping', () => {
      socket.emit('pong', { timestamp: Date.now() });
    });

    // Handle client requests for game state
    socket.on('get_game_state', () => {
      this.sendGameState(socket);
    });

    // Handle disconnection
    socket.on('disconnect', (reason) => {
      this.handleDisconnection(socket, reason);
    });

    // Handle errors
    socket.on('error', (error) => {
      console.error(`❌ Socket error for ${socket.id}:`, error);
    });
  }

  /**
   * Handle player authentication
   * @param {Object} socket - Socket instance
   * @param {Object} data - Authentication data
   */
  async handleAuthentication(socket, data) {
    try {
      const { playerId, username } = data;

      if (!playerId || !username) {
        socket.emit('auth_error', { error: 'Player ID and username are required' });
        return;
      }

      // Verify player exists
      const player = await Player.findById(playerId);
      if (!player) {
        socket.emit('auth_error', { error: 'Player not found' });
        return;
      }

      if (player.username !== username) {
        socket.emit('auth_error', { error: 'Username mismatch' });
        return;
      }

      // Store player data
      this.connectedPlayers.set(socket.id, {
        playerId,
        username,
        connectedAt: Date.now()
      });

      this.playerSockets.set(playerId, socket.id);

      console.log(`👤 Player authenticated: ${username} (${socket.id})`);

      // Send authentication success
      socket.emit('authenticated', {
        playerId,
        username,
        timestamp: Date.now()
      });

      // Broadcast player joined (optional)
      socket.broadcast.emit('player_joined', {
        username,
        timestamp: Date.now()
      });

    } catch (error) {
      console.error('❌ Authentication error:', error);
      socket.emit('auth_error', { error: 'Authentication failed' });
    }
  }

  /**
   * Handle bet placement via WebSocket
   * @param {Object} socket - Socket instance
   * @param {Object} data - Bet data
   */
  async handlePlaceBet(socket, data) {
    try {
      const playerData = this.connectedPlayers.get(socket.id);
      if (!playerData) {
        socket.emit('bet_error', { error: 'Not authenticated' });
        return;
      }

      const { usdAmount, currency } = data;

      if (!usdAmount || !currency) {
        socket.emit('bet_error', { error: 'USD amount and currency are required' });
        return;
      }

      // Place bet through game engine
      const betResult = await gameEngine.placeBet({
        playerId: playerData.playerId,
        username: playerData.username,
        usdAmount,
        currency
      });

      // Send success to player
      socket.emit('bet_placed', {
        success: true,
        bet: betResult,
        timestamp: Date.now()
      });

      console.log(`🎲 WebSocket bet: ${playerData.username} - $${usdAmount} (${currency})`);

    } catch (error) {
      console.error('❌ WebSocket bet error:', error);
      socket.emit('bet_error', { 
        error: error.message,
        timestamp: Date.now()
      });
    }
  }

  /**
   * Handle cashout via WebSocket
   * @param {Object} socket - Socket instance
   * @param {Object} data - Cashout data
   */
  async handleCashout(socket, data) {
    try {
      const playerData = this.connectedPlayers.get(socket.id);
      if (!playerData) {
        socket.emit('cashout_error', { error: 'Not authenticated' });
        return;
      }

      // Process cashout through game engine
      const cashoutResult = await gameEngine.cashOut(playerData.playerId);

      // Send success to player
      socket.emit('cashed_out', {
        success: true,
        cashout: cashoutResult,
        timestamp: Date.now()
      });

      console.log(`💰 WebSocket cashout: ${playerData.username} - ${cashoutResult.multiplier}x`);

    } catch (error) {
      console.error('❌ WebSocket cashout error:', error);
      socket.emit('cashout_error', { 
        error: error.message,
        timestamp: Date.now()
      });
    }
  }

  /**
   * Handle socket disconnection
   * @param {Object} socket - Socket instance
   * @param {string} reason - Disconnection reason
   */
  handleDisconnection(socket, reason) {
    this.connectionStats.activeConnections--;
    this.connectionStats.totalDisconnections++;

    const playerData = this.connectedPlayers.get(socket.id);
    
    if (playerData) {
      console.log(`🔌 Player disconnected: ${playerData.username} (${socket.id}) - ${reason}`);
      
      // Clean up player data
      this.playerSockets.delete(playerData.playerId);
      this.connectedPlayers.delete(socket.id);

      // Broadcast player left (optional)
      socket.broadcast.emit('player_left', {
        username: playerData.username,
        reason,
        timestamp: Date.now()
      });
    } else {
      console.log(`🔌 Client disconnected: ${socket.id} - ${reason}`);
    }

    console.log(`📊 Active connections: ${this.connectionStats.activeConnections}`);
  }

  /**
   * Setup game engine event listeners
   */
  setupGameEngineListeners() {
    // Round created event
    gameEngine.on('round_created', (data) => {
      this.broadcast('round_created', data);
    });

    // Round started event
    gameEngine.on('round_started', (data) => {
      this.broadcast('round_started', data);
    });

    // Multiplier update event
    gameEngine.on('multiplier_update', (data) => {
      this.broadcast('multiplier_update', data);
    });

    // Player bet placed event
    gameEngine.on('bet_placed', (data) => {
      this.broadcast('bet_placed', data);
    });

    // Player cashout event
    gameEngine.on('player_cashout', (data) => {
      this.broadcast('player_cashout', data);
    });

    // Round crashed event
    gameEngine.on('round_crashed', (data) => {
      this.broadcast('round_crashed', data);
    });

    // Fairness proof event
    gameEngine.on('fairness_proof', (data) => {
      this.broadcast('fairness_proof', data);
    });

    // Engine started event
    gameEngine.on('engine_started', () => {
      this.broadcast('engine_started', { timestamp: Date.now() });
    });

    // Engine stopped event
    gameEngine.on('engine_stopped', () => {
      this.broadcast('engine_stopped', { timestamp: Date.now() });
    });

    console.log('🎮 Game engine event listeners setup complete');
  }

  /**
   * Broadcast message to all connected clients
   * @param {string} event - Event name
   * @param {Object} data - Event data
   */
  broadcast(event, data) {
    if (!this.io) return;

    this.io.emit(event, {
      ...data,
      timestamp: data.timestamp || Date.now()
    });

    // Log important events
    if (['round_started', 'round_crashed', 'player_cashout'].includes(event)) {
      console.log(`📡 Broadcast: ${event} to ${this.connectionStats.activeConnections} clients`);
    }
  }

  /**
   * Send message to specific player
   * @param {string} playerId - Player ID
   * @param {string} event - Event name
   * @param {Object} data - Event data
   */
  sendToPlayer(playerId, event, data) {
    const socketId = this.playerSockets.get(playerId);
    if (socketId && this.io) {
      this.io.to(socketId).emit(event, {
        ...data,
        timestamp: Date.now()
      });
    }
  }

  /**
   * Send current game state to socket
   * @param {Object} socket - Socket instance
   */
  sendGameState(socket) {
    try {
      const gameState = gameEngine.getCurrentState();
      socket.emit('game_state', gameState);
    } catch (error) {
      console.error('❌ Error sending game state:', error);
      socket.emit('error', { error: 'Failed to get game state' });
    }
  }

  /**
   * Get connection statistics
   * @returns {Object} Connection stats
   */
  getConnectionStats() {
    return {
      ...this.connectionStats,
      connectedPlayers: Array.from(this.connectedPlayers.values()).map(player => ({
        username: player.username,
        connectedAt: new Date(player.connectedAt).toISOString(),
        connectionDuration: Date.now() - player.connectedAt
      })),
      playersOnline: this.connectedPlayers.size
    };
  }

  /**
   * Send connection stats to all clients
   */
  broadcastConnectionStats() {
    this.broadcast('connection_stats', this.getConnectionStats());
  }

  /**
   * Kick player from server
   * @param {string} playerId - Player ID to kick
   * @param {string} reason - Kick reason
   */
  kickPlayer(playerId, reason = 'Kicked by admin') {
    const socketId = this.playerSockets.get(playerId);
    if (socketId && this.io) {
      const socket = this.io.sockets.sockets.get(socketId);
      if (socket) {
        socket.emit('kicked', { reason });
        socket.disconnect(true);
        console.log(`🚪 Player kicked: ${playerId} - ${reason}`);
      }
    }
  }

  /**
   * Send system message to all clients
   * @param {string} message - System message
   * @param {string} type - Message type (info, warning, error)
   */
  sendSystemMessage(message, type = 'info') {
    this.broadcast('system_message', {
      message,
      type,
      timestamp: Date.now()
    });
  }

  /**
   * Gracefully shutdown WebSocket server
   */
  async shutdown() {
    console.log('🛑 Shutting down WebSocket server...');
    
    // Notify all clients
    this.sendSystemMessage('Server is shutting down', 'warning');

    // Wait a bit for message to be sent
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Disconnect all clients
    if (this.io) {
      this.io.disconnectSockets(true);
      this.io.close();
    }

    // Clear data
    this.connectedPlayers.clear();
    this.playerSockets.clear();

    console.log('✅ WebSocket server shut down complete');
  }
}

module.exports = new GameSocketManager();