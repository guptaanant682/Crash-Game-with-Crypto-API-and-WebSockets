# Crypto Crash Game Backend

A backend implementation for an online "Crypto Crash" game called "Crypto Crash." Players bet in USD, which is converted to cryptocurrency using real-time prices fetched from a cryptocurrency API. The backend handles game logic, cryptocurrency transactions, and real-time multiplayer updates using WebSockets.

## Features

### Game Logic
- Complete crash game implementation with 10-second rounds
- Provably fair crash algorithm using cryptographically secure random number generation
- Exponential multiplier progression with real-time updates
- Player bet placement and cashout functionality
- Game state tracking and round history storage

### Cryptocurrency Integration
- Real-time crypto price fetching from CoinGecko API
- USD to cryptocurrency conversion using current market prices
- Simulated cryptocurrency wallet system for players
- Transaction logging with mock blockchain data
- Balance management with atomic database transactions

### WebSocket Implementation
- Real-time multiplayer event broadcasting
- Multiplier updates at least every 100ms
- Player cashout notifications
- Round start and crash events
- WebSocket-based bet placement and cashout

### Security
- Input validation for all API endpoints
- Rate limiting to prevent abuse
- Cryptographically secure crash point generation
- Database transaction atomicity to prevent race conditions
- Comprehensive error handling and logging

## Setup Instructions

### Prerequisites
- Node.js version 16 or higher
- MongoDB database connection
- CoinGecko API key (optional, has fallback prices)

### Installation
1. Navigate to the project directory
2. Install dependencies:
   ```bash
   npm install
   ```
3. Configure environment variables in .env file (already configured)
4. Seed the database with sample data:
   ```bash
   npm run seed
   ```
5. Start the server:
   ```bash
   npm start
   ```

### Configuration
The .env file contains the following configuration:
```
NODE_ENV=development
PORT=3000
MONGODB_URI=mongodb+srv://sixtynine:sixtynine@cluster0.5p2ghaj.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0
COINGECKO_API_KEY=CG-25XUsgv7rtcVu9MuTCtBk25U
CORS_ORIGIN=*
GAME_ROUND_DURATION=10000
MULTIPLIER_UPDATE_INTERVAL=100
PRICE_CACHE_DURATION=10000
GROWTH_FACTOR=0.04
```

## API Endpoints

### Authentication Endpoints
- POST /api/auth/register - Register a new player
- POST /api/auth/login - Player authentication
- GET /api/auth/profile/:playerId - Get player profile
- GET /api/auth/players - Get leaderboard

### Game Endpoints
- GET /api/game/state - Get current game state
- POST /api/game/bet - Place a bet (requires playerId, username, usdAmount, currency)
- POST /api/game/cashout - Cash out during round (requires playerId)
- GET /api/game/history - Get round history
- GET /api/game/round/:roundId - Get specific round details
- GET /api/game/stats - Get game statistics
- POST /api/game/verify-fairness - Verify round fairness
- GET /api/game/fairness-proof/:roundId - Get fairness proof for round

### Wallet Endpoints
- GET /api/wallet/balance/:playerId - Check wallet balance (crypto and USD equivalent)
- POST /api/wallet/deposit - Process deposit
- GET /api/wallet/transactions/:playerId - Get transaction history
- GET /api/wallet/prices - Get current crypto prices
- POST /api/wallet/convert/usd-to-crypto - Convert USD to crypto
- POST /api/wallet/convert/crypto-to-usd - Convert crypto to USD

## WebSocket Events

### Client to Server Events
- authenticate - Authenticate player with playerId and username
- place_bet - Place bet with usdAmount and currency
- cashout - Request cashout
- get_game_state - Request current game state
- ping - Connection health check

### Server to Client Events
- round_created - New round created with hash
- round_started - Round started, multiplier begins increasing
- multiplier_update - Real-time multiplier updates
- bet_placed - Bet placement confirmation
- player_cashout - Player cashout notification
- round_crashed - Round crash with final crash point
- fairness_proof - Fairness proof after round completion
- authenticated - Authentication success
- auth_error - Authentication failure

## Provably Fair Algorithm

The crash point is determined using a provably fair algorithm:
1. Generate cryptographically secure random seed
2. Create SHA-256 hash of seed for transparency
3. Calculate crash point using hash(seed + round_number) with exponential distribution
4. Crash points range from 1.01x to 120x
5. After round completion, seed is revealed for verification

### Verification Process
Players can verify any round by:
1. Using the revealed seed and round ID
2. Applying the same hash function
3. Comparing the calculated crash point with the actual crash point

## USD to Crypto Conversion Logic

### Bet Placement
1. Player bets in USD (e.g., $10)
2. Current crypto price is fetched (e.g., BTC at $60,000)
3. USD amount is converted to crypto: $10 / $60,000 = 0.00016667 BTC
4. Crypto amount is deducted from player wallet

### Cashout Process
1. Player cashes out at current multiplier (e.g., 2x)
2. Crypto payout calculated: 0.00016667 BTC * 2 = 0.00033334 BTC
3. USD equivalent calculated for display: 0.00033334 * $60,000 = $20
4. Crypto amount is added to player wallet

### Price Caching
- Crypto prices are cached for 10 seconds to avoid API rate limits
- Conversions use the price at the time of the bet
- Fallback prices are used if API fails

## Database Schema

### Player Model
- username, email (unique identifiers)
- wallet (bitcoin and ethereum balances)
- totalDeposited, totalWithdrawn, gamesPlayed
- totalWon, totalLost, netProfit statistics
- biggestWin, biggestLoss, currentStreak, bestStreak
- lastPlayedAt, account status

### GameRound Model
- roundId, seed, hash, crashPoint
- startTime, endTime, duration, status
- playerBets array with detailed bet information
- totalBetAmount, totalCashoutAmount, playersCount
- multiplierHistory for round replay

### Transaction Model
- playerId, roundId, transactionHash
- type (bet, cashout, deposit, withdrawal)
- usdAmount, cryptoAmount, currency
- priceAtTime, status, timestamp
- simulated blockchain data (blockNumber, gasUsed, etc.)

## Testing

### Sample Data
The seed script creates 5 sample players with the following IDs:
- CryptoKing: 688bca43d4fc34cb3d41aed8
- MoonTrader: 688bca43d4fc34cb3d41aedb
- DiamondHands: 688bca43d4fc34cb3d41aedf
- HODLer: 688bca43d4fc34cb3d41aee3
- RocketMan: 688bca43d4fc34cb3d41aee7

### WebSocket Test Client
A basic WebSocket client is available at http://localhost:3000 for testing:
1. Enter player ID and username from sample data
2. Authenticate the connection
3. Place bets during betting phase
4. Cash out before crash
5. View real-time multiplier updates and game events


Sample Data Script
- scripts/simpleSeed.js - Creates exactly 5 players and 3 game rounds as pecified
- SAMPLE_DATA_INSTRUCTIONS.md - Detailed instructions for using sample data
- Easy to run with npm run seed-simple

4. API Testing Tools
- Postman Collection: postman/Crypto_Crash_API_Collection.json - Complete collection with all endpoints organized by
category
- cURL Commands: curl-commands.md - Alternative testing approach with ready-to-use cURL commands for all endpoints

### API Testing Examples
```bash
# Health check
curl http://localhost:3000/health

# Get current game state
curl http://localhost:3000/api/game/state

# Check wallet balance
curl http://localhost:3000/api/wallet/balance/688bca43d4fc34cb3d41aed8

# Place bet
curl -X POST http://localhost:3000/api/game/bet \
  -H "Content-Type: application/json" \
  -d '{"playerId":"688bca43d4fc34cb3d41aed8","username":"CryptoKing","usdAmount":10,"currency":"bitcoin"}'

# Cash out
curl -X POST http://localhost:3000/api/game/cashout \
  -H "Content-Type: application/json" \
  -d '{"playerId":"688bca43d4fc34cb3d41aed8"}'
```

## Technical Implementation

### Game Logic Approach
The game engine runs continuously with the following cycle:
1. Create new round with provably fair crash point
2. 10-second betting phase for player bet placement
3. Round execution with exponential multiplier growth
4. Crash at predetermined point
5. Process payouts and update player statistics

### Crypto Integration Approach
Real-time price integration is handled through:
- CoinGecko API integration with rate limiting
- Price caching to minimize API calls
- Fallback prices for API failures
- Atomic database transactions for balance updates

### WebSocket Implementation
The WebSocket server provides:
- Real-time event broadcasting to all connected clients
- Individual player authentication and state management
- Multiplier updates every 100ms during rounds
- Connection health monitoring and graceful shutdowns

## Error Handling

The system includes comprehensive error handling:
- Input validation for all endpoints
- Database transaction rollbacks on failures
- API rate limit and timeout handling
- WebSocket connection error recovery
- Detailed logging for debugging

## Performance Considerations

- Database indexes for optimized queries
- Connection pooling for database efficiency
- WebSocket event throttling for performance
- Memory management for long-running processes
- Graceful shutdown procedures
