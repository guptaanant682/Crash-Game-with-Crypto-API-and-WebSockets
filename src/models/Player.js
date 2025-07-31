const mongoose = require('mongoose');

const walletSchema = new mongoose.Schema({
  bitcoin: {
    type: Number,
    default: 0,
    min: 0
  },
  ethereum: {
    type: Number,
    default: 0,
    min: 0
  }
}, { _id: false });

const playerSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    minlength: 3,
    maxlength: 20
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  wallet: {
    type: walletSchema,
    default: () => ({ bitcoin: 0.001, ethereum: 0.01 })  // Default starter amounts
  },
  totalDeposited: {
    type: Number,
    default: 0,
    min: 0
  },
  totalWithdrawn: {
    type: Number,
    default: 0,
    min: 0
  },
  gamesPlayed: {
    type: Number,
    default: 0,
    min: 0
  },
  totalWon: {
    type: Number,
    default: 0,
    min: 0
  },
  totalLost: {
    type: Number,
    default: 0,
    min: 0
  },
  biggestWin: {
    type: Number,
    default: 0,
    min: 0
  },
  biggestLoss: {
    type: Number,
    default: 0,
    min: 0
  },
  currentStreak: {
    type: Number,
    default: 0
  },
  bestStreak: {
    type: Number,
    default: 0
  },
  lastPlayedAt: {
    type: Date,
    default: null
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for profit/loss calculation
playerSchema.virtual('netProfit').get(function() {
  return this.totalWon - this.totalLost;
});

// Virtual for win rate
playerSchema.virtual('winRate').get(function() {
  if (this.gamesPlayed === 0) return 0;
  return ((this.totalWon / (this.totalWon + this.totalLost)) * 100).toFixed(2);
});

// Index for faster queries
playerSchema.index({ username: 1 });
playerSchema.index({ email: 1 });
playerSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Player', playerSchema);