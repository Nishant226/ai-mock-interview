const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');

const router = express.Router();

// Secret key for JWT
const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_jwt_key_ai_mock';

// Nodemailer Transporter Configuration
const nodemailer = require('nodemailer');
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// 1. REGISTER ROUTE (Sign-up)
router.post('/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;

    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists with this email or username!' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newUser = new User({
      username,
      email,
      password: hashedPassword,
      activePacks: []
    });

    await newUser.save();
    res.status(201).json({ message: 'User registered successfully! 🎉' });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// 2. LOGIN ROUTE (Supports both Email or Username)
router.post('/login', async (req, res) => {
  try {
    const { identifier, password } = req.body;

    const user = await User.findOne({
      $or: [{ email: identifier }, { username: identifier }]
    });

    if (!user) {
      return res.status(400).json({ message: 'Invalid email/username or password!' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid email/username or password!' });
    }

    const token = jwt.sign({ id: user._id, email: user.email }, JWT_SECRET, { expiresIn: '1d' });

    res.status(200).json({
      message: 'Login successful!',
      token,
      user: { 
        id: user._id, 
        username: user.username, 
        email: user.email,
        credits: user.credits,
        planType: user.planType || 'FREE',
        activePacks: user.activePacks || [],         // 🪙 Multi-Pack Ledger Support
        currentActivePackId: user.currentActivePackId // 🪙 Active Pack Pointer
      }
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// 3. SOCIAL LOGIN ROUTE (Google Sign-In)
router.post('/social-login', async (req, res) => {
  try {
    const { email, username, googleId } = req.body;

    let user = await User.findOne({ email });

    if (!user) {
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(googleId + Math.random(), salt);

      user = new User({
        username: username || email.split('@')[0],
        email,
        password: hashedPassword,
        activePacks: []
      });

      await user.save();
    }

    const token = jwt.sign({ id: user._id, email: user.email }, JWT_SECRET, { expiresIn: '1d' });

    res.status(200).json({
      message: 'Google login successful!',
      token,
      user: { 
        id: user._id, 
        username: user.username, 
        email: user.email,
        credits: user.credits,
        planType: user.planType || 'FREE',
        activePacks: user.activePacks || [],
        currentActivePackId: user.currentActivePackId
      }
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// 4. DELETE ACCOUNT ROUTE
router.delete('/delete-account/:email', async (req, res) => {
  try {
    const userEmail = req.params.email;
    const deletedUser = await User.findOneAndDelete({ email: userEmail });

    if (!deletedUser) {
      return res.status(404).json({ message: 'User database not found!' });
    }

    res.status(200).json({ 
      success: true, 
      message: 'Account successfully deleted.' 
    });
  } catch (err) {
    console.error('Delete error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// 5. FORGOT PASSWORD ROUTE
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: 'No account is registered with this email!' });
    }

    const resetToken = crypto.randomBytes(32).toString('hex');

    user.resetPasswordToken = resetToken;
    user.resetPasswordExpires = Date.now() + 10 * 60 * 1000;
    await user.save();

    const resetUrl = `http://localhost:5173/reset-password/${resetToken}`;

    const mailOptions = {
      from: '"InterviewIQ.AI Support" <no-reply@interviewiq.ai>',
      to: user.email,
      subject: 'Password Reset Request - InterviewIQ.AI 🔒',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #f8fafc;">
          <h2 style="color: #10b981; text-align: center;">InterviewIQ.AI 🤖</h2>
          <p>Hi <b>${user.username}</b>,</p>
          <p>Aapne apne InterviewIQ.AI account ke liye password reset karne ki request ki hai.</p>
          <p style="text-align: center; margin: 30px 0;">
            <a href="${resetUrl}" style="background-color: #10b981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">Reset Password</a>
          </p>
          <p>This link is only valid for <b>10 minutes</b>.</p>
          <p>If you didn't make this request, please ignore this email.</p>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);

    res.status(200).json({ 
      success: true, 
      message: 'The password reset link has been sent to your email! 📧' 
    });

  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ message: 'There was an error in sending the mail', error: err.message });
  }
});

// 6. RESET PASSWORD ROUTE
router.post('/reset-password/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const { newPassword } = req.body;

    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({ message: 'The password reset token is invalid or has expired!' });
    }

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);

    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    res.status(200).json({ 
      success: true, 
      message: 'Password has been successfully reset! 🎉 Now you can log in.' 
    });

  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// 7. GET USER CREDITS ROUTE
router.get('/credits/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found!' });
    }

    res.status(200).json({
      success: true,
      credits: user.credits,
      plan: user.planType || user.plan || 'FREE',
      activePacks: user.activePacks || []
    });
  } catch (err) {
    console.error('Fetch credits error:', err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
});

// 8. GET USER PROFILE ROUTE (With Active Packs & Ledger)
router.get('/profile', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Unauthorized: No token provided' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    const userId = decoded.id || decoded.userId;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.status(200).json({
      success: true,
      id: user._id,
      username: user.username,
      email: user.email,
      credits: user.credits,
      planType: user.planType || 'FREE',
      activePacks: user.activePacks || [],
      currentActivePackId: user.currentActivePackId || null
    });
  } catch (err) {
    console.error('Fetch Profile Error:', err);
    res.status(500).json({ success: false, message: 'Server error fetching profile', error: err.message });
  }
});

// 9. ACTIVATE SPECIFIC PACK ROUTE (Profile Pack Selector)
router.post('/activate-pack', async (req, res) => {
  try {
    const { userId, packId } = req.body;
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found!' });
    }

    const targetPack = user.activePacks.id(packId) || user.activePacks.find(p => p._id.toString() === packId.toString());
    
    if (!targetPack) {
      return res.status(404).json({ success: false, message: 'This pack is not avaliable the ledger!' });
    }

    user.currentActivePackId = targetPack._id;
    user.planType = targetPack.planType;
    await user.save();

    res.status(200).json({
      success: true,
      message: `Successfully activated ${targetPack.planType} pack! 🎉`,
      currentActivePackId: user.currentActivePackId,
      planType: user.planType,
      activePacks: user.activePacks
    });
  } catch (err) {
    console.error('Activate Pack Error:', err);
    res.status(500).json({ success: false, message: 'Server error during pack activation', error: err.message });
  }
});

module.exports = router;