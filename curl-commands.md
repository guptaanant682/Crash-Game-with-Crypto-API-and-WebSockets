# Crypto Crash API - cURL Commands

This file contains cURL commands to test all API endpoints of the Crypto Crash game backend.

## Setup

Before testing, ensure:
1. Server is running on `http://localhost:3000`
2. Database is seeded with sample data: `npm run seed-simple`
3. Replace `PLAYER_ID` with actual player ID from seeded data

## Health & Status Endpoints

### Health Check
```bash
curl -X GET http://localhost:3000/health
```

### API Information
```bash
curl -X GET http://localhost:3000/api
```

## Authentication Endpoints

### Register New Player
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "TestPlayer",
    "email": "testplayer@example.com"
  }'
```

### Login Player
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "Player1"
  }'
```

### Get Player Profile
```bash
curl -X GET http://localhost:3000/api/auth/profile/PLAYER_ID
```

### Get Players Leaderboard
```bash
curl -X GET "http://localhost:3000/api/auth/players?limit=10&sortBy=netProfit&sortOrder=desc"
```

## Game Endpoints

### Get Current Game State
```bash
curl -X GET http://localhost:3000/api/game/state
```

### Place Bet
```bash
curl -X POST http://localhost:3000/api/game/bet \
  -H "Content-Type: application/json" \
  -d '{
    "playerId": "PLAYER_ID",
    "username": "Player1",
    "usdAmount": 10,
    "currency": "bitcoin"
  }'
```

### Cash Out
```bash
curl -X POST http://localhost:3000/api/game/cashout \
  -H "Content-Type: application/json" \
  -d '{
    "playerId": "PLAYER_ID"
  }'
```

### Get Round History
```bash
curl -X GET "http://localhost:3000/api/game/history?limit=10&offset=0"
```

### Get Specific Round Details
```bash
curl -X GET http://localhost:3000/api/game/round/1
```

### Get Game Statistics
```bash
curl -X GET http://localhost:3000/api/game/stats
```

### Verify Round Fairness
```bash
curl -X POST http://localhost:3000/api/game/verify-fairness \
  -H "Content-Type: application/json" \
  -d '{
    "seed": "example_seed_here",
    "roundId": 1,
    "crashPoint": 2.45
  }'
```

### Get Fairness Proof
```bash
curl -X GET http://localhost:3000/api/game/fairness-proof/1
```

### Get Player Game History
```bash
curl -X GET "http://localhost:3000/api/game/player-history/PLAYER_ID?limit=5"
```

### Get Crash Statistics
```bash
curl -X GET "http://localhost:3000/api/game/crash-stats?days=7"
```

## Wallet Endpoints

### Get Wallet Balance
```bash
curl -X GET http://localhost:3000/api/wallet/balance/PLAYER_ID
```

### Process Deposit
```bash
curl -X POST http://localhost:3000/api/wallet/deposit \
  -H "Content-Type: application/json" \
  -d '{
    "playerId": "PLAYER_ID",
    "usdAmount": 100,
    "currency": "bitcoin"
  }'
```

### Check Balance Sufficient
```bash
curl -X POST http://localhost:3000/api/wallet/check-balance \
  -H "Content-Type: application/json" \
  -d '{
    "playerId": "PLAYER_ID",
    "usdAmount": 10,
    "currency": "bitcoin"
  }'
```

### Get Transaction History
```bash
curl -X GET "http://localhost:3000/api/wallet/transactions/PLAYER_ID?limit=10&type=bet"
```

### Get Wallet Statistics
```bash
curl -X GET http://localhost:3000/api/wallet/stats/PLAYER_ID
```

### Get Current Crypto Prices
```bash
curl -X GET http://localhost:3000/api/wallet/prices
```

### Convert USD to Crypto
```bash
curl -X POST http://localhost:3000/api/wallet/convert/usd-to-crypto \
  -H "Content-Type: application/json" \
  -d '{
    "usdAmount": 100,
    "currency": "bitcoin"
  }'
```

### Convert Crypto to USD
```bash
curl -X POST http://localhost:3000/api/wallet/convert/crypto-to-usd \
  -H "Content-Type: application/json" \
  -d '{
    "cryptoAmount": 0.001,
    "currency": "bitcoin"
  }'
```

### Get Historical Prices
```bash
curl -X GET "http://localhost:3000/api/wallet/prices/history/bitcoin?days=7"
```

## Testing Workflow

### 1. Complete Game Flow Test
```bash
# 1. Check server health
curl -X GET http://localhost:3000/health

# 2. Get current game state
curl -X GET http://localhost:3000/api/game/state

# 3. Check player balance (replace PLAYER_ID)
curl -X GET http://localhost:3000/api/wallet/balance/PLAYER_ID

# 4. Place a bet (during betting phase)
curl -X POST http://localhost:3000/api/game/bet \
  -H "Content-Type: application/json" \
  -d '{
    "playerId": "PLAYER_ID",
    "username": "Player1",
    "usdAmount": 10,
    "currency": "bitcoin"
  }'

# 5. Cash out (during round execution, before crash)
curl -X POST http://localhost:3000/api/game/cashout \
  -H "Content-Type: application/json" \
  -d '{
    "playerId": "PLAYER_ID"
  }'

# 6. Check updated balance
curl -X GET http://localhost:3000/api/wallet/balance/PLAYER_ID

# 7. Get round history
curl -X GET http://localhost:3000/api/game/history
```

### 2. Authentication Test
```bash
# Register new player
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "NewPlayer",
    "email": "newplayer@example.com"
  }'

# Login existing player
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "Player1"
  }'

# Get leaderboard
curl -X GET http://localhost:3000/api/auth/players
```

### 3. Cryptocurrency Integration Test
```bash
# Get current prices
curl -X GET http://localhost:3000/api/wallet/prices

# Convert USD to Bitcoin
curl -X POST http://localhost:3000/api/wallet/convert/usd-to-crypto \
  -H "Content-Type: application/json" \
  -d '{
    "usdAmount": 50,
    "currency": "bitcoin"
  }'

# Convert Bitcoin to USD
curl -X POST http://localhost:3000/api/wallet/convert/crypto-to-usd \
  -H "Content-Type: application/json" \
  -d '{
    "cryptoAmount": 0.001,
    "currency": "bitcoin"
  }'

# Get price history
curl -X GET "http://localhost:3000/api/wallet/prices/history/bitcoin?days=1"
```

### 4. Provably Fair Verification Test
```bash
# Get fairness proof for round
curl -X GET http://localhost:3000/api/game/fairness-proof/1

# Verify round fairness (use actual values from completed round)
curl -X POST http://localhost:3000/api/game/verify-fairness \
  -H "Content-Type: application/json" \
  -d '{
    "seed": "actual_seed_from_round",
    "roundId": 1,
    "crashPoint": 2.45
  }'
```

## Sample Player IDs (from seeded data)

When running `npm run seed-simple`, use these sample players:
- Player1
- Player2  
- Player3
- Player4
- Player5

To get actual Player IDs, run:
```bash
curl -X GET http://localhost:3000/api/auth/players
```

## Expected Response Formats

### Success Response
```json
{
  "success": true,
  "data": { ... },
  "message": "Operation completed successfully"
}
```

### Error Response
```json
{
  "success": false,
  "error": "Error description",
  "code": "ERROR_CODE"
}
```

## Tips for Testing

1. **Timing**: Some endpoints (like bet placement) only work during specific game phases
2. **Player IDs**: Always use actual player IDs from your seeded database
3. **Game State**: Check game state before placing bets or cashing out
4. **WebSocket**: For real-time testing, use the WebSocket client at `http://localhost:3000`
5. **Rate Limits**: API has rate limiting, so don't spam requests too quickly

## Troubleshooting

### Common Issues

1. **"Player not found"**: Make sure to use valid player ID from seeded data
2. **"Cannot place bet - game state is X"**: Bets can only be placed during betting phase
3. **"No active bet to cash out"**: You need an active bet to cash out
4. **"Insufficient balance"**: Player needs sufficient crypto balance for the bet

### Debug Commands

```bash
# Check if server is running
curl -X GET http://localhost:3000/health

# Get detailed game state
curl -X GET http://localhost:3000/api/game/state

# Check if player exists
curl -X GET http://localhost:3000/api/auth/players
```