const mongoose = require('mongoose');

const interviewSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  candidateName: { 
    type: String, 
    required: true 
  },
  role: { 
    type: String, 
    required: true 
  },
  experience: { 
    type: String, 
    default: 'Fresher' 
  },
  difficulty: { 
    type: String, 
    default: 'Intermediate' 
  },
  interviewMode: { 
    type: String, 
    default: 'Technical (Custom Rounds)' 
  },

  jobDescription: {
    type: String,
    default: ''
  },
  resumeText: {
    type: String,
    default: ''
  },
  roundsConfig: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  totalDurationMinutes: { 
    type: Number, 
    default: 10 
  },
  totalQuestions: { 
    type: Number, 
    default: 5 
  },
  currentRoundType: { 
    type: String, 
    default: 'behavioral' 
  },
  qaHistory: [
    {
      roundType: { type: String, default: 'behavioral' }, // behavioral, aptitude, technical, coding
      question: { type: String, required: true },
      options: [{ type: String }], // Aptitude / MCQ options 
      answer: { type: String, default: '' },
      language: { type: String, default: 'javascript' }, // Coding round ke liye selected language
      feedback: { type: String, default: '' },
      score: { type: Number, default: 0 },

      // 🌟 ADDED: Vocal & Communication Metrics from FastAPI
      communicationMetrics: {
        wpm: { type: Number, default: 0 },
        fillerWordsCount: { type: Number, default: 0 },
        totalWords: { type: Number, default: 0 },
        durationSeconds: { type: Number, default: 0 },
        vocalConfidenceScore: { type: Number, default: 0 },
        energyScore: { type: Number, default: 0 },
        toneModulationScore: { type: Number, default: 0 },
        toneFeedback: { type: String, default: '' }
      },

      // 🌟 ADDED: Proctoring & Behavioral Metrics
      eyeContactScore: { type: Number, default: 0 },
      confidenceScore: { type: Number, default: 0 },
      postureScore: { type: Number, default: 0 },
      expressionData: { type: String, default: '' }
    }
  ],
  currentQuestionIndex: { 
    type: Number, 
    default: 0 
  },
  totalScore: { type: Number, default: 0 },
  finalReport: {
    totalScore: Number,
    qaHistory: Array,
    strengths: [String],
    weaknesses: [String],
    summary: String
  },
  status: { 
    type: String, 
    enum: ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED'], 
    default: 'NOT_STARTED' 
  }
}, { timestamps: true });

module.exports = mongoose.model('Interview', interviewSchema);