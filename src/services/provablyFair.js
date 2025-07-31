const crypto = require('crypto');
const config = require('../config/environment');

class ProvablyFairService {
  constructor() {
    this.currentSeed = null;
    this.seedHistory = [];
  }

  /**
   * Generate a cryptographically secure random seed
   * @returns {string} Random seed (64 character hex string)
   */
  generateSeed() {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Generate SHA-256 hash of given input
   * @param {string} input - Input to hash
   * @returns {string} SHA-256 hash
   */
  generateHash(input) {
    return crypto.createHash('sha256').update(input).digest('hex');
  }

  /**
   * Generate seed and hash pair for a new round
   * @returns {Object} Seed and hash data
   */
  generateSeedPair() {
    const seed = this.generateSeed();
    const hash = this.generateHash(seed);
    
    const seedPair = {
      seed,
      hash,
      timestamp: Date.now()
    };

    // Store current seed for verification
    this.currentSeed = seedPair;
    
    return seedPair;
  }

  /**
   * Calculate crash point using provably fair algorithm
   * @param {string} seed - Random seed
   * @param {number} roundId - Round identifier
   * @returns {Object} Crash calculation result
   */
  calculateCrashPoint(seed, roundId) {
    try {
      // Create deterministic input from seed and round ID
      const input = `${seed}:${roundId}`;
      const hash = this.generateHash(input);
      
      // Convert first 8 characters of hash to integer
      const hexValue = hash.substring(0, 8);
      const intValue = parseInt(hexValue, 16);
      
      // Calculate crash point using modulo operation
      // Using 10000000 as max to get good distribution of crash points
      const normalized = intValue / 0xFFFFFFFF; // Normalize to 0-1
      
      // Exponential distribution for crash points
      // This creates more frequent low crashes and rare high crashes
      const exponentialRate = 0.04; // Controls the distribution curve
      const crashMultiplier = Math.max(
        config.MIN_CRASH_MULTIPLIER,
        Math.min(
          config.MAX_CRASH_MULTIPLIER,
          1 + (-Math.log(1 - normalized) / exponentialRate)
        )
      );

      // Round to 2 decimal places
      const crashPoint = Math.round(crashMultiplier * 100) / 100;

      return {
        crashPoint,
        seed,
        roundId,
        hash,
        hexValue,
        intValue,
        normalized,
        algorithm: 'exponential_distribution',
        timestamp: Date.now()
      };
    } catch (error) {
      console.error('❌ Crash point calculation error:', error);
      // Fallback to safe crash point
      return {
        crashPoint: 2.00,
        seed,
        roundId,
        hash: this.generateHash(`${seed}:${roundId}`),
        error: error.message,
        timestamp: Date.now()
      };
    }
  }

  /**
   * Verify crash point calculation
   * @param {string} seed - Original seed
   * @param {number} roundId - Round identifier
   * @param {number} claimedCrashPoint - Claimed crash point
   * @returns {Object} Verification result
   */
  verifyCrashPoint(seed, roundId, claimedCrashPoint) {
    const calculation = this.calculateCrashPoint(seed, roundId);
    const isValid = Math.abs(calculation.crashPoint - claimedCrashPoint) < 0.01;
    
    return {
      isValid,
      calculatedCrashPoint: calculation.crashPoint,
      claimedCrashPoint,
      seed,
      roundId,
      hash: calculation.hash,
      verification: {
        seedMatch: calculation.seed === seed,
        roundMatch: calculation.roundId === roundId,
        crashPointMatch: isValid
      },
      timestamp: Date.now()
    };
  }

  /**
   * Generate next seed while keeping current one secret
   * @returns {Object} Next round preparation
   */
  prepareNextRound() {
    const nextSeed = this.generateSeed();
    const nextHash = this.generateHash(nextSeed);
    
    return {
      nextSeed,
      nextHash,
      currentSeedRevealed: this.currentSeed?.seed || null,
      timestamp: Date.now()
    };
  }

  /**
   * Calculate multiplier at given time
   * @param {number} startTime - Round start timestamp
   * @param {number} currentTime - Current timestamp
   * @returns {number} Current multiplier
   */
  calculateMultiplier(startTime, currentTime = Date.now()) {
    const elapsed = Math.max(0, currentTime - startTime);
    const seconds = elapsed / 1000;
    
    // Exponential growth formula: multiplier = e^(seconds * growth_factor)
    // This creates a more realistic exponential curve
    const multiplier = Math.pow(Math.E, seconds * config.GROWTH_FACTOR);
    
    return Math.max(1.00, Math.round(multiplier * 100) / 100);
  }

  /**
   * Calculate time when multiplier reaches crash point
   * @param {number} startTime - Round start timestamp
   * @param {number} crashPoint - Target crash point
   * @returns {number} Crash timestamp
   */
  calculateCrashTime(startTime, crashPoint) {
    // Reverse calculation for exponential: time = ln(crashPoint) / growth_factor
    const secondsToCrash = Math.log(crashPoint) / config.GROWTH_FACTOR;
    return startTime + (secondsToCrash * 1000);
  }

  /**
   * Generate proof of fairness for a round
   * @param {string} seed - Round seed
   * @param {number} roundId - Round ID
   * @param {number} crashPoint - Actual crash point
   * @returns {Object} Fairness proof
   */
  generateFairnessProof(seed, roundId, crashPoint) {
    const calculation = this.calculateCrashPoint(seed, roundId);
    const verification = this.verifyCrashPoint(seed, roundId, crashPoint);
    
    return {
      seed,
      hash: this.generateHash(seed),
      roundId,
      crashPoint,
      calculation: {
        algorithm: 'SHA-256 + Exponential Distribution',
        input: `${seed}:${roundId}`,
        steps: [
          `1. Hash input "${seed}:${roundId}" with SHA-256`,
          `2. Take first 8 hex chars: ${calculation.hexValue}`,
          `3. Convert to integer: ${calculation.intValue}`,
          `4. Normalize to 0-1: ${calculation.normalized.toFixed(8)}`,
          `5. Apply exponential distribution`,
          `6. Result: ${calculation.crashPoint}x`
        ]
      },
      verification,
      isValid: verification.isValid,
      proof: `hash(${seed}:${roundId}) = ${calculation.hash}`,
      timestamp: Date.now()
    };
  }

  /**
   * Get statistics about crash point distribution
   * @param {Array} rounds - Array of completed rounds
   * @returns {Object} Distribution statistics
   */
  getCrashStatistics(rounds) {
    if (!rounds || rounds.length === 0) {
      return { error: 'No rounds provided' };
    }

    const crashPoints = rounds.map(r => r.crashPoint).filter(cp => cp);
    
    if (crashPoints.length === 0) {
      return { error: 'No valid crash points found' };
    }

    const sorted = crashPoints.sort((a, b) => a - b);
    const sum = crashPoints.reduce((a, b) => a + b, 0);
    
    return {
      totalRounds: crashPoints.length,
      average: (sum / crashPoints.length).toFixed(2),
      median: sorted[Math.floor(sorted.length / 2)].toFixed(2),
      min: Math.min(...crashPoints).toFixed(2),
      max: Math.max(...crashPoints).toFixed(2),
      distribution: {
        under2x: crashPoints.filter(cp => cp < 2).length,
        '2x-5x': crashPoints.filter(cp => cp >= 2 && cp < 5).length,
        '5x-10x': crashPoints.filter(cp => cp >= 5 && cp < 10).length,
        'over10x': crashPoints.filter(cp => cp >= 10).length
      },
      fairnessScore: this.calculateFairnessScore(crashPoints)
    };
  }

  /**
   * Calculate fairness score based on expected distribution
   * @param {Array} crashPoints - Array of crash points
   * @returns {number} Fairness score (0-100)
   */
  calculateFairnessScore(crashPoints) {
    if (crashPoints.length < 100) return 'N/A (need 100+ rounds)';
    
    const total = crashPoints.length;
    const actual = {
      under2x: crashPoints.filter(cp => cp < 2).length / total,
      '2x-5x': crashPoints.filter(cp => cp >= 2 && cp < 5).length / total,
      '5x-10x': crashPoints.filter(cp => cp >= 5 && cp < 10).length / total,
      'over10x': crashPoints.filter(cp => cp >= 10).length / total
    };

    // Expected distribution for exponential with rate 0.04
    const expected = {
      under2x: 0.63,
      '2x-5x': 0.30,
      '5x-10x': 0.06,
      'over10x': 0.01
    };

    // Chi-square test approximation
    let chiSquare = 0;
    Object.keys(expected).forEach(range => {
      const expectedCount = expected[range] * total;
      const actualCount = actual[range] * total;
      chiSquare += Math.pow(actualCount - expectedCount, 2) / expectedCount;
    });

    // Convert to percentage (lower chi-square = higher fairness)
    const fairnessScore = Math.max(0, 100 - (chiSquare * 10));
    return Math.round(fairnessScore);
  }

  /**
   * Store seed in history for later verification
   * @param {Object} seedData - Seed data to store
   */
  storeSeedHistory(seedData) {
    this.seedHistory.push({
      ...seedData,
      storedAt: Date.now()
    });

    // Keep only last 1000 seeds
    if (this.seedHistory.length > 1000) {
      this.seedHistory = this.seedHistory.slice(-1000);
    }
  }

  /**
   * Get seed history for transparency
   * @param {number} limit - Number of recent seeds to return
   * @returns {Array} Seed history
   */
  getSeedHistory(limit = 50) {
    return this.seedHistory
      .slice(-limit)
      .map(seed => ({
        hash: seed.hash,
        roundId: seed.roundId,
        crashPoint: seed.crashPoint,
        timestamp: seed.timestamp,
        // Don't reveal seed until round is complete
        seed: seed.revealed ? seed.seed : 'hidden'
      }));
  }
}

module.exports = new ProvablyFairService();