const mongoose = require('mongoose');

const playerBetSchema = new mongoose.Schema({
  playerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Player',
    required: true
  },
  username: {
    type: String,
    required: true
  },
  usdAmount: {
    type: Number,
    required: true,
    min: 0.01
  },
  cryptoAmount: {
    type: Number,
    required: true,
    min: 0
  },
  currency: {
    type: String,
    required: true,
    enum: ['bitcoin', 'ethereum']
  },
  priceAtBet: {
    type: Number,
    required: true,
    min: 0
  },
  cashedOut: {
    type: Boolean,
    default: false
  },
  cashoutMultiplier: {
    type: Number,
    default: null,
    min: 1
  },
  cashoutAmount: {
    type: Number,
    default: null,
    min: 0
  },
  cashoutTime: {
    type: Date,
    default: null
  },
  profit: {
    type: Number,
    default: 0
  }
}, { _id: false });

const gameRoundSchema = new mongoose.Schema({
  roundId: {
    type: Number,
    required: true,
    unique: true
  },
  seed: {
    type: String,
    required: true
  },
  hash: {
    type: String,
    required: true
  },
  crashPoint: {
    type: Number,
    required: true,
    min: 1.01,
    max: 120
  },
  startTime: {
    type: Date,
    required: true
  },
  endTime: {
    type: Date,
    default: null
  },
  duration: {
    type: Number,
    default: null  // in milliseconds
  },
  status: {
    type: String,
    enum: ['waiting', 'running', 'crashed', 'completed'],
    default: 'waiting'
  },
  playerBets: [playerBetSchema],
  totalBetAmount: {
    type: Number,
    default: 0,
    min: 0
  },
  totalCashoutAmount: {
    type: Number,
    default: 0,
    min: 0
  },
  playersCount: {
    type: Number,
    default: 0,
    min: 0
  },
  cashoutCount: {
    type: Number,
    default: 0,
    min: 0
  },
  multiplierHistory: [{
    time: Number,
    multiplier: Number
  }]
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for house edge calculation
gameRoundSchema.virtual('houseEdge').get(function() {
  if (this.totalBetAmount === 0) return 0;
  const houseTake = this.totalBetAmount - this.totalCashoutAmount;
  return ((houseTake / this.totalBetAmount) * 100).toFixed(2);
});

// Index for faster queries
gameRoundSchema.index({ roundId: 1 });
gameRoundSchema.index({ startTime: -1 });
gameRoundSchema.index({ status: 1 });
gameRoundSchema.index({ 'playerBets.playerId': 1 });

// Static method to get next round ID
gameRoundSchema.statics.getNextRoundId = async function() {
  const lastRound = await this.findOne().sort({ roundId: -1 });
  return lastRound ? lastRound.roundId + 1 : 1;
};

module.exports = mongoose.model('GameRound', gameRoundSchema);