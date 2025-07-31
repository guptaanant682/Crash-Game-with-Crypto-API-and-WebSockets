const mongoose = require('mongoose');
const path = require('path');

// Import environment config
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// Import models
const Player = require('../src/models/Player');
const GameRound = require('../src/models/GameRound');
const Transaction = require('../src/models/Transaction');

// Import services for data generation
const provablyFair = require('../src/services/provablyFair');

/**
 * Simple database seeding script
 * Creates 5 players and 3 game rounds as requested in assignment
 */
class SimpleDatabaseSeeder {
  
  async connect() {
    try {
      await mongoose.connect(process.env.MONGODB_URI);
      console.log('Connected to MongoDB');
    } catch (error) {
      console.error('Database connection failed:', error.message);
      process.exit(1);
    }
  }

  async disconnect() {
    try {
      await mongoose.connection.close();
      console.log('Disconnected from MongoDB');
    } catch (error) {
      console.error('Error disconnecting:', error.message);
    }
  }

  async clearExistingData() {
    console.log('Clearing existing data...');
    await Transaction.deleteMany({});
    await GameRound.deleteMany({});
    await Player.deleteMany({});
    console.log('Existing data cleared');
  }

  async createSamplePlayers() {
    console.log('Creating sample players...');
    
    const players = [
      {
        username: 'Player1',
        email: 'player1@example.com',
        wallet: { bitcoin: 0.01, ethereum: 0.1 },
        totalDeposited: 500,
        gamesPlayed: 10,
        totalWon: 300,
        totalLost: 200
      },
      {
        username: 'Player2', 
        email: 'player2@example.com',
        wallet: { bitcoin: 0.005, ethereum: 0.05 },
        totalDeposited: 250,
        gamesPlayed: 5,
        totalWon: 150,
        totalLost: 100
      },
      {
        username: 'Player3',
        email: 'player3@example.com', 
        wallet: { bitcoin: 0.02, ethereum: 0.2 },
        totalDeposited: 1000,
        gamesPlayed: 20,
        totalWon: 600,
        totalLost: 400
      },
      {
        username: 'Player4',
        email: 'player4@example.com',
        wallet: { bitcoin: 0.008, ethereum: 0.08 },
        totalDeposited: 400,
        gamesPlayed: 8,
        totalWon: 240,
        totalLost: 160
      },
      {
        username: 'Player5',
        email: 'player5@example.com',
        wallet: { bitcoin: 0.015, ethereum: 0.15 },
        totalDeposited: 750,
        gamesPlayed: 15,
        totalWon: 450,
        totalLost: 300
      }
    ];

    const createdPlayers = [];
    for (const playerData of players) {
      const player = new Player(playerData);
      await player.save();
      createdPlayers.push(player);
      console.log(`Created player: ${player.username} (ID: ${player._id})`);
    }

    return createdPlayers;
  }

  async createSampleGameRounds(players) {
    console.log('Creating sample game rounds...');
    
    const rounds = [];
    
    // Round 1: Crashed at 2.5x
    const round1 = await this.createGameRound(1, 2.5, players.slice(0, 3));
    rounds.push(round1);
    
    // Round 2: Crashed at 1.2x (early crash)
    const round2 = await this.createGameRound(2, 1.2, players.slice(1, 4));
    rounds.push(round2);
    
    // Round 3: Crashed at 5.8x (high multiplier)
    const round3 = await this.createGameRound(3, 5.8, players.slice(2, 5));
    rounds.push(round3);

    return rounds;
  }

  async createGameRound(roundId, crashPoint, players) {
    const seedPair = provablyFair.generateSeedPair();
    const startTime = new Date(Date.now() - (60000 * (4 - roundId))); // Stagger round times
    const duration = Math.floor(Math.random() * 30000) + 10000; // 10-40 seconds
    
    const round = new GameRound({
      roundId,
      seed: seedPair.seed,
      hash: seedPair.hash,
      crashPoint,
      startTime,
      endTime: new Date(startTime.getTime() + duration),
      duration,
      status: 'completed',
      playerBets: [],
      totalBetAmount: 0,
      totalCashoutAmount: 0,
      playersCount: 0,
      cashoutCount: 0
    });

    // Add player bets to the round
    for (const player of players) {
      const usdAmount = Math.floor(Math.random() * 50) + 10; // $10-$60 bet
      const currency = Math.random() > 0.5 ? 'bitcoin' : 'ethereum';
      const price = currency === 'bitcoin' ? 50000 : 3000; // Mock prices
      const cryptoAmount = usdAmount / price;
      
      // Determine if player cashed out (60% chance if multiplier allows)
      const cashedOut = Math.random() < 0.6 && crashPoint >= 1.5;
      let cashoutMultiplier = null;
      let cashoutAmount = null;
      let profit = -usdAmount;

      if (cashedOut) {
        cashoutMultiplier = Math.random() * (crashPoint - 0.1) + 1.1;
        cashoutMultiplier = Math.round(cashoutMultiplier * 100) / 100;
        cashoutAmount = cryptoAmount * cashoutMultiplier;
        profit = (usdAmount * cashoutMultiplier) - usdAmount;
        round.totalCashoutAmount += usdAmount * cashoutMultiplier;
        round.cashoutCount++;
      }

      const playerBet = {
        playerId: player._id,
        username: player.username,
        usdAmount,
        cryptoAmount,
        currency,
        priceAtBet: price,
        cashedOut,
        cashoutMultiplier,
        cashoutAmount,
        cashoutTime: cashedOut ? new Date(startTime.getTime() + Math.random() * duration) : null,
        profit
      };

      round.playerBets.push(playerBet);
      round.totalBetAmount += usdAmount;
      round.playersCount++;

      // Create transaction records
      const betTransaction = new Transaction({
        playerId: player._id,
        roundId,
        type: 'bet',
        usdAmount,
        cryptoAmount,
        currency,
        priceAtTime: price,
        status: 'confirmed'
      });
      await betTransaction.save();

      if (cashedOut) {
        const cashoutTransaction = new Transaction({
          playerId: player._id,
          roundId,
          type: 'cashout', 
          usdAmount: usdAmount * cashoutMultiplier,
          cryptoAmount: cashoutAmount,
          currency,
          priceAtTime: price,
          status: 'confirmed',
          metadata: {
            multiplier: cashoutMultiplier,
            profit: profit
          }
        });
        await cashoutTransaction.save();
      }
    }

    await round.save();
    console.log(`Created Round ${roundId}: ${crashPoint}x crash, ${players.length} players, ${round.cashoutCount} cashed out`);
    
    return round;
  }

  async run() {
    try {
      console.log('Starting simple database seeding...');
      console.log('');
      
      await this.connect();
      await this.clearExistingData();
      
      const players = await this.createSamplePlayers();
      console.log('');
      
      const rounds = await this.createSampleGameRounds(players);
      console.log('');
      
      console.log('Database seeding completed successfully!');
      console.log('');
      console.log('Sample Players Created:');
      players.forEach(player => {
        console.log(`- ${player.username} (ID: ${player._id})`);
        console.log(`  Email: ${player.email}`);
        console.log(`  Wallet: ${player.wallet.bitcoin} BTC, ${player.wallet.ethereum} ETH`);
      });
      
      console.log('');
      console.log('Sample Rounds Created:');
      rounds.forEach(round => {
        console.log(`- Round ${round.roundId}: Crashed at ${round.crashPoint}x`);
        console.log(`  Players: ${round.playersCount}, Cashed out: ${round.cashoutCount}`);
        console.log(`  Total bets: $${round.totalBetAmount}, Total payouts: $${round.totalCashoutAmount.toFixed(2)}`);
      });
      
      console.log('');
      console.log('You can now start the server with: npm start');
      console.log('Test the WebSocket client at: http://localhost:3000');
      
    } catch (error) {
      console.error('Seeding failed:', error.message);
      process.exit(1);
    } finally {
      await this.disconnect();
    }
  }
}

// Run seeding if this file is executed directly
if (require.main === module) {
  const seeder = new SimpleDatabaseSeeder();
  seeder.run().catch(error => {
    console.error('Simple seeding script failed:', error.message);
    process.exit(1);
  });
}

module.exports = SimpleDatabaseSeeder;