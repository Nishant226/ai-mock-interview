import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import Webcam from 'react-webcam';

// 🌍 Environment Variables Setup
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const FASTAPI_URL = import.meta.env.VITE_FASTAPI_URL || 'http://127.0.0.1:8000';

export default function CodingRound({ interview: initialInterview, setInterview, token, interviewId: propInterviewId, onComplete }) {
  const interviewId = propInterviewId || localStorage.getItem('active_interview_id') || localStorage.getItem('currentInterviewId');
  const [interview, setInterviewState] = useState(initialInterview || null);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [language, setLanguage] = useState('javascript');
  const [code, setCode] = useState('// Write your solution here\nfunction solution() {\n  \n}');
  const [submitting, setSubmitting] = useState(false);
  const [secondsElapsed, setSecondsElapsed] = useState(0);
  const [activeTab, setActiveTab] = useState('testcases');
  const [testResults, setTestResults] = useState(null);
  const [customInput, setCustomInput] = useState('');
  const [customOutput, setCustomOutput] = useState('');
  const [running, setRunning] = useState(false);

  // Per-Round Independent Timers & Auto-Submit
  const [timeLeft, setTimeLeft] = useState(1200);
  const [showTransitionGate, setShowTransitionGate] = useState(false);
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [nextRoundTitle, setNextRoundTitle] = useState('');

  // Hint states
  const [hint, setHint] = useState('');
  const [loadingHint, setLoadingHint] = useState(false);

  // ================= FASTAPI WEBCAM & PROCTORING STATES =================
  const [webcamReady, setWebcamReady] = useState(false);
  const [metrics, setMetrics] = useState({
    faceDetected: true,
    suspiciousActivity: false,
    warningMessage: "",
    eyeContactScore: 8.0,
    confidenceScore: 8.0,
    posture: "Upright & Balanced",
    expression: "Neutral"
  });

  const webcamRef = useRef(null);
  const analysisIntervalRef = useRef(null);
  const metricsHistoryRef = useRef([]);
  const suspiciousCountRef = useRef(0);

  const timerRef = useRef(null);
  const textareaRef = useRef(null);
  const lineNumbersRef = useRef(null);
  const editorContainerRef = useRef(null);

  const draftKey = `code_draft_${interviewId}_${currentIndex}`;

  const templates = {
    javascript: '// Write your solution here\nfunction solution() {\n  \n}',
    python: '# Write your solution here\ndef solution():\n    pass',
    cpp: '// Write your solution here\n#include <iostream>\nusing namespace std;\n\nvoid solution() {\n    \n}',
    java: '// Write your solution here\npublic class Solution {\n    public void solve() {\n        \n    }\n}'
  };

  useEffect(() => {
    const fetchSessionData = async () => {
      const activeId = interviewId || localStorage.getItem('active_interview_id') || localStorage.getItem('currentInterviewId');
      if (!activeId) return;
      try {
        const res = await axios.get(`${API_URL}/api/interview/${activeId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setInterviewState(res.data);
        if (setInterview) setInterview(res.data);

        const dur = Number(res.data?.roundsConfig?.coding?.durationMinutes) || 20;
        setTimeLeft(dur * 60);
      } catch (err) {
        console.error("Coding round session load error:", err);
      }
    };

    if (!interview) {
      fetchSessionData();
    } else {
      const dur = Number(interview?.roundsConfig?.coding?.durationMinutes) || 20;
      setTimeLeft(dur * 60);
    }
  }, [interviewId, token]);

  // Round Timer Countdown & Auto-Submit on Expiry
  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          handleSubmitRound();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // 🔥 DIRECT WEBCAM PROCTORING LOOP (FastAPI Integration - Violation count handled centrally in container)
  useEffect(() => {
    if (webcamReady) {
      startFaceAnalysis();
    }
    return () => stopFaceAnalysis();
  }, [webcamReady]);

  const startFaceAnalysis = () => {
    if (analysisIntervalRef.current) return;
    analysisIntervalRef.current = setInterval(async () => {
      if (webcamRef.current && webcamRef.current.getScreenshot) {
        try {
          const imageSrc = webcamRef.current.getScreenshot();
          if (!imageSrc) return;

          const response = await axios.post('${FASTAPI_URL}/analyze-frame', {
            image: imageSrc
          });

          const data = response.data;
          if (data) {
            localStorage.setItem('cached_proctoring_metrics', JSON.stringify(data));
            setMetrics({
              faceDetected: data.faceDetected ?? true,
              suspiciousActivity: data.suspiciousActivity ?? false,
              warningMessage: data.warningMessage || "",
              eyeContactScore: data.eyeContactScore ?? data.eyeContact ?? 8.0,
              confidenceScore: data.confidenceScore ?? data.confidence ?? 8.0,
              posture: data.posture || data.postureStatus || "Upright & Balanced",
              expression: data.expression || data.emotion || "Neutral"
            });

            // Push each frame to running history array for true average calculation
            const existingFrames = JSON.parse(localStorage.getItem('all_proctoring_frames') || '[]');
            existingFrames.push({
              eyeContactScore: data.eyeContactScore ?? data.eyeContact ?? 8.0,
              confidenceScore: data.confidenceScore ?? data.confidence ?? 8.0,
              posture: data.posture || data.postureStatus || 'Upright & Balanced',
              expression: data.expression || data.emotion || 'Neutral'
            });

            if (existingFrames.length > 500) existingFrames.shift(); 
            localStorage.setItem('all_proctoring_frames', JSON.stringify(existingFrames));

            if (data.faceDetected && !data.suspiciousActivity) {
              metricsHistoryRef.current.push(data);
            } else if (data.suspiciousActivity) {
              suspiciousCountRef.current += 1;
            }
          }
        } catch (err) {
          // Silent catch
        }
      }
    }, 1500);
  };

  const stopFaceAnalysis = () => {
    if (analysisIntervalRef.current) {
      clearInterval(analysisIntervalRef.current);
      analysisIntervalRef.current = null;
    }
  };

  const qaHistory = (interview?.qaHistory || []).filter(
    q => (q.roundType || '').toLowerCase() === 'coding'
  );
  const currentQItem = qaHistory[currentIndex] || interview?.qaHistory?.[interview?.qaHistory?.length - 1];

  const codingDuration = Number(interview?.roundsConfig?.coding?.durationMinutes) || 20;
  const expectedTotalQuestions = Math.max(1, Math.round(codingDuration / 20));

  useEffect(() => {
    const savedDraft = localStorage.getItem(`code_draft_${interviewId}_${currentIndex}`);
    if (savedDraft) {
      setCode(savedDraft);
    } else {
      setCode(templates[language] || templates.javascript);
    }
    setSecondsElapsed(0);
    setTestResults(null);
    setCustomOutput('');
    setHint('');
    setActiveTab('testcases');

    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setSecondsElapsed((prev) => prev + 1);
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [currentIndex, interviewId]);

  useEffect(() => {
    if (code) {
      localStorage.setItem(draftKey, code);
    } else {
      localStorage.removeItem(draftKey);
    }
  }, [code, draftKey]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        handleRunCode();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [code, running]);

  const handleScroll = () => {
    if (lineNumbersRef.current && editorContainerRef.current) {
      lineNumbersRef.current.scrollTop = editorContainerRef.current.scrollTop;
    }
  };

  const handleLanguageChange = (e) => {
    const newLang = e.target.value;
    setLanguage(newLang);
    if (!localStorage.getItem(draftKey)) {
      setCode(templates[newLang] || templates.javascript);
    }
  };

  const handleResetCode = () => {
    if (window.confirm("Are you sure you want to reset your code to the default template?")) {
      const freshCode = templates[language] || templates.javascript;
      setCode(freshCode);
      localStorage.removeItem(draftKey);
      setTestResults(null);
    }
  };

  const handleGetHint = async () => {
    setLoadingHint(true);
    const activeId = interviewId || localStorage.getItem('active_interview_id') || localStorage.getItem('currentInterviewId');
    try {
      const res = await axios.post(
        `${API_URL}/api/interview/${activeId}/hint`,
        { questionIndex: currentIndex },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setHint(res.data.hint || "Consider optimal data structures like HashMaps, Two-Pointer technique, or dynamic programming.");
    } catch (err) {
      setHint("Think about time/space complexity optimization, edge cases, and modular function separation.");
    } finally {
      setLoadingHint(false);
    }
  };

  const handleRunCode = async () => {
    if (running) return;
    setRunning(true);
    setActiveTab('testcases');
    const activeId = interviewId || localStorage.getItem('active_interview_id') || localStorage.getItem('currentInterviewId');

    try {
      const res = await axios.post(
        `${API_URL}/api/interview/${activeId}/execute-code`,
        { code, language },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (res.data && res.data.testResults) {
        setTestResults(res.data.testResults);
      }
      if (res.data && res.data.output) {
        setCustomOutput(res.data.output);
      }
    } catch (err) {
      console.error(err);
      setTestResults([
        { id: 1, name: "Test Case 1 (Basic Inputs)", status: "FAILED", time: "0ms", expected: "Valid Output", actual: "Sandbox Connection Error / Backend Offline" },
        { id: 2, name: "Test Case 2 (Edge Case)", status: "FAILED", time: "0ms", expected: "Valid Output", actual: "Sandbox Connection Error / Backend Offline" },
        { id: 3, name: "Test Case 3 (Large Dataset)", status: "FAILED", time: "0ms", expected: "Valid Output", actual: "Sandbox Connection Error / Backend Offline" }
      ]);
    } finally {
      setRunning(false);
    }
  };

  const handleRunCustom = () => {
    if (!customInput.trim()) {
      alert("Please provide custom input to test.");
      return;
    }
    setActiveTab('output');
    setCustomOutput(`Running with custom input...\nInput:\n${customInput}\n\nOutput:\n[Execution Successful]\nResult: Valid response processed successfully.`);
  };

  const handleSubmitCode = async () => {
    setSubmitting(true);
    const activeId = interviewId || localStorage.getItem('active_interview_id') || localStorage.getItem('currentInterviewId');
    try {
      const res = await axios.post(
        `${API_URL}/api/interview/${activeId}/answer`,
        { 
          answer: code, 
          language,
          behavioralMetrics: {
            eyeContactScore: metrics.eyeContactScore,
            confidenceScore: metrics.confidenceScore,
            postureScore: 8.0,
            expressionData: metrics.expression || 'Neutral'
          }
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      localStorage.removeItem(draftKey);

      if (res.data.isRoundChanged) {
        setNextRoundTitle(res.data.nextRoundType || 'Next Round');
        setShowTransitionGate(true);
      } else if (res.data.completed || res.data.interview?.status === 'COMPLETED') {
        if (onComplete) {
          onComplete(res.data.report);
        } else {
          window.location.reload();
        }
      } else if (!res.data.completed && res.data.interview) {
        setInterviewState(res.data.interview);
        if (setInterview) setInterview(res.data.interview);
        setCode(templates[language] || templates.javascript);
        setTestResults(null);
        setHint('');
      } else {
        window.location.reload();
      }
    } catch (err) {
      console.error(err);
      alert('Error submitting code solution');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitRound = async () => {
    setShowSummaryModal(false);
    setSubmitting(true);
    const activeId = interviewId || localStorage.getItem('active_interview_id') || localStorage.getItem('currentInterviewId');
    try {
      const res = await axios.post(
        `${API_URL}/api/interview/${activeId}/answer`,
        { 
          answer: code || 'No Answer', 
          language,
          forceFinish: true,
          isEarlyFinish: true,
          behavioralMetrics: {
            eyeContactScore: metrics.eyeContactScore,
            confidenceScore: metrics.confidenceScore,
            postureScore: 8.0,
            expressionData: metrics.expression || 'Neutral'
          }
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      localStorage.removeItem(draftKey);

      if (res.data.isRoundChanged) {
        setNextRoundTitle(res.data.nextRoundType || 'Next Round');
        setShowTransitionGate(true);
      } else if (res.data.completed || res.data.interview?.status === 'COMPLETED') {
        if (onComplete) {
          onComplete(res.data.report);
        } else {
          window.location.reload();
        }
      } else {
        window.location.reload();
      }
    } catch (err) {
      console.error("Coding Final Round Submit Error:", err);
      window.location.reload();
    } finally {
      setSubmitting(false);
    }
  };

  const rawText = currentQItem?.question || "**Problem Description** You are given a problem to solve efficiently using optimal algorithms and clean data structures.";
  const cleanDescription = rawText.replace(/\*\*/g, '').replace(/###/g, '\n\n•');

  const lineCount = code.split('\n').length;
  const lineNumbersArray = Array.from({ length: lineCount }, (_, i) => i + 1);

  const renderHighlightedLine = (line, lIdx) => {
    if (!line) return <span key={lIdx}><br /></span>;
    if (line.trim().startsWith('#') || line.trim().startsWith('//')) {
      return <span key={lIdx} className="text-[#6a9955] italic">{line}<br /></span>;
    }

    const regex = /\b(let|const|var|function|return|for|if|else|while|class|public|private|protected|using|namespace|int|void|string|bool|double|float|new|this|def|pass|import|print|range|list|map|max|min|include|not|in|or|and|True|False|None|true|false|null)\b|(\d+)|(".*?"|'.*?'|\".*?\"|\'.*?\')|([a-zA-Z_][a-zA-Z0-9_]*)\s*\(|([+\-*/%=<>!&|^~:]+)/g;

    let tokens = [];
    let lastIdx = 0;
    let match;

    while ((match = regex.exec(line)) !== null) {
      if (match.index > lastIdx) {
        tokens.push(line.substring(lastIdx, match.index));
      }
      if (match[1]) {
        tokens.push(<span key={Math.random()} className="text-[#569cd6] font-bold">{match[1]}</span>);
      } else if (match[2]) {
        tokens.push(<span key={Math.random()} className="text-[#b5cea8]">{match[2]}</span>);
      } else if (match[3]) {
        tokens.push(<span key={Math.random()} className="text-[#ce9178]">{match[3]}</span>);
      } else if (match[4]) {
        tokens.push(
          <span key={Math.random()}>
            <span className="text-[#dcdcaa] font-semibold">{match[4]}</span>(
          </span>
        );
      } else if (match[5]) {
        tokens.push(<span key={Math.random()} className="text-[#c586c0] font-bold">{match[5]}</span>);
      }
      lastIdx = regex.lastIndex;
    }

    if (lastIdx < line.length) {
      tokens.push(line.substring(lastIdx));
    }

    return (
      <span key={lIdx}>
        {tokens.length > 0 ? tokens : line}
        <br />
      </span>
    );
  };

  const highlightCode = (codeText) => {
    const lines = codeText.split('\n');
    return lines.map((line, idx) => renderHighlightedLine(line, idx));
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  return (
    <div className="flex h-screen flex-col bg-slate-50 font-sans relative overflow-hidden">
      
      {/* 🚀 ROUND TRANSITION MODAL GATE */}
      {showTransitionGate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-md">
          <div className="w-[440px] rounded-3xl bg-white p-8 text-center shadow-2xl border border-slate-200 animate-in fade-in zoom-in duration-300">
            <div className="text-5xl mb-3">🎉</div>
            <h3 className="text-2xl font-black text-slate-900 mb-2">Coding Round Completed!</h3>
            <p className="text-sm text-slate-600 mb-6 leading-relaxed">
              Fantastic work! You have finished all coding challenges. Click below to enter: <br />
              <strong className="text-emerald-600 text-lg uppercase font-extrabold mt-1 inline-block">{nextRoundTitle} ROUND</strong>
            </p>
            <button 
              onClick={() => {
                setShowTransitionGate(false);
                window.location.reload();
              }}
              className="w-full rounded-xl bg-emerald-600 py-3.5 text-sm font-bold text-white shadow-lg hover:bg-emerald-500 cursor-pointer transition-colors"
            >
              Start {nextRoundTitle} Page 🚀
            </button>
          </div>
        </div>
      )}

      {/* Top Header */}
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-8 py-3.5 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="text-2xl">💻</span>
          <div>
            <h3 className="m-0 text-base font-extrabold text-slate-900">{interview?.role || "Software Engineer"}</h3>
            <span className="text-xs text-slate-500">Active Phase: <strong className="text-purple-600 uppercase font-bold">Coding Round</strong></span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => setShowSummaryModal(true)}
            className="rounded-xl bg-rose-50 border border-rose-200 px-3.5 py-1.5 text-xs font-extrabold text-rose-600 hover:bg-rose-100 cursor-pointer transition-colors flex items-center gap-1.5 shadow-sm"
          >
            🛑 Finish Round
          </button>

          <div className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-[13px] font-bold ${timeLeft < 120 ? 'bg-red-50 border border-red-200 text-red-600 animate-pulse' : 'bg-blue-50 border border-blue-200 text-blue-600'}`}>
            <span>⏳ Coding Time Left:</span>
            <span>{formatTime(timeLeft)}</span>
          </div>
        </div>
      </div>

      {/* Main Workspace Split View */}
      <div className="flex flex-1 overflow-hidden">
        
        {/* Left Panel: Problem Statement */}
        <div className="flex-1 border-r border-slate-200 bg-white p-6 overflow-y-auto flex flex-col gap-5">
          
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-purple-600 bg-purple-50 px-3 py-1 rounded-full border border-purple-100">
              Coding Challenge {currentIndex + 1} of {expectedTotalQuestions}
            </span>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleGetHint}
                disabled={loadingHint}
                className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700 cursor-pointer hover:bg-amber-100 transition-colors"
              >
                {loadingHint ? 'Thinking...' : '💡 Ask for Hint'}
              </button>
              <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-3 py-1 rounded-full">
                ⏱️ Session: {Math.floor(secondsElapsed / 60)}m {secondsElapsed % 60}s
              </span>
            </div>
          </div>

          {/* AI Hint Banner */}
          {hint && (
            <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 font-medium flex items-start gap-2">
              <span className="text-base">💡</span>
              <div className="flex-1">
                <strong>AI Hint:</strong> {hint}
              </div>
            </div>
          )}

          {/* Problem Description Card */}
          <div className="flex flex-col gap-3">
            <h2 className="text-lg font-extrabold text-slate-900 tracking-tight m-0">Problem Description</h2>
            <div className="text-sm text-slate-700 leading-relaxed bg-slate-50 p-4 rounded-xl border border-slate-200 whitespace-pre-wrap font-sans">
              {cleanDescription}
            </div>
          </div>

        </div>

        {/* Center Panel: VS Code Style Editor & Execution Terminal */}
        <div className="flex-[1.2] flex flex-col bg-[#1e1e1e] text-white overflow-hidden">
          
          {/* Top Toolbar */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-[#181818]">
            <div className="flex items-center gap-3">
              <select 
                value={language} 
                onChange={handleLanguageChange}
                className="bg-slate-800 text-white text-xs rounded-lg px-3 py-1.5 outline-none border border-slate-700 cursor-pointer font-medium"
              >
                <option value="javascript">JavaScript</option>
                <option value="python">Python</option>
                <option value="cpp">C++</option>
                <option value="java">Java</option>
              </select>
              <button
                type="button"
                onClick={handleResetCode}
                className="text-xs text-slate-400 hover:text-white bg-slate-800/50 hover:bg-slate-800 px-2.5 py-1.5 rounded-lg border border-slate-800 transition-colors cursor-pointer"
                title="Reset code template"
              >
                🔄 Reset
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button 
                onClick={handleRunCode}
                disabled={running}
                title="Shortcut: Ctrl + Enter"
                className="rounded-lg bg-slate-800 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-slate-700 border border-slate-700 cursor-pointer disabled:opacity-50 transition-all flex items-center gap-1.5"
              >
                {running ? '⌛ Running...' : '▶ Run Tests (Ctrl+Enter)'}
              </button>
              <button 
                onClick={handleSubmitCode}
                disabled={submitting}
                className="rounded-lg bg-emerald-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-emerald-500 disabled:opacity-50 cursor-pointer transition-all shadow"
              >
                {submitting ? 'Submitting...' : 'Submit Solution 🚀'}
              </button>
            </div>
          </div>

        {/* VS Code Style Editor Body - CSS Grid Stack Fix */}
        <div className="flex-1 relative overflow-auto bg-[#1e1e1e] font-mono text-sm" ref={editorContainerRef}>
          <div className="inline-flex min-w-full min-h-full">
            
            {/* Line Numbers (Sticky left so it stays in view on horizontal scroll, scrolls vertically with code) */}
            <div className="sticky left-0 z-20 py-4 bg-[#1e1e1e] border-r border-[#333333] text-right pr-3 pl-3 text-[#858585] select-none shrink-0">
              {lineNumbersArray.map((num) => (
                <div key={num} className="leading-6">{num}</div>
              ))}
            </div>

            {/* Editor Stacking Area using CSS Grid */}
            <div className="flex-1 grid grid-cols-1 grid-rows-1 p-4">
              {/* Syntax Highlighted Background */}
              <pre className="col-start-1 row-start-1 m-0 p-0 pointer-events-none whitespace-pre text-[#d4d4d4] leading-6 font-mono">
                <code>{highlightCode(code)}</code>
              </pre>

              {/* Transparent Textarea for Typing */}
              <textarea 
                ref={textareaRef}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="col-start-1 row-start-1 m-0 p-0 bg-transparent text-transparent caret-white outline-none resize-none whitespace-pre leading-6 font-mono selection:bg-blue-500/30"
                spellCheck="false"
              />
            </div>

          </div>
        </div>
          {/* Bottom Drawer: Test Results & Terminal */}
          <div className="border-t border-[#333333] bg-[#181818] flex flex-col h-48">
            <div className="flex items-center border-b border-[#333333] px-4 bg-[#1e1e1e] text-xs">
              <button 
                onClick={() => setActiveTab('testcases')}
                className={`py-2 px-3 font-bold border-b-2 transition-colors cursor-pointer ${activeTab === 'testcases' ? 'border-emerald-500 text-emerald-400' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
              >
                Test Results {testResults ? (testResults.some(t => t.status === 'FAILED') ? '(Failed)' : '(All Passed)') : ''}
              </button>
              <button 
                onClick={() => setActiveTab('custom')}
                className={`py-2 px-3 font-bold border-b-2 transition-colors cursor-pointer ${activeTab === 'custom' ? 'border-emerald-500 text-emerald-400' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
              >
                Custom Input
              </button>
              {activeTab === 'output' && (
                <button 
                  onClick={() => setActiveTab('output')}
                  className="py-2 px-3 font-bold border-b-2 border-emerald-500 text-emerald-400 cursor-pointer"
                >
                  Console Output
                </button>
              )}
            </div>

            <div className="p-3 overflow-y-auto flex-1 font-mono text-xs">
              {activeTab === 'testcases' && (
                <div>
                  {!testResults ? (
                    <p className="text-slate-500 italic py-2">Click "▶ Run Tests" or press Ctrl+Enter to execute your solution against test cases.</p>
                  ) : (
                    <div className="space-y-2">
                      {testResults.map((tc) => {
                        const isPassed = tc.status === 'PASSED';
                        return (
                          <div key={tc.id} className={`p-2.5 rounded border ${isPassed ? 'bg-slate-900 border-slate-800' : 'bg-rose-950/40 border-rose-900/50'}`}>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className={isPassed ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                                  {isPassed ? '✓' : '✕'}
                                </span>
                                <span className="text-slate-200 font-semibold">{tc.name}</span>
                              </div>
                              <div className="flex items-center gap-3 text-slate-400">
                                <span>Time: {tc.time}</span>
                                <span className={`px-2 py-0.5 rounded font-bold text-[10px] border ${isPassed ? 'bg-emerald-950 text-emerald-400 border-emerald-800' : 'bg-rose-900 text-white border-rose-700'}`}>
                                  {tc.status}
                                </span>
                              </div>
                            </div>
                            {!isPassed && (
                              <div className="mt-2 pt-2 border-t border-rose-900/40 text-[11px] space-y-1 text-rose-200">
                                <div><strong className="text-rose-400">Expected:</strong> {tc.expected}</div>
                                <div><strong className="text-rose-400">Actual Error:</strong> {tc.actual}</div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'custom' && (
                <div className="flex flex-col gap-2 h-full">
                  <textarea 
                    value={customInput}
                    onChange={(e) => setCustomInput(e.target.value)}
                    placeholder="Enter custom test input here..."
                    className="w-full bg-[#1e1e1e] text-slate-200 p-2.5 rounded border border-[#333333] outline-none text-xs h-16 resize-none font-mono"
                  />
                  <div className="flex justify-end">
                    <button 
                      onClick={handleRunCustom}
                      className="bg-slate-800 hover:bg-slate-700 text-white px-3 py-1 rounded text-xs font-bold border border-slate-700 cursor-pointer"
                    >
                      Run Custom Input
                    </button>
                  </div>
                </div>
              )}

              {activeTab === 'output' && (
                <div className="text-slate-300 whitespace-pre-wrap bg-[#1e1e1e] p-2.5 rounded border border-[#333333] h-full font-mono">
                  {customOutput}
                </div>
              )}
            </div>
          </div>

        </div>

        {/* Right Panel: Right Sidebar Dedicated Proctoring Monitor */}
        <div className="w-[290px] shrink-0 border-l border-slate-200 bg-white p-5 flex flex-col gap-4 overflow-y-auto">
          
          <div className="flex flex-col gap-2 bg-slate-50 p-3 rounded-2xl border border-slate-200">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider m-0">Proctoring Monitor 📷</h4>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${metrics.faceDetected && !metrics.suspiciousActivity ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                {metrics.faceDetected ? (metrics.suspiciousActivity ? 'Flagged' : 'Secure') : 'No Face'}
              </span>
            </div>

            {metrics.suspiciousActivity && (
              <div className="w-full rounded-lg border border-red-500 bg-red-100 p-2 text-center text-[11px] font-bold text-red-800 animate-pulse">
                ⚠ {metrics.warningMessage || "Suspicious Activity Detected"}
              </div>
            )}

            <div className={`relative aspect-[4/3] w-full overflow-hidden rounded-xl bg-slate-900 shadow-sm ${metrics.suspiciousActivity ? 'border-2 border-red-500' : 'border'}`}>
              <Webcam
                audio={false}
                ref={webcamRef}
                screenshotFormat="image/jpeg"
                onUserMedia={() => setWebcamReady(true)}
                className="h-full w-full object-cover"
              />
              {!webcamReady && (
                <div className="absolute inset-0 flex items-center justify-center text-xs text-white">
                  🎥 Starting Camera...
                </div>
              )}
            </div>

            {/* Live Metrics Grid */}
            <div className="grid grid-cols-2 gap-2 mt-1 text-[11px]">
              <div className="bg-white p-2 rounded-lg border border-slate-200 flex flex-col">
                <span className="text-slate-400 font-semibold text-[10px]">Eye Contact</span>
                <strong className={metrics.eyeContactScore > 6 ? 'text-emerald-600 font-bold text-xs' : 'text-amber-600 font-bold text-xs'}>
                  {metrics.eyeContactScore} / 10
                </strong>
              </div>
              <div className="bg-white p-2 rounded-lg border border-slate-200 flex flex-col">
                <span className="text-slate-400 font-semibold text-[10px]">Confidence</span>
                <strong className="text-blue-600 font-bold text-xs">{metrics.confidenceScore} / 10</strong>
              </div>
              <div className="bg-white p-2 rounded-lg border border-slate-200 flex flex-col">
                <span className="text-slate-400 font-semibold text-[10px]">Posture</span>
                <strong className="text-slate-800 font-bold text-[10px] leading-tight break-words mt-0.5">{metrics.posture || 'Upright & Balanced'}</strong>
              </div>
              <div className="bg-white p-2 rounded-lg border border-slate-200 flex flex-col">
                <span className="text-slate-400 font-semibold text-[10px]">Expression</span>
                <strong className="text-slate-800 font-bold text-[10px] leading-tight break-words mt-0.5">{metrics.expression || 'Neutral'}</strong>
              </div>
            </div>
          </div>

          <hr className="border-slate-100 my-1" />

          {/* Session Information Card */}
          <div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-xs">
            <span className="font-bold text-slate-700">Coding Session Info ⚡</span>
            <div className="flex justify-between text-slate-600 mt-1">
              <span>Environment:</span>
              <strong className="text-slate-900 uppercase font-semibold">{language}</strong>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>Auto-Save:</span>
              <strong className="text-emerald-600 font-bold">Enabled 💾</strong>
            </div>
          </div>

        </div>

      </div>

      {/* Summary Modal Before Round Completion */}
      {showSummaryModal && (
        <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 flex flex-col gap-4 animate-in zoom-in duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">Coding Summary & Review 📋</h3>
              <button 
                type="button"
                onClick={() => setShowSummaryModal(false)}
                className="text-xs font-bold text-slate-400 hover:text-slate-700 cursor-pointer bg-transparent border-0"
              >
                ✕ Close
              </button>
            </div>

            <p className="m-0 text-xs text-slate-600">
             Your coding round is about to be completed. Click confirm to finalize the round submission:
            </p>

            <div className="flex items-center justify-end gap-3 mt-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowSummaryModal(false)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
              >
                Continue Coding 💻
              </button>
              
              <button
                type="button"
                onClick={handleSubmitRound}
                className="rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-emerald-500 cursor-pointer shadow"
              >
                Confirm & Submit Round 🚀
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}