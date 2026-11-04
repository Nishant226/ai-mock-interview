const mongoose = require('mongoose');

const packSchema = new mongoose.Schema({
  packId: { type: String, required: true }, // Unique pack order/payment ID
  planType: { type: String, enum: ['STARTER', 'PRO', 'ULTIMATE'], required: true },
  remainingCredits: { type: Number, required: true },
  totalCreditsGiven: { type: Number, required: true },
  purchasedAt: { type: Date, default: Date.now }
});

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, trim: true },
  email:    { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true },
  
  // 🪙 Multi-Pack Ledger System (Har ek purchase ka alag ledger record)
  activePacks: [packSchema],
  
  // User dwara profile se active kiya gaya current pack ka ID
  currentActivePackId: { type: String, default: null },

  // Backward compatibility ke liye total remaining credits & general plan type
  credits: { 
    type: Number, 
    default: 1 
  },
  planType: { 
    type: String, 
    enum: ['FREE', 'STARTER', 'PRO', 'ULTIMATE'], 
    default: 'FREE' 
  },

  resetPasswordToken: { type: String },
  resetPasswordExpires: { type: Date }
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);