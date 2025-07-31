const mongoose = require('mongoose');
const crypto = require('crypto');

const transactionSchema = new mongoose.Schema({
  playerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Player',
    required: true
  },
  roundId: {
    type: Number,
    required: true
  },
  transactionHash: {
    type: String,
    unique: true
  },
  type: {
    type: String,
    required: true,
    enum: ['bet', 'cashout', 'deposit', 'withdrawal']
  },
  usdAmount: {
    type: Number,
    required: true,
    min: 0
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
  priceAtTime: {
    type: Number,
    required: true,
    min: 0
  },
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'failed'],
    default: 'pending'
  },
  blockNumber: {
    type: Number,
    default: null
  },
  gasUsed: {
    type: Number,
    default: null
  },
  gasFee: {
    type: Number,
    default: null
  },
  confirmations: {
    type: Number,
    default: 0,
    min: 0
  },
  metadata: {
    multiplier: Number,
    crashPoint: Number,
    cashedOutAt: Number,
    profit: Number
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for transaction age
transactionSchema.virtual('age').get(function() {
  return Date.now() - this.createdAt.getTime();
});

// Pre-save middleware to generate transaction hash
transactionSchema.pre('save', function(next) {
  if (!this.transactionHash) {
    const data = `${this.playerId}${this.type}${this.cryptoAmount}${this.currency}${Date.now()}`;
    this.transactionHash = crypto.createHash('sha256').update(data).digest('hex');
  }
  
  // Simulate blockchain data
  if (this.isNew) {
    this.blockNumber = Math.floor(Math.random() * 1000000) + 18000000;
    this.gasUsed = Math.floor(Math.random() * 100000) + 21000;
    this.gasFee = parseFloat((Math.random() * 0.01 + 0.001).toFixed(8));
    this.confirmations = Math.floor(Math.random() * 12) + 1;
    this.status = 'confirmed';
  }
  
  next();
});

// Index for faster queries
transactionSchema.index({ playerId: 1 });
transactionSchema.index({ roundId: 1 });
transactionSchema.index({ type: 1 });
transactionSchema.index({ currency: 1 });
transactionSchema.index({ createdAt: -1 });
transactionSchema.index({ transactionHash: 1 });

// Static method to create transaction
transactionSchema.statics.createTransaction = async function(data) {
  const transaction = new this(data);
  await transaction.save();
  return transaction;
};

module.exports = mongoose.model('Transaction', transactionSchema);