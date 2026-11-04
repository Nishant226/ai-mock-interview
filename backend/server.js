require('dotenv').config(); 
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const rateLimit = require('express-rate-limit'); // 1. Rate limiter import kiya
const authRoutes = require('./routes/auth');
const interviewRoutes = require('./routes/interview');
const paymentRoutes = require('./routes/payment');

const app = express();

app.use(express.json());
app.use(cors());

// 2. Rate Limiting Setup (Security ke liye)
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes ka window
  max: 100, // Har IP se 15 minutes mein maximum 100 requests allow hongi
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  message: { error: "Too many requests from this IP, please try again after 15 minutes." }
});

// AI/Interview endpoints par general apiLimiter apply kar diya
app.use('/api/', apiLimiter);
app.use('/api/payment', paymentRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/interview', interviewRoutes);

// .env file se connection string uthayega, agar na mile toh local fallback use karega
const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/ai-mock-interviewer";

mongoose.connect(MONGO_URI)
  .then(() => console.log('MongoDB Connected Successfully! 🚀'))
  .catch((err) => console.log('MongoDB Connection Error:', err));

app.get('/', (req, res) => {
  res.send('AI Mock Interviewer Backend is Running!');
});

// 3. Global Error Handling Middleware (Server crash hone se bachane ke liye)
app.use((err, req, res, next) => {
  console.error("Global Server Error:", err.stack);
  res.status(500).json({ 
    success: false, 
    error: "Something went wrong on the server, please try again later." 
  });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});