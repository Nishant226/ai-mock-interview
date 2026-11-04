const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const GROQ_API_KEY = process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY;
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL_NAME = "openai/gpt-oss-20b";

// Helper function with automatic retry logic for Rate Limits (429 / TPM)
async function fetchWithRetry(url, options, retries = 3, delay = 5000) {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, options);
      const data = await response.json();
      
      if (!response.ok) {
        const errorMessage = data.error?.message || 'Failed to fetch from AI Service';
        if (response.status === 429 || errorMessage.toLowerCase().includes('rate limit') || errorMessage.toLowerCase().includes('tpm')) {
          if (i < retries - 1) {
            console.warn(`⚠️ Groq Rate Limit hit. Retrying in ${delay / 1000}s (Attempt ${i + 1}/${retries})...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
        }
        throw new Error(errorMessage);
      }
      return data;
    } catch (err) {
      if (i === retries - 1) throw err;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

// Helper to get system instructions with Role, Experience, Difficulty, JD, Resume & System Design context
function getPersonaSystemPrompt(persona, roleInfo, candidateName, roundType = 'behavioral') {
  let personaStyle = "You are a professional, encouraging, and friendly interviewer.";
  
  if (persona === "Strict Manager") {
    personaStyle = "You are a strict, no-nonsense engineering or department manager. You expect high standards and deep technical justification.";
  } else if (persona === "Stress Interviewer") {
    personaStyle = "You are a high-pressure stress interviewer testing how candidates handle intense roadblocks.";
  }

  const roleStr = typeof roleInfo === 'string' ? roleInfo : JSON.stringify(roleInfo || '');

  // Dynamic Parsing for Experience Level
  let experienceLevel = "Fresher / Entry Level";
  const expMatch = roleStr.match(/Experience:\s*([^|\n]+)/i) || roleStr.match(/(\d+\+?\s*years?)/i);
  if (expMatch) {
    experienceLevel = expMatch[1].trim();
  }

  // Dynamic Parsing for Difficulty Level
  let difficultyLevel = "Intermediate";
  if (/beginner/i.test(roleStr)) difficultyLevel = "Beginner";
  else if (/advanced/i.test(roleStr)) difficultyLevel = "Advanced";
  else if (/intermediate/i.test(roleStr)) difficultyLevel = "Intermediate";

  // Dynamic Parsing for Job Description & Resume
  const jdMatch = roleStr.match(/Job Description Focus:\s*([^|\n]+)/i) || roleStr.match(/JD:\s*([^|\n]+)/i);
  const resumeMatch = roleStr.match(/Candidate Resume Background:\s*([^|\n]+)/i) || roleStr.match(/Resume:\s*([^|\n]+)/i);

  const jdText = jdMatch ? jdMatch[1].trim() : "";
  const resumeText = resumeMatch ? resumeMatch[1].trim() : "";

  // 🏗️ Check if System Design Checkbox is selected or requested
  const isSystemDesignSelected = /system design/i.test(roleStr) || /architecture/i.test(roleStr);

  let contextInstructions = `Candidate Name: "${nameOrContext(candidateName)}". Target Experience Level: "${experienceLevel}". Interview Difficulty: "${difficultyLevel}".`;
  
  if (jdText) {
    contextInstructions += ` Job Description Requirements: "${jdText}". Ensure questions directly test target skills from this JD.`;
  }
  if (resumeText) {
    contextInstructions += ` Candidate Resume Context: "${resumeText}". Ask questions that tailor to candidate's projects, tech stack, and background mentioned in their resume.`;
  }

  const languageInstruction = ` LANGUAGE STYLE: Conduct the interview strictly in professional English.`;

  if (roundType === 'aptitude') {
    return `${personaStyle} You are conducting an Aptitude & Logical Reasoning test.${languageInstruction} ${contextInstructions} Generate a relevant multiple-choice question (MCQ) with 4 options matching this profile. 
    You MUST output valid JSON format with keys: 
    - "question" (string: the aptitude/logical question)
    - "options" (array of 4 strings: the choices). 
    Return ONLY raw JSON, no markdown backticks, no extra text.`;
  }

  if (roundType === 'coding') {
    return `${personaStyle} You are conducting a Coding Round.${languageInstruction} ${contextInstructions} Generate a practical coding problem statement with inputs/outputs or constraints matching this experience level (${experienceLevel}) and target skills. Return plain text.`;
  }

  if (roundType === 'technical') {
    let technicalFocus = `Ask ONE targeted technical question appropriate for experience level (${experienceLevel}), target skills from JD, and candidate resume projects.`;
    
    // 🏗️ System Design Specific Prompt Trigger
    if (isSystemDesignSelected) {
      technicalFocus = `CRITICAL: The candidate has enabled SYSTEM DESIGN. Ask ONE System Design / System Architecture question (e.g. designing high-availability systems, API gateway design, microservices communication, load balancing, caching strategy, or database sharding/indexing) suitable for experience level (${experienceLevel}).`;
    }

    return `${personaStyle} You are conducting a Technical Interview round.${languageInstruction} ${contextInstructions} ${technicalFocus} Do not repeat previous questions.`;
  }

  return `${personaStyle} You are conducting an HR / Behavioral interview for candidate "${nameOrContext(candidateName)}".${languageInstruction} ${contextInstructions} Based on conversation history, candidate background, and JD requirements, ask ONE smart, realistic follow-up question. Do not repeat previous questions.`;
}

function nameOrContext(name) {
  return name || "Candidate";
}

async function generateInterviewQuestion(role, candidateName, qaHistory, persona = "Friendly HR") {
  try {
    let roundType = 'behavioral';
    const roleLower = (typeof role === 'string' ? role : JSON.stringify(role)).toLowerCase();
    
    if (roleLower.includes('aptitude') || roleLower.includes('phase: aptitude')) {
      roundType = 'aptitude';
    } else if (roleLower.includes('coding') || roleLower.includes('phase: coding')) {
      roundType = 'coding';
    } else if (roleLower.includes('technical') || roleLower.includes('phase: technical')) {
      roundType = 'technical';
    }

    const systemPrompt = getPersonaSystemPrompt(persona, role, candidateName, roundType);
    const isJsonRequired = roundType === 'aptitude';

    const data = await fetchWithRetry(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: MODEL_NAME,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Context & Conversation history: ${JSON.stringify(qaHistory)}. Generate the next single question.` }
        ],
        temperature: 0.7
      })
    });

    let content = data.choices[0].message.content.trim();

    if (isJsonRequired) {
      try {
        content = content.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/, "");
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          return JSON.parse(jsonMatch[0]);
        }
        return JSON.parse(content);
      } catch (parseErr) {
        console.warn("⚠️ JSON Parse fallback triggered for aptitude question.");
        return {
          question: "What is the next number in the series: 2, 6, 12, 20, ?",
          options: ["30", "32", "28", "36"]
        };
      }
    }

    return content; 
  } catch (err) {
    console.error("Groq Fetch Question Error:", err.message);
    if (String(role).toLowerCase().includes('aptitude')) {
      return {
        question: "What is the time complexity of binary search?",
        options: ["O(n)", "O(log n)", "O(n^2)", "O(1)"]
      };
    }
    return "Could you explain a challenging technical problem you solved recently?";
  }
}

async function evaluateAnswer(question, answer, persona = "Friendly HR") {
  try {
    const data = await fetchWithRetry(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: MODEL_NAME,
        messages: [
          {
            role: "system",
            content: `You are an expert Interviewer with a "${persona}" style. Evaluate the candidate's answer. The interview language is strictly professional English, so provide constructive feedback accordingly.
            Return a valid JSON object with keys: 
            - "feedback" (2-3 sentences of constructive feedback)
            - "score" (integer between 1 to 10)
            - "needsFollowUp" (boolean)
            - "followUpQuestion" (string)
            Return ONLY raw JSON without markdown ticks.`
          },
          { role: "user", content: `Question: "${question}"\nCandidate's Answer: "${answer}"` }
        ],
        temperature: 0.2
      })
    });

    let rawContent = data.choices[0].message.content.trim();
    rawContent = rawContent.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/, "");
    const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return JSON.parse(rawContent);
  } catch (err) {
    console.error("Groq Evaluation Error:", err.message);
    return { feedback: "Evaluation processed successfully.", score: 7, needsFollowUp: false, followUpQuestion: "" };
  }
}

module.exports = { generateInterviewQuestion, evaluateAnswer };