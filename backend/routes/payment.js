const express = require('express');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const User = require('../models/User');

const router = express.Router();

// Razorpay instance initialize karein
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

// 1. CREATE RAZORPAY ORDER ROUTE
router.post('/create-order', async (req, res) => {
  try {
    const { amount, userId, credits, planType } = req.body; // amount in INR (jaise ₹99, ₹199, ₹499)

    const options = {
      amount: amount * 100, // Razorpay paise mein leta hai
      currency: "INR",
      receipt: `receipt_${userId}_${Date.now()}`,
      notes: {
        userId: userId,
        credits: credits,
        planType: planType || 'STARTER'
      }
    };

    const order = await razorpay.orders.create(options);
    res.status(200).json({ success: true, order });
  } catch (err) {
    console.error('Razorpay Order Error:', err);
    res.status(500).json({ success: false, message: 'There was an error in creating the payment order', error: err.message });
  }
});

// 2. VERIFY PAYMENT & PUSH TO MULTI-PACK LEDGER ROUTE
router.post('/verify-payment', async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, userId, creditsToAdd, planType, amount } = req.body;

    const body = razorpay_order_id + "|" + razorpay_payment_id;

    // Signature match karke check karein ki payment authentic hai ya nahi
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest('hex');

    const isAuthentic = expectedSignature === razorpay_signature;

    if (isAuthentic) {
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({ success: false, message: 'User not found!' });
      }

      // 🪙 SMART BACKEND PLAN & CREDIT DETERMINATION
      let finalPlan = (planType || '').toUpperCase();
      let finalCredits = Number(creditsToAdd);

      const paidAmount = Number(amount) || 0;

      if (paidAmount === 499 || paidAmount === 49900 || finalPlan === 'ULTIMATE') {
        finalPlan = 'ULTIMATE';
        finalCredits = 15;
      } else if (paidAmount === 199 || paidAmount === 19900 || finalPlan === 'PRO') {
        finalPlan = 'PRO';
        finalCredits = 5;
      } else if (paidAmount === 99 || paidAmount === 9900 || finalPlan === 'STARTER') {
        finalPlan = 'STARTER';
        finalCredits = 2;
      } else {
        finalPlan = finalPlan || 'STARTER';
        finalCredits = finalCredits || 2;
      }

      // 📦 NEW PACK LEDGER ITEM CREATE KAREIN (Fixed Math.random string conversion)
      const uniquePackId = 'pack_' + Date.now + '_' + Math.random().toString(36).substring(2, 7);
      const newPackItem = {
        packId: uniquePackId,
        planType: finalPlan,
        remainingCredits: finalCredits,
        totalCreditsGiven: finalCredits,
        purchasedAt: new Date()
      };

      // 🪙 Initialize activePacks if undefined
      if (!user.activePacks) {
        user.activePacks = [];
      }

      // Push new pack to multi-pack ledger
      user.activePacks.push(newPackItem);

      // Get the newly pushed subdocument reference so we can store its valid Mongoose _id
      const addedPack = user.activePacks[user.activePacks.length - 1];

      // Agar user ka pehle se koi active pack nahi hai, toh is naye pack ko automatically active set kar do
      if (!user.currentActivePackId) {
        user.currentActivePackId = addedPack._id;
      }

      // Backward compatibility ke liye total credits aur highest planType bhi update rakhein
      user.credits = (user.credits || 0) + finalCredits;

      const planHierarchy = { 'FREE': 0, 'STARTER': 1, 'PRO': 2, 'ULTIMATE': 3 };
      const currentPlan = (user.planType || 'FREE').toUpperCase();
      if ((planHierarchy[finalPlan] || 0) > (planHierarchy[currentPlan] || 0)) {
        user.planType = finalPlan;
      }

      await user.save();

      console.log(`✅ Payment Verified! New ${finalPlan} pack (${finalCredits} credits) added to user ${userId} ledger.`);

      res.status(200).json({
        success: true,
        message: 'Payment verified & new pack added to ledger successfully! 🎉',
        credits: user.credits,
        activePacks: user.activePacks,
        currentActivePackId: user.currentActivePackId,
        planType: user.planType
      });
    } else {
      res.status(400).json({ success: false, message: 'Invalid signature, payment verification failed!' });
    }
  } catch (err) {
    console.error('Payment Verification Error:', err);
    res.status(500).json({ success: false, message: 'Server error during verification', error: err.message });
  }
});

module.exports = router;