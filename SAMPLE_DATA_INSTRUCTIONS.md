# Database Sample Data Instructions

This document provides instructions for populating the database with sample data as required by the assignment.

## Quick Setup

### Option 1: Run Simple Seed Script (Recommended)
```bash
npm run seed-simple
```

### Option 2: Run Full Seed Script
```bash
npm run seed
```

### Option 3: Manual Seeding
```bash
node scripts/simpleSeed.js
```

## What Gets Created

### Sample Players (5 players)
The script creates 5 players with wallet balances and game statistics:

1. **Player1** (player1@example.com)
   - Wallet: 0.01 BTC, 0.1 ETH
   - Total Deposited: $500
   - Games Played: 10

2. **Player2** (player2@example.com)
   - Wallet: 0.005 BTC, 0.05 ETH
   - Total Deposited: $250
   - Games Played: 5

3. **Player3** (player3@example.com)
   - Wallet: 0.02 BTC, 0.2 ETH
   - Total Deposited: $1000
   - Games Played: 20

4. **Player4** (player4@example.com)
   - Wallet: 0.008 BTC, 0.08 ETH
   - Total Deposited: $400
   - Games Played: 8

5. **Player5** (player5@example.com)
   - Wallet: 0.015 BTC, 0.15 ETH
   - Total Deposited: $750
   - Games Played: 15

### Sample Game Rounds (3 rounds)

1. **Round 1**: Crashed at 2.5x multiplier
   - 3 players participated
   - Mix of winners and losers

2. **Round 2**: Crashed at 1.2x multiplier (early crash)
   - 3 players participated
   - Most players lost (early crash)

3. **Round 3**: Crashed at 5.8x multiplier (high multiplier)
   - 3 players participated
   - Good opportunity for profits

### Transaction Records
- Bet transactions for each player in each round
- Cashout transactions for players who cashed out successfully
- Complete audit trail with timestamps and amounts

## Using Sample Data

### For API Testing
Use the Player IDs printed after seeding to test API endpoints:

```bash
# Example: Get player balance
curl http://localhost:3000/api/wallet/balance/[PLAYER_ID]

# Example: Place bet
curl -X POST http://localhost:3000/api/game/bet \
  -H "Content-Type: application/json" \
  -d '{"playerId":"[PLAYER_ID]","username":"Player1","usdAmount":10,"currency":"bitcoin"}'
```

### For WebSocket Testing
1. Open http://localhost:3000
2. Use any Player ID and corresponding username from the created players
3. Authenticate and start playing

### For Database Inspection
You can inspect the created data directly in MongoDB:

```javascript
// Connect to MongoDB and check collections
use crypto-crash

// View players
db.players.find()

// View game rounds  
db.gamerounds.find()

// View transactions
db.transactions.find()
```

## Script Features

### Simple Seed Script (`scripts/simpleSeed.js`)
- Creates exactly what's requested in assignment: 3-5 players and a few game rounds
- Minimal, focused data creation
- Clear console output showing created data
- Easy to understand and modify

### Full Seed Script (`scripts/seedDatabase.js`)
- Creates more comprehensive test data
- 5 players with detailed statistics
- 10 completed game rounds
- More transaction history
- Includes additional sample scenarios

## Prerequisites

Before running any seed script:

1. **MongoDB Connection**: Ensure MongoDB is accessible via the connection string in `.env`
2. **Dependencies Installed**: Run `npm install` first
3. **Environment Variables**: `.env` file should be properly configured

## Verification

After running the seed script, verify the data was created:

1. **Check Server Health**:
   ```bash
   curl http://localhost:3000/health
   ```

2. **List Players**:
   ```bash
   curl http://localhost:3000/api/auth/players
   ```

3. **Check Game History**:
   ```bash
   curl http://localhost:3000/api/game/history
   ```

## Troubleshooting

### Connection Issues
- Verify MongoDB URI in `.env` file
- Ensure MongoDB service is running
- Check network connectivity for MongoDB Atlas

### Script Errors
- Ensure all dependencies are installed: `npm install`
- Check Node.js version (requires 16+)
- Verify file permissions for script execution

### Data Not Appearing
- Confirm script completed without errors
- Check database connection in script output
- Verify correct database name in connection string

## Customization

To modify the sample data:

1. Edit `scripts/simpleSeed.js`
2. Modify player data in the `createSamplePlayers()` method
3. Adjust game rounds in the `createSampleGameRounds()` method
4. Run the script again to populate with new data

The script automatically clears existing data before creating new sample data to ensure clean state.