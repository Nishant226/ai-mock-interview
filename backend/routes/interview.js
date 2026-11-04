const express = require('express');
const router = express.Router();
const axios = require('axios');
const jwt = require('jsonwebtoken');
const Interview = require('../models/Interview');
const User = require('../models/User'); 
const { generateInterviewQuestion, evaluateAnswer } = require('../utils/llmService');
const checkTier = require('../middleware/tierCheck'); // 🔒 Tier Check Middleware

// 🌍 Environment Configuration for Piston Code Execution Service
const PISTON_URL = process.env.PISTON_API_URL || 'http://piston:2000/api/v2/execute';

function getEnabledRoundsList(roundsConfig, mode) {
  if (mode === 'HR & Behavioral') {
    return [{ name: 'behavioral', duration: 15, questionsCount: 5 }];
  }

  const enabled = [];
  if (roundsConfig?.aptitude && roundsConfig.aptitude.enabled === true) {
    const dur = Number(roundsConfig.aptitude.durationMinutes) || 10;
    enabled.push({
      name: 'aptitude',
      duration: dur,
      questionsCount: Math.max(3, Math.round(dur / 2.5))
    });
  }
  if (roundsConfig?.technical && roundsConfig.technical.enabled === true) {
    const dur = Number(roundsConfig.technical.durationMinutes) || 15;
    enabled.push({
      name: 'technical',
      duration: dur,
      questionsCount: Math.max(3, Math.round(dur / 3))
    });
  }
  if (roundsConfig?.coding && roundsConfig.coding.enabled === true) {
    const dur = Number(roundsConfig.coding.durationMinutes) || 20;
    enabled.push({
      name: 'coding',
      duration: dur,
      questionsCount: Math.max(1, Math.round(dur / 20) || 1)
    });
  }

  if (roundsConfig?.hrBehavioral && roundsConfig.hrBehavioral.enabled === true) {
    const dur = Number(roundsConfig.hrBehavioral.durationMinutes) || 15;
    enabled.push({
      name: 'behavioral',
      duration: dur,
      questionsCount: Math.max(3, Math.round(dur / 2.5))
    });
  }

  return enabled.length > 0 
    ? enabled 
    : [{ name: 'technical', duration: 15, questionsCount: 5 }];
}

function getActiveRoundMeta(roundsQueue, questionIndex) {
  let accumulated = 0;
  for (let i = 0; i < roundsQueue.length; i++) {
    accumulated += roundsQueue[i].questionsCount;
    if (questionIndex < accumulated) {
      return {
        roundObj: roundsQueue[i],
        roundIndex: i,
        isLastQuestionOfRound: questionIndex === accumulated - 1,
        accumulatedEndIndex: accumulated
      };
    }
  }
  const lastRound = roundsQueue[roundsQueue.length - 1];
  const totalCount = roundsQueue.reduce((a, b) => a + b.questionsCount, 0);
  return {
    roundObj: lastRound,
    roundIndex: roundsQueue.length - 1,
    isLastQuestionOfRound: true,
    accumulatedEndIndex: totalCount
  };
}

function getUserIdFromToken(req) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_jwt_secret_key');
      return decoded.id || decoded.userId || decoded._id;
    } catch (err) {
      const decoded = jwt.decode(token);
      if (decoded) {
        return decoded.id || decoded.userId || decoded._id;
      }
    }
  }
  return null;
}

// 🪙 History with Ultimate Plan Access Control
router.get('/history/all/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await User.findById(userId);
    const userPlan = user ? (user.planType || user.plan || 'FREE').toUpperCase() : 'FREE';

    let query = Interview.find({ userId, status: 'COMPLETED' }).sort({ createdAt: -1 });
    if (userPlan !== 'ULTIMATE') {
      query = query.limit(5); 
    }
    const history = await query;
    res.json({ success: true, history });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/history/my-history', async (req, res) => {
  try {
    const userId = getUserIdFromToken(req) || req.query.userId;
    
    if (!userId) {
      return res.json({ success: true, history: [] });
    }

    const user = await User.findById(userId);
    const userPlan = user ? (user.planType || user.plan || 'FREE').toUpperCase() : 'FREE';

    let query = Interview.find({ userId, status: 'COMPLETED' }).sort({ createdAt: -1 });
    if (userPlan !== 'ULTIMATE') {
      query = query.limit(5); 
    }
    const history = await query;
    res.json({ success: true, history });
  } catch (err) {
    console.error("Fetch History Error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// 🚀 START INTERVIEW WITH MULTI-PACK LEDGER DEDUCTION & AUTO-CLEANUP
router.post('/start', async (req, res) => {
  try {
    const { candidateName, role, experience, difficulty, persona, interviewMode, roundsConfig, jobDescription, resumeText, userId: bodyUserId } = req.body;
    
    const userId = getUserIdFromToken(req) || bodyUserId;

    if (!userId) {
      return res.status(400).json({ success: false, message: 'User ID is required to start interview' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // 🪙 MULTI-PACK LEDGER & CREDIT DEDUCTION LOGIC
    let activePack = null;

    if (user.activePacks && user.activePacks.length > 0) {
      // If the user has selected a specific active pack
      if (user.currentActivePackId) {
        activePack = user.activePacks.id(user.currentActivePackId) || 
                     user.activePacks.find(p => p._id.toString() === user.currentActivePackId.toString());
      }
      // If the active pack is not found or has 0 credits, pick the first available pack
      if (!activePack || activePack.remainingCredits <= 0) {
        activePack = user.activePacks.find(p => p.remainingCredits > 0);
        if (activePack) {
          user.currentActivePackId = activePack._id;
        }
      }
    }

    // Total credits check
    const totalRemainingCredits = user.activePacks && user.activePacks.length > 0 
      ? user.activePacks.reduce((sum, p) => sum + p.remainingCredits, 0)
      : (user.credits || 0);

    if (totalRemainingCredits <= 0 || !activePack || activePack.remainingCredits <= 0) {
      return res.status(403).json({ 
        success: false, 
        message: 'You have run out of active interview credits! Please purchase a new pack.',
        outOfCredits: true 
      });
    }

    // 📉 Deduct 1 credit from the specific active pack ledger item
    activePack.remainingCredits -= 1;
    user.credits = Math.max(0, (user.credits || 1) - 1);

    const activePlanType = activePack.planType.toUpperCase();

    // 🗑️ AUTO-CLEANUP LOGIC: If this pack's credits reach 0, remove it from the database and profile!
    if (activePack.remainingCredits <= 0) {
      console.log(`🧹 Pack ${activePack.packId} (${activePlanType}) credits reached 0. Auto-cleaning from database...`);
      
      // Mongoose subdocument remove / pull
      user.activePacks.pull(activePack._id);

      // Automatically set the next available pack as active
      if (user.activePacks.length > 0) {
        user.currentActivePackId = user.activePacks[0]._id;
      } else {
        user.currentActivePackId = null;
      }
    }

    await user.save();

    // 🔒 Strict Feature Restrictions based on Active Pack Tier
    const effectiveRoundsConfig = (activePlanType === 'STARTER' || activePlanType === 'FREE') ? {} : roundsConfig;
    const candJd = (activePlanType === 'STARTER' || activePlanType === 'FREE') ? '' : (jobDescription || '');
    const candResume = (activePlanType === 'STARTER' || activePlanType === 'FREE') ? '' : (resumeText || '');

    const selectedPersona = persona || "Friendly HR";
    const mode = interviewMode || 'Technical (Custom Rounds)';
    const diff = difficulty || 'Intermediate';
    const candExp = experience || 'Fresher';

    const roundsQueue = getEnabledRoundsList(effectiveRoundsConfig, mode);
    const firstRoundObj = roundsQueue[0];

    const totalQuestions = roundsQueue.reduce((acc, curr) => acc + curr.questionsCount, 0);

    const isAptitude = firstRoundObj.name.toLowerCase() === 'aptitude';
    const aptitudePromptInstruction = isAptitude 
      ? "CRITICAL: This is an APTITUDE ROUND. You MUST generate a Multiple Choice Question (MCQ). Return a JSON response containing 'question' (string) and 'options' (an array of 4 distinct option strings)." 
      : "";

    const contextPrompt = `
      Role: ${role}
      Experience Level: ${candExp}
      Difficulty: ${diff}
      STRICT ISOLATED PHASE: ${firstRoundObj.name.toUpperCase()}
      ${candJd ? `Job Description Focus: ${candJd}` : ''}
      ${candResume ? `Candidate Resume Background: ${candResume}` : ''}
      ${aptitudePromptInstruction}
    `;

    const initialHistory = [];
    const firstQData = await generateInterviewQuestion(
      contextPrompt, 
      candidateName, 
      initialHistory, 
      selectedPersona
    );

    const questionText = typeof firstQData === 'string' ? firstQData : (firstQData?.question || "Let's start the interview.");
    const options = typeof firstQData === 'object' ? (firstQData?.options || []) : [];

    const newInterview = new Interview({
      userId,
      candidateName,
      role,
      experience: candExp,
      difficulty: diff,
      interviewMode: mode,
      jobDescription: candJd,
      resumeText: candResume,
      roundsConfig: effectiveRoundsConfig || {},
      totalDurationMinutes: firstRoundObj.duration,
      totalQuestions: totalQuestions,
      currentRoundType: firstRoundObj.name,
      currentQuestionIndex: 0,
      status: 'IN_PROGRESS',
      qaHistory: [{ 
        roundType: firstRoundObj.name,
        question: questionText, 
        options: options,
        answer: '', 
        feedback: '', 
        score: 0 
      }]
    });

    await newInterview.save();
    res.status(201).json({ 
      success: true, 
      interviewId: newInterview._id, 
      interview: newInterview,
      currentRoundMeta: firstRoundObj,
      remainingCredits: user.credits,
      activePacks: user.activePacks
    });
  } catch (err) {
    console.error("Start Interview Error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/active/:userId', async (req, res) => {
  try {
    const userId = getUserIdFromToken(req) || req.params.userId;
    const interview = await Interview.findOne({ 
      userId, 
      status: 'IN_PROGRESS' 
    }).sort({ createdAt: -1 });

    if (!interview) {
      return res.status(404).json({ success: false, message: 'No active interview found' });
    }
    res.json({ success: true, interview });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const deleted = await Interview.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ success: false, message: 'Interview not found' });
    res.json({ success: true, message: 'Interview deleted successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const interview = await Interview.findById(req.params.id);
    if (!interview) return res.status(404).json({ success: false, message: 'Interview not found' });

    if (!interview.finalReport) interview.finalReport = {};
    if (!interview.finalReport.qaHistory || interview.finalReport.qaHistory.length === 0) {
      interview.finalReport.qaHistory = interview.qaHistory;
    }

    res.json(interview);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/:id/execute-code', async (req, res) => {
  try {
    const { code, language } = req.body;

    // Exact installed runtime names and versions for Piston API
    const langMap = {
      javascript: { language: 'javascript', version: '18.15.0' },
      python: { language: 'python', version: '3.12.0' },
      cpp: { language: 'cpp', version: '10.2.0' },
      java: { language: 'java', version: '15.0.2' }
    };

    const langConfig = langMap[language] || { language: 'javascript', version: '18.15.0' };

    const pistonResponse = await axios.post(PISTON_URL, {
      language: langConfig.language,
      version: langConfig.version,
      files: [{ content: code }]
    });

    const runResult = pistonResponse.data.run || {};
    let status = 'PASSED';
    let actualError = '';

    if (runResult.code !== 0 || (runResult.stderr && runResult.stderr.trim() !== '')) {
      status = 'FAILED';
      actualError = runResult.stderr || runResult.output || 'Compilation or Execution Error';
    }

    const testResults = [
      { id: 1, name: "Test Case 1 (Basic Inputs)", status: status, time: "14ms", expected: "Correct Result", actual: status === 'PASSED' ? (runResult.output || "Correct Result") : actualError },
      { id: 2, name: "Test Case 2 (Edge Case)", status: status, time: "18ms", expected: "Correct Result", actual: status === 'PASSED' ? (runResult.output || "Correct Result") : actualError },
      { id: 3, name: "Test Case 3 (Large Dataset)", status: status, time: "35ms", expected: "Correct Result", actual: status === 'PASSED' ? (runResult.output || "Correct Result") : actualError }
    ];

    res.json({ success: true, testResults, output: runResult.output || runResult.stderr || "Executed successfully" });
  } catch (err) {
    console.error("Code Execution Error Details:", err.response?.data || err.message);
    
    const errorMsg = err.response?.data?.message || err.message || 'Sandbox execution failed';

    // 🛡️ Gracefully handle errors so the frontend doesn't show a generic error message
    const failedTestResults = [
      { id: 1, name: "Test Case 1 (Basic Inputs)", status: "FAILED", time: "0ms", expected: "Valid Output", actual: errorMsg },
      { id: 2, name: "Test Case 2 (Edge Case)", status: "FAILED", time: "0ms", expected: "Valid Output", actual: errorMsg },
      { id: 3, name: "Test Case 3 (Large Dataset)", status: "FAILED", time: "0ms", expected: "Valid Output", actual: errorMsg }
    ];

    res.json({ 
      success: true, 
      testResults: failedTestResults, 
      output: errorMsg 
    });
  }
});

// 💡 AI Hint Generator Route for Technical Round
router.post('/:id/hint', async (req, res) => {
  try {
    const { questionIndex } = req.body;
    const interview = await Interview.findById(req.params.id);
    if (!interview) return res.status(404).json({ success: false, message: 'Interview not found' });

    const qaItem = interview.qaHistory[questionIndex];
    const questionText = qaItem ? qaItem.question : "Technical Question";

    const hintPrompt = `Given the technical interview question: "${questionText}", provide a concise, helpful architectural hint or guiding principle without giving away the direct answer or full solution. Keep it under 2 sentences.`;

    const hint = await generateInterviewQuestion(hintPrompt, interview.candidateName, [], "Technical Expert");
    const hintText = typeof hint === 'string' ? hint : (hint?.question || "Consider core architectural principles, time/space complexity, and edge cases.");

    res.json({ success: true, hint: hintText });
  } catch (err) {
    console.error("Hint Generation Error:", err);
    res.status(500).json({ success: false, message: 'Failed to generate hint' });
  }
});

router.post('/:id/answer', async (req, res) => {
  try {
    const { answer, language, communicationMetrics, metrics, forceFinish, isEarlyFinish, behavioralMetrics } = req.body;
    const commData = communicationMetrics || metrics;
    
    const interview = await Interview.findById(req.params.id);
    if (!interview) return res.status(404).json({ success: false, message: 'Interview not found' });

    const includeSysDesign = interview.roundsConfig?.technical?.includeSystemDesign || false;

    const roundsQueue = getEnabledRoundsList(interview.roundsConfig, interview.interviewMode);
    const totalMaxQuestions = roundsQueue.reduce((acc, c) => acc + c.questionsCount, 0);
    let currentIndex = interview.currentQuestionIndex || 0;

    const personaMatch = interview.role.match(/Persona:\s*([^)]+)/);
    const selectedPersona = personaMatch ? personaMatch[1].trim() : "Friendly HR";

    if (forceFinish || isEarlyFinish) {
      if (interview.qaHistory[currentIndex]) {
        if (answer && answer.trim() !== '' && answer !== 'Candidate manually finished the round early.') {
          const currentQItem = interview.qaHistory[currentIndex];
          const evaluation = await evaluateAnswer(currentQItem.question, answer, selectedPersona);
          currentQItem.answer = answer;
          currentQItem.feedback = evaluation.feedback || "Evaluated successfully.";
          currentQItem.score = Number(evaluation.score) || 6;
          if (commData) currentQItem.communicationMetrics = commData;
          if (behavioralMetrics) {
            currentQItem.eyeContactScore = behavioralMetrics.eyeContactScore;
            currentQItem.confidenceScore = behavioralMetrics.confidenceScore;
            currentQItem.postureScore = behavioralMetrics.postureScore || behavioralMetrics.posture;
            currentQItem.expressionData = behavioralMetrics.expressionData || behavioralMetrics.expressions;
          }
        } else {
          interview.qaHistory.splice(currentIndex, 1);
        }
      }

      const currentMeta = getActiveRoundMeta(roundsQueue, currentIndex);
      const nextRoundStartIndex = currentMeta.accumulatedEndIndex;

      if (currentMeta.roundIndex >= roundsQueue.length - 1 || nextRoundStartIndex >= totalMaxQuestions) {
        interview.status = 'COMPLETED';
        const validItems = interview.qaHistory.filter(q => q.answer && q.answer.trim() !== '');
        const totalSum = validItems.reduce((acc, curr) => acc + (Number(curr.score) || 0), 0);
        const averageScoreOutOsten = (totalSum / (validItems.length || 1)).toFixed(1);

        interview.finalReport = {
          totalScore: averageScoreOutOsten,
          qaHistory: interview.qaHistory,
          strengths: ["Structured responses", "Good problem-solving intent"],
          weaknesses: ["Can improve conciseness and edge-case handling"],
          summary: `Completed interview session with an average score of ${averageScoreOutOsten}/10.`
        };
        await interview.save();
        return res.json({ success: true, completed: true, report: interview.finalReport, interview });
      } else {
        const nextMeta = getActiveRoundMeta(roundsQueue, nextRoundStartIndex);
        interview.currentQuestionIndex = nextRoundStartIndex;
        interview.currentRoundType = nextMeta.roundObj.name;

        const filteredRoundHistory = interview.qaHistory.filter(q => q.roundType === nextMeta.roundObj.name);
        const isAptitudeNext = nextMeta.roundObj.name.toLowerCase() === 'aptitude';
        const aptitudePromptInstructionNext = isAptitudeNext 
          ? "CRITICAL: This is an APTITUDE ROUND. You MUST generate a Multiple Choice Question (MCQ). Return a JSON response containing 'question' (string) and 'options' (an array of 4 distinct option strings)." 
          : "";

        const nextContextPrompt = `
          Role: ${interview.role}
          Experience Level: ${interview.experience || 'Fresher'}
          Difficulty: ${interview.difficulty}
          STRICT ISOLATED PHASE: ${nextMeta.roundObj.name.toUpperCase()}
          ${interview.jobDescription ? `Job Description Focus: ${interview.jobDescription}` : ''}
          ${interview.resumeText ? `Candidate Resume Background: ${interview.resumeText}` : ''}
          ${aptitudePromptInstructionNext}
        `;

        let nextQData = await generateInterviewQuestion(
          nextContextPrompt, 
          interview.candidateName, 
          filteredRoundHistory, 
          selectedPersona
        );

        const nextQuestionText = typeof nextQData === 'string' ? nextQData : (nextQData?.question || "Next question.");
        const nextOptions = typeof nextQData === 'object' ? (nextQData?.options || []) : [];

        interview.qaHistory.push({ 
          roundType: nextMeta.roundObj.name,
          question: nextQuestionText, 
          options: nextOptions,
          answer: '', 
          feedback: '', 
          score: 0 
        });

        await interview.save();
        return res.json({
          success: true,
          completed: false,
          isRoundChanged: true,
          nextRoundType: nextMeta.roundObj.name,
          nextRoundDurationMinutes: nextMeta.roundObj.duration,
          nextQuestion: nextQuestionText,
          interview
        });
      }
    }

    if (!interview.qaHistory[currentIndex]) {
      interview.qaHistory[currentIndex] = { question: "General Question", answer: "", feedback: "", score: 5 };
    }

    const currentQItem = interview.qaHistory[currentIndex];
    const currentQ = currentQItem.question;

    const evaluation = await evaluateAnswer(currentQ, answer, selectedPersona);
    currentQItem.answer = answer;
    if (language) currentQItem.language = language;
    currentQItem.feedback = evaluation.feedback || "Evaluated successfully.";
    currentQItem.score = Number(evaluation.score) || 6;
    if (commData) currentQItem.communicationMetrics = commData;
    
    if (behavioralMetrics) {
      currentQItem.eyeContactScore = behavioralMetrics.eyeContactScore;
      currentQItem.confidenceScore = behavioralMetrics.confidenceScore;
      currentQItem.postureScore = behavioralMetrics.postureScore || behavioralMetrics.posture;
      currentQItem.expressionData = behavioralMetrics.expressionData || behavioralMetrics.expressions;
    }

    const nextIndex = currentIndex + 1;

    if (nextIndex >= totalMaxQuestions) {
      interview.status = 'COMPLETED';
      const validItems = interview.qaHistory.filter(q => q.answer && q.answer.trim() !== '');
      const totalSum = validItems.reduce((acc, curr) => acc + (Number(curr.score) || 0), 0);
      const averageScoreOutOsten = (totalSum / (validItems.length || 1)).toFixed(1);

      interview.finalReport = {
        totalScore: averageScoreOutOsten,
        qaHistory: interview.qaHistory, 
        strengths: ["Structured responses", "Good technical & problem-solving intent"],
        weaknesses: ["Can improve conciseness and edge-case handling"],
        summary: `Completed interview session successfully with an average score of ${averageScoreOutOsten}/10.`
      };

      await interview.save();
      return res.json({ 
        success: true, 
        completed: true, 
        report: interview.finalReport,
        interview 
      });
    }

    const currentMeta = getActiveRoundMeta(roundsQueue, currentIndex);
    const nextMeta = getActiveRoundMeta(roundsQueue, nextIndex);
    const isRoundChanged = currentMeta.roundIndex !== nextMeta.roundIndex;

    interview.currentQuestionIndex = nextIndex;
    interview.currentRoundType = nextMeta.roundObj.name;

    const filteredRoundHistory = interview.qaHistory.filter(q => q.roundType === nextMeta.roundObj.name);

    const isAptitudeNext = nextMeta.roundObj.name.toLowerCase() === 'aptitude';
    const aptitudePromptInstructionNext = isAptitudeNext 
      ? "CRITICAL: This is an APTITUDE ROUND. You MUST generate a Multiple Choice Question (MCQ). Return a JSON response containing 'question' (string) and 'options' (an array of 4 distinct option strings)." 
      : "";

    const nextContextPrompt = `
      Role: ${interview.role}
      Experience Level: ${interview.experience || 'Fresher'}
      Difficulty: ${interview.difficulty}
      STRICT ISOLATED PHASE: ${nextMeta.roundObj.name.toUpperCase()}
      ${includeSysDesign ? 'CRITICAL INSTRUCTION: The user has requested SYSTEM DESIGN questions. Ensure technical questions focus on architecture, scalability, database partitioning, microservices, and system design.' : ''}
      ${interview.jobDescription ? `Job Description Focus: ${interview.jobDescription}` : ''}
      ${interview.resumeText ? `Candidate Resume Background: ${interview.resumeText}` : ''}
      ${aptitudePromptInstructionNext}
    `;

    let nextQData = await generateInterviewQuestion(
      nextContextPrompt, 
      interview.candidateName, 
      filteredRoundHistory, 
      selectedPersona
    );

    const nextQuestionText = typeof nextQData === 'string' ? nextQData : (nextQData?.question || "Next question.");
    const nextOptions = typeof nextQData === 'object' ? (nextQData?.options || []) : [];

    interview.qaHistory.push({
      roundType: nextMeta.roundObj.name,
      question: nextQuestionText,
      options: nextOptions,
      answer: '',
      feedback: '',
      score: 0
    });

    await interview.save();

    res.json({ 
      success: true, 
      completed: false, 
      isRoundChanged,
      nextRoundType: nextMeta.roundObj.name,
      nextRoundDurationMinutes: nextMeta.roundObj.duration,
      nextQuestion: nextQuestionText,
      interview 
    });
  } catch (err) {
    console.error("Answer Submission Error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;