const mongoose = require('mongoose');
const path = require('path');

// Import environment config
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// Import models
const Player = require('../src/models/Player');
const GameRound = require('../src/models/GameRound');
const Transaction = require('../src/models/Transaction');

// Import services
const cryptoAPI = require('../src/services/cryptoAPI');
const provablyFair = require('../src/services/provablyFair');

class DatabaseSeeder {
  constructor() {
    this.samplePlayers = [];
    this.sampleRounds = [];
    this.sampleTransactions = [];
  }

  /**
   * Connect to database
   */
  async connect() {
    try {
      await mongoose.connect(process.env.MONGODB_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
      });
      console.log('✅ Connected to MongoDB');
    } catch (error) {
      console.error('❌ Database connection failed:', error);
      process.exit(1);
    }
  }

  /**
   * Disconnect from database
   */
  async disconnect() {
    try {
      await mongoose.connection.close();
      console.log('🔌 Disconnected from MongoDB');
    } catch (error) {
      console.error('❌ Error disconnecting:', error);
    }
  }

  /**
   * Clear existing data
   */
  async clearData() {
    try {
      console.log('🗑️ Clearing existing data...');
      
      await Transaction.deleteMany({});
      await GameRound.deleteMany({});
      await Player.deleteMany({});
      
      console.log('✅ Existing data cleared');
    } catch (error) {
      console.error('❌ Error clearing data:', error);
      throw error;
    }
  }

  /**
   * Create sample players
   */
  async createSamplePlayers() {
    try {
      console.log('👥 Creating sample players...');

      const playerData = [
        {
          username: 'CryptoKing',
          email: 'cryptoking@example.com',
          wallet: { bitcoin: 0.05, ethereum: 0.5 },
          totalDeposited: 2500,
          gamesPlayed: 45,
          totalWon: 1800,
          totalLost: 1200
        },
        {
          username: 'MoonTrader',
          email: 'moontrader@example.com',
          wallet: { bitcoin: 0.02, ethereum: 0.3 },
          totalDeposited: 1500,
          gamesPlayed: 32,
          totalWon: 900,
          totalLost: 800
        },
        {
          username: 'DiamondHands',
          email: 'diamondhands@example.com',
          wallet: { bitcoin: 0.08, ethereum: 0.7 },
          totalDeposited: 3200,
          gamesPlayed: 67,
          totalWon: 2100,
          totalLost: 1850
        },
        {
          username: 'HODLer',
          email: 'hodler@example.com',
          wallet: { bitcoin: 0.01, ethereum: 0.15 },
          totalDeposited: 800,
          gamesPlayed: 18,
          totalWon: 450,
          totalLost: 520
        },
        {
          username: 'RocketMan',
          email: 'rocketman@example.com',
          wallet: { bitcoin: 0.03, ethereum: 0.25 },
          totalDeposited: 1200,
          gamesPlayed: 28,
          totalWon: 680,
          totalLost: 750
        }
      ];

      for (const data of playerData) {
        const player = new Player(data);
        await player.save();
        this.samplePlayers.push(player);
        console.log(`  ✓ Created player: ${player.username}`);
      }

      console.log(`✅ Created ${this.samplePlayers.length} sample players`);
    } catch (error) {
      console.error('❌ Error creating sample players:', error);
      throw error;
    }
  }

  /**
   * Create sample game rounds
   */
  async createSampleRounds() {
    try {
      console.log('🎮 Creating sample game rounds...');

      // Get crypto prices for calculations
      const prices = await cryptoAPI.getCurrentPrices();
      const btcPrice = prices.bitcoin.usd;
      const ethPrice = prices.ethereum.usd;

      // Create 10 completed rounds
      for (let i = 1; i <= 10; i++) {
        const seedPair = provablyFair.generateSeedPair();
        const crashData = provablyFair.calculateCrashPoint(seedPair.seed, i);
        
        const startTime = new Date(Date.now() - (11 - i) * 60000); // 1 minute intervals
        const duration = Math.floor(Math.random() * 30000) + 5000; // 5-35 seconds
        
        const round = new GameRound({
          roundId: i,
          seed: seedPair.seed,
          hash: seedPair.hash,
          crashPoint: crashData.crashPoint,
          startTime,
          endTime: new Date(startTime.getTime() + duration),
          duration,
          status: 'completed',
          playerBets: [],
          totalBetAmount: 0,
          totalCashoutAmount: 0,
          playersCount: 0,
          cashoutCount: 0,
          multiplierHistory: this.generateMultiplierHistory(duration)
        });

        // Add random player bets to this round
        const numberOfBets = Math.floor(Math.random() * 4) + 1; // 1-4 bets per round
        const playersInRound = this.getRandomPlayers(numberOfBets);

        for (const player of playersInRound) {
          const usdAmount = Math.floor(Math.random() * 100) + 10; // $10-$110
          const currency = Math.random() > 0.5 ? 'bitcoin' : 'ethereum';
          const price = currency === 'bitcoin' ? btcPrice : ethPrice;
          const cryptoAmount = usdAmount / price;
          
          // Determine if player cashed out (70% chance if multiplier allows)
          const maxPossibleMultiplier = crashData.crashPoint - 0.1;
          const cashedOut = Math.random() < 0.7 && maxPossibleMultiplier >= 1.2;
          
          let cashoutMultiplier = null;
          let cashoutAmount = null;
          let profit = -usdAmount; // Default to loss

          if (cashedOut) {
            cashoutMultiplier = Math.random() * (maxPossibleMultiplier - 1.1) + 1.1;
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

          // Create transaction record
          const transaction = new Transaction({
            playerId: player._id,
            roundId: i,
            type: 'bet',
            usdAmount,
            cryptoAmount,
            currency,
            priceAtTime: price,
            status: 'confirmed',
            metadata: {
              crashPoint: crashData.crashPoint,
              cashedOut,
              multiplier: cashoutMultiplier,
              profit
            }
          });

          await transaction.save();
          this.sampleTransactions.push(transaction);

          // Create cashout transaction if applicable
          if (cashedOut) {
            const cashoutTransaction = new Transaction({
              playerId: player._id,
              roundId: i,
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
            this.sampleTransactions.push(cashoutTransaction);
          }
        }

        await round.save();
        this.sampleRounds.push(round);
        
        console.log(`  ✓ Round ${i}: ${crashData.crashPoint}x crash, ${playersInRound.length} players, ${round.cashoutCount} cashed out`);
      }

      console.log(`✅ Created ${this.sampleRounds.length} sample rounds`);
    } catch (error) {
      console.error('❌ Error creating sample rounds:', error);
      throw error;
    }
  }

  /**
   * Generate multiplier history for a round
   */
  generateMultiplierHistory(duration) {
    const history = [];
    const growthFactor = 0.04; // Same as config
    
    for (let time = 0; time <= duration; time += 500) { // Every 500ms
      const seconds = time / 1000;
      // Use the same exponential formula as in provablyFair.js
      const multiplier = Math.pow(Math.E, seconds * growthFactor);
      history.push({
        time,
        multiplier: Math.max(1.00, Math.round(multiplier * 100) / 100)
      });
    }
    
    return history;
  }

  /**
   * Get random players for a round
   */
  getRandomPlayers(count) {
    const shuffled = [...this.samplePlayers].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, count);
  }

  /**
   * Create sample transactions
   */
  async createSampleTransactions() {
    try {
      console.log('💰 Creating additional sample transactions...');

      // Create some deposit transactions
      for (const player of this.samplePlayers) {
        const numDeposits = Math.floor(Math.random() * 3) + 1; // 1-3 deposits per player
        
        for (let i = 0; i < numDeposits; i++) {
          const usdAmount = Math.floor(Math.random() * 500) + 50; // $50-$550
          const currency = Math.random() > 0.5 ? 'bitcoin' : 'ethereum';
          const price = currency === 'bitcoin' ? 45000 : 3000; // Mock historical prices
          const cryptoAmount = usdAmount / price;

          const transaction = new Transaction({
            playerId: player._id,
            roundId: 0, // No round for deposits
            type: 'deposit',
            usdAmount,
            cryptoAmount,
            currency,
            priceAtTime: price,
            status: 'confirmed'
          });

          await transaction.save();
          this.sampleTransactions.push(transaction);
        }
      }

      console.log(`✅ Created additional transactions (Total: ${this.sampleTransactions.length})`);
    } catch (error) {
      console.error('❌ Error creating sample transactions:', error);
      throw error;
    }
  }

  /**
   * Display seeding summary
   */
  displaySummary() {
    console.log('\n📊 Database Seeding Summary:');
    console.log('===============================');
    console.log(`👥 Players: ${this.samplePlayers.length}`);
    console.log(`🎮 Game Rounds: ${this.sampleRounds.length}`);
    console.log(`💰 Transactions: ${this.sampleTransactions.length}`);
    
    console.log('\n👥 Sample Players:');
    this.samplePlayers.forEach(player => {
      console.log(`  • ${player.username} (${player.email})`);
      console.log(`    BTC: ${player.wallet.bitcoin}, ETH: ${player.wallet.ethereum}`);
      console.log(`    Games: ${player.gamesPlayed}, W/L: $${player.totalWon}/$${player.totalLost}`);
    });

    console.log('\n🎮 Sample Rounds:');
    this.sampleRounds.slice(-5).forEach(round => {
      console.log(`  • Round ${round.roundId}: ${round.crashPoint}x crash`);
      console.log(`    Players: ${round.playersCount}, Cashed out: ${round.cashoutCount}`);
      console.log(`    Total bet: $${round.totalBetAmount}, Total payout: $${round.totalCashoutAmount.toFixed(2)}`);
    });

    console.log('\n📝 Usage Instructions:');
    console.log('======================');
    console.log('1. Start the server: npm start');
    console.log('2. Open http://localhost:3000 for WebSocket test client');
    console.log('3. Use any of these sample players to test:');
    this.samplePlayers.forEach(player => {
      console.log(`   - ID: ${player._id}, Username: ${player.username}`);
    });
    console.log('4. API endpoints are available at http://localhost:3000/api');
    console.log('5. Check /health endpoint for server status');
    
    console.log('\n✅ Database seeding completed successfully!');
  }

  /**
   * Run the complete seeding process
   */
  async run() {
    try {
      console.log('🌱 Starting database seeding...\n');
      
      await this.connect();
      await this.clearData();
      await this.createSamplePlayers();
      await this.createSampleRounds();
      await this.createSampleTransactions();
      
      this.displaySummary();
      
    } catch (error) {
      console.error('❌ Seeding failed:', error);
      process.exit(1);
    } finally {
      await this.disconnect();
    }
  }
}

// Run seeding if this file is executed directly
if (require.main === module) {
  const seeder = new DatabaseSeeder();
  seeder.run().catch(error => {
    console.error('❌ Seeding script failed:', error);
    process.exit(1);
  });
}

module.exports = DatabaseSeeder;