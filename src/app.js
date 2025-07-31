const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const path = require('path');

// Import configuration and services
const config = require('./config/environment');
const database = require('./config/database');
const gameEngine = require('./services/gameEngine');
const gameSocket = require('./websocket/gameSocket');

// Import routes
const authRoutes = require('./routes/auth');
const gameRoutes = require('./routes/game');
const walletRoutes = require('./routes/wallet');

class CryptoCrashServer {
  constructor() {
    this.app = express();
    this.server = http.createServer(this.app);
    this.isShuttingDown = false;
  }

  /**
   * Initialize the server
   */
  async initialize() {
    try {
      console.log('🚀 Initializing Crypto Crash Server...');
      
      // Connect to database
      await database.connect();
      
      // Setup middleware
      this.setupMiddleware();
      
      // Setup routes
      this.setupRoutes();
      
      // Setup error handling
      this.setupErrorHandling();
      
      // Initialize WebSocket
      gameSocket.initialize(this.server);
      
      // Start game engine
      await gameEngine.start();
      
      // Setup graceful shutdown
      this.setupGracefulShutdown();
      
      console.log('✅ Server initialization complete');
      
    } catch (error) {
      console.error('❌ Server initialization failed:', error);
      process.exit(1);
    }
  }

  /**
   * Setup Express middleware
   */
  setupMiddleware() {
    // Security middleware
    this.app.use(helmet({
      contentSecurityPolicy: false, // Disable for development
      crossOriginEmbedderPolicy: false
    }));

    // Compression middleware
    this.app.use(compression());

    // CORS middleware
    this.app.use(cors({
      origin: config.CORS_ORIGIN === '*' ? true : config.CORS_ORIGIN.split(','),
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
    }));

    // Rate limiting
    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 1000, // Limit each IP to 1000 requests per windowMs
      message: {
        success: false,
        error: 'Too many requests, please try again later'
      },
      standardHeaders: true,
      legacyHeaders: false
    });
    this.app.use(limiter);

    // Stricter rate limiting for bet/cashout endpoints
    const gameActionLimiter = rateLimit({
      windowMs: 1 * 60 * 1000, // 1 minute
      max: 100, // 100 actions per minute
      message: {
        success: false,
        error: 'Too many game actions, please slow down'
      }
    });
    this.app.use('/api/game/bet', gameActionLimiter);
    this.app.use('/api/game/cashout', gameActionLimiter);

    // Body parsing middleware
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Static files
    this.app.use(express.static(path.join(__dirname, '../public')));

    // Request logging
    this.app.use((req, res, next) => {
      if (config.NODE_ENV === 'development') {
        console.log(`${new Date().toISOString()} - ${req.method} ${req.path} - ${req.ip}`);
      }
      next();
    });
  }

  /**
   * Setup API routes
   */
  setupRoutes() {
    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.json({
        success: true,
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: '1.0.0',
        environment: config.NODE_ENV,
        gameState: gameEngine.getCurrentState().gameState,
        connections: gameSocket.getConnectionStats().activeConnections
      });
    });

    // API routes
    this.app.use('/api/auth', authRoutes);
    this.app.use('/api/game', gameRoutes);
    this.app.use('/api/wallet', walletRoutes);

    // API info endpoint
    this.app.get('/api', (req, res) => {
      res.json({
        success: true,
        message: 'Crypto Crash Game API',
        version: '1.0.0',
        endpoints: {
          auth: '/api/auth',
          game: '/api/game',
          wallet: '/api/wallet'
        },
        documentation: 'See README.md for API documentation',
        websocket: 'Connect to / namespace for real-time updates'
      });
    });

    // Serve WebSocket test client at root
    this.app.get('/', (req, res) => {
      res.sendFile(path.join(__dirname, '../public/websocket-test.html'));
    });

    // 404 handler
    this.app.use((req, res) => {
      res.status(404).json({
        success: false,
        error: 'Endpoint not found',
        path: req.path,
        method: req.method
      });
    });
  }

  /**
   * Setup error handling middleware
   */
  setupErrorHandling() {
    // Global error handler
    this.app.use((error, req, res, next) => {
      console.error('❌ Unhandled error:', error);
      
      // Don't leak error details in production
      const errorMessage = config.NODE_ENV === 'production' 
        ? 'Internal server error' 
        : error.message;

      res.status(error.status || 500).json({
        success: false,
        error: errorMessage,
        timestamp: new Date().toISOString(),
        path: req.path,
        method: req.method
      });
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      console.error('❌ Uncaught Exception:', error);
      this.gracefulShutdown('SIGTERM');
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
      this.gracefulShutdown('SIGTERM');
    });
  }

  /**
   * Start the server
   */
  async start() {
    try {
      await this.initialize();
      
      this.server.listen(config.PORT, () => {
        console.log(`🎮 Crypto Crash Server running on port ${config.PORT}`);
        console.log(`🌐 Environment: ${config.NODE_ENV}`);
        console.log(`📡 WebSocket server ready for connections`);
        console.log(`🔗 Server URL: http://localhost:${config.PORT}`);
        console.log(`🔗 API URL: http://localhost:${config.PORT}/api`);
        console.log(`🔗 Health Check: http://localhost:${config.PORT}/health`);
        
        if (config.NODE_ENV === 'development') {
          console.log(`🧪 WebSocket Test Client: http://localhost:${config.PORT}`);
        }
      });

    } catch (error) {
      console.error('❌ Failed to start server:', error);
      process.exit(1);
    }
  }

  /**
   * Setup graceful shutdown handlers
   */
  setupGracefulShutdown() {
    // Handle shutdown signals
    process.on('SIGTERM', () => this.gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => this.gracefulShutdown('SIGINT'));
    
    // Handle Windows signals
    if (process.platform === 'win32') {
      process.on('SIGBREAK', () => this.gracefulShutdown('SIGBREAK'));
    }
  }

  /**
   * Graceful shutdown process
   * @param {string} signal - Shutdown signal
   */
  async gracefulShutdown(signal) {
    if (this.isShuttingDown) {
      console.log('⏳ Shutdown already in progress...');
      return;
    }

    this.isShuttingDown = true;
    console.log(`🛑 Received ${signal}. Starting graceful shutdown...`);

    try {
      // Stop accepting new connections
      this.server.close(() => {
        console.log('✅ HTTP server closed');
      });

      // Stop game engine
      await gameEngine.stop();

      // Shutdown WebSocket server
      await gameSocket.shutdown();

      // Disconnect from database
      await database.disconnect();

      console.log('✅ Graceful shutdown complete');
      process.exit(0);

    } catch (error) {
      console.error('❌ Error during shutdown:', error);
      process.exit(1);
    }
  }

  /**
   * Get server instance
   * @returns {Object} Express app
   */
  getApp() {
    return this.app;
  }

  /**
   * Get HTTP server instance
   * @returns {Object} HTTP server
   */
  getServer() {
    return this.server;
  }
}

// Create and start server if this file is run directly
if (require.main === module) {
  const server = new CryptoCrashServer();
  server.start().catch(error => {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  });
}

module.exports = CryptoCrashServer;