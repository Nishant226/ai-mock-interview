import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import Webcam from 'react-webcam';

// 🌍 Environment Variables Setup
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const FASTAPI_URL = import.meta.env.VITE_FASTAPI_URL || 'http://127.0.0.1:8000';

export default function AptitudeRound({ interview: initialInterview, setInterview, token, interviewId: propInterviewId, onComplete }) {
  const interviewId = propInterviewId || localStorage.getItem('active_interview_id') || localStorage.getItem('currentInterviewId');
  const [interview, setInterviewState] = useState(initialInterview || null);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [markedForReview, setMarkedForReview] = useState({});
  const [answersMap, setAnswersMap] = useState({});
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [showTransitionGate, setShowTransitionGate] = useState(false);
  const [nextRoundTitle, setNextRoundTitle] = useState('');

  // Per-Round Independent Timer State
  const [timeLeft, setTimeLeft] = useState(600);

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

  // Load Session
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
        
        const dur = Number(res.data?.roundsConfig?.aptitude?.durationMinutes) || 10;
        setTimeLeft(dur * 60);
      } catch (err) {
        console.error("Aptitude round session load error:", err);
      }
    };

    if (!interview) {
      fetchSessionData();
    } else {
      const dur = Number(interview?.roundsConfig?.aptitude?.durationMinutes) || 10;
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
          }
        } catch (err) {
          // Silent catch for network hiccups
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

  // Calculate expected total questions based on duration
  const aptitudeDuration = Number(interview?.roundsConfig?.aptitude?.durationMinutes) || 10;
  const expectedTotalQuestions = Math.max(3, Math.round(aptitudeDuration / 2.5));

  const qaHistory = interview?.qaHistory || [];
  const currentQItem = qaHistory[currentIndex] || {};
  const isLastQuestion = currentIndex >= expectedTotalQuestions - 1;

  // Options list
  const rawOptions = currentQItem.options || [
    currentQItem.optionA,
    currentQItem.optionB,
    currentQItem.optionC,
    currentQItem.optionD
  ].filter(Boolean);

  const optionsList = rawOptions.length > 0 ? rawOptions : [
    "A) Strong problem-solving & logical approach",
    "B) Systematic evaluation of constraints",
    "C) Algorithmic optimization and analysis",
    "D) Standard edge-case verification"
  ];

  // Sync selection when question changes
  useEffect(() => {
    const currentSavedAnswer = answersMap[currentIndex] !== undefined ? answersMap[currentIndex] : (currentQItem?.answer || '');
    setSelectedOption(currentSavedAnswer);
  }, [currentIndex, currentQItem, answersMap]);

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (showSummaryModal || showTransitionGate) return;
      const key = e.key.toUpperCase();

      if (['1', '2', '3', '4'].includes(key)) {
        const idx = parseInt(key) - 1;
        if (optionsList[idx]) handleSelect(optionsList[idx]);
      } else if (['A', 'B', 'C', 'D'].includes(key)) {
        const map = { A: 0, B: 1, C: 2, D: 3 };
        const idx = map[key];
        if (optionsList[idx]) handleSelect(optionsList[idx]);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [optionsList, showSummaryModal, showTransitionGate]);

  const handleSelect = (opt) => {
    setSelectedOption(opt);
    setAnswersMap(prev => ({ ...prev, [currentIndex]: opt }));
  };

  const toggleMarkForReview = () => {
    setMarkedForReview((prev) => ({
      ...prev,
      [currentIndex]: !prev[currentIndex]
    }));
  };

  const handleNextClick = async (e) => {
    if (e && e.preventDefault) e.preventDefault();

    if (isLastQuestion) {
      setShowSummaryModal(true);
      return;
    }

    setSubmitting(true);
    try {
      const activeId = interviewId || localStorage.getItem('active_interview_id') || localStorage.getItem('currentInterviewId');
      const res = await axios.post(
        `${API_URL}/api/interview/${activeId}/answer`,
        { 
          answer: selectedOption || 'No Answer',
          behavioralMetrics: {
            eyeContactScore: metrics.eyeContactScore,
            confidenceScore: metrics.confidenceScore,
            postureScore: 8.0,
            expressionData: metrics.expression || 'Neutral'
          }
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (res.data.isRoundChanged) {
        setNextRoundTitle(res.data.nextRoundType || 'Technical');
        setShowTransitionGate(true);
      } else if (res.data.interview) {
        setInterviewState(res.data.interview);
        if (setInterview) setInterview(res.data.interview);
        setCurrentIndex(prev => prev + 1);
        setSelectedOption('');
      } else {
        setCurrentIndex(prev => prev + 1);
        setSelectedOption('');
      }
    } catch (err) {
      console.error("Aptitude Answer Submit Error:", err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitRound = async () => {
    setShowSummaryModal(false);
    setSubmitting(true);
    try {
      const activeId = interviewId || localStorage.getItem('active_interview_id') || localStorage.getItem('currentInterviewId');
      const res = await axios.post(
        `${API_URL}/api/interview/${activeId}/answer`,
        { 
          answer: selectedOption || 'No Answer',
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
      console.error("Aptitude Final Round Submit Error:", err);
      window.location.reload();
    } finally {
      setSubmitting(false);
    }
  };

  const answeredCount = Object.values(answersMap).filter(ans => ans && ans.trim() !== '' && ans !== 'No Answer').length;
  const markedCount = Object.values(markedForReview).filter(Boolean).length;
  const unattemptedCount = expectedTotalQuestions - answeredCount;
  const progressPercentage = Math.round((answeredCount / (expectedTotalQuestions || 1)) * 100);

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
            <h3 className="text-2xl font-black text-slate-900 mb-2">Aptitude Round Completed!</h3>
            <p className="text-sm text-slate-600 mb-6 leading-relaxed">
              Great job! You have finished all questions in Aptitude Round. Click below to enter: <br />
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

      {/* Top Standalone Header */}
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-8 py-3.5 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🧠</span>
          <div>
            <h3 className="m-0 text-base font-extrabold text-slate-900">{interview?.role || "Software Engineer"}</h3>
            <span className="text-xs text-slate-500">Active Phase: <strong className="text-emerald-600 uppercase font-bold">Aptitude Round (MCQ)</strong></span>
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
            <span>⏳ Aptitude Time Left:</span>
            <span>{formatTime(timeLeft)}</span>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 p-6 overflow-y-auto flex flex-col items-center">
          <div className="max-w-[800px] w-full bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            
            {/* Top Bar: Question Counter */}
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full">
                Question {currentIndex + 1} of {expectedTotalQuestions}
              </span>
            </div>

            {/* Visual Progress Bar */}
            <div className="w-full bg-slate-100 h-2 rounded-full mb-6 overflow-hidden">
              <div 
                className="bg-emerald-500 h-full transition-all duration-300" 
                style={{ width: `${progressPercentage}%` }}
              />
            </div>

            {/* Question Text */}
            <h3 className="text-lg font-bold text-slate-900 mb-6 leading-relaxed">
              {currentQItem?.question || "Loading Aptitude Question..."}
            </h3>
            
            <form onSubmit={handleNextClick} className="flex flex-col gap-3">
              {optionsList.map((opt, idx) => {
                const shortcutKey = ['1', '2', '3', '4'][idx] || ['A', 'B', 'C', 'D'][idx];
                const isSelected = selectedOption === opt;
                return (
                  <label 
                    key={idx}
                    onClick={() => handleSelect(opt)}
                    className={`flex items-center justify-between p-3.5 rounded-xl border cursor-pointer transition-all ${isSelected ? 'border-emerald-500 bg-emerald-50 font-semibold text-emerald-900 shadow-sm' : 'border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-800'}`}
                  >
                    <div className="flex items-center gap-3">
                      <input 
                        type="radio" 
                        name="aptitude_option"
                        value={opt}
                        checked={isSelected}
                        onChange={() => handleSelect(opt)}
                        className="accent-emerald-500 h-4 w-4"
                      />
                      <span className="text-sm">{opt}</span>
                    </div>
                    <span className="text-[11px] font-bold text-slate-400 bg-slate-200/60 px-2 py-0.5 rounded">
                      [{shortcutKey}]
                    </span>
                  </label>
                );
              })}
              
              {/* Action Buttons */}
              <div className="flex items-center justify-between mt-6 pt-4 border-t border-slate-100">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => { setSelectedOption(''); setAnswersMap(prev => ({ ...prev, [currentIndex]: '' })); }}
                    className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
                  >
                    Clear Choice 🗑️
                  </button>
                  
                  <button
                    type="button"
                    onClick={toggleMarkForReview}
                    className={`rounded-xl border px-4 py-2.5 text-xs font-bold cursor-pointer transition-colors ${markedForReview[currentIndex] ? 'bg-amber-500 text-white border-amber-500 shadow' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
                  >
                    {markedForReview[currentIndex] ? '⭐ Marked for Review' : '☆ Mark for Review'}
                  </button>
                </div>

                <button 
                  type="submit"
                  disabled={submitting}
                  className={`rounded-xl px-7 py-3 text-white font-bold text-sm cursor-pointer shadow transition-all ${isLastQuestion ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-slate-900 hover:bg-emerald-500'} disabled:opacity-50`}
                >
                  {submitting ? 'Processing...' : (isLastQuestion ? 'Finish / Submit Round 🏁' : 'Next Question 🚀')}
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Right Sidebar: Palette Navigator & Advanced Proctoring Camera */}
        <div className="w-[300px] bg-white border-l border-slate-200 p-5 flex flex-col gap-4 overflow-y-auto">
          
          {/* Live Proctoring Monitor */}
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

            {/* Live Metrics Grid with Fixed Text Wrapping */}
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
                <strong className="text-slate-800 font-bold text-[10px] leading-tight break-words mt-0.5">{metrics.posture}</strong>
              </div>
              <div className="bg-white p-2 rounded-lg border border-slate-200 flex flex-col">
                <span className="text-slate-400 font-semibold text-[10px]">Expression</span>
                <strong className="text-slate-800 font-bold text-[10px] leading-tight break-words mt-0.5">{metrics.expression}</strong>
              </div>
            </div>
          </div>

          <hr className="border-slate-100 my-1" />

          {/* Question Palette */}
          <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider m-0">Question Palette</h4>
          <div className="grid grid-cols-5 gap-2">
            {Array.from({ length: expectedTotalQuestions }).map((_, idx) => {
              const q = qaHistory[idx];
              const isCurrent = idx === currentIndex;
              const currentAns = answersMap[idx] !== undefined ? answersMap[idx] : q?.answer;
              const isAnswered = currentAns && currentAns.trim() !== '' && currentAns !== 'No Answer';
              const isMarked = markedForReview[idx];
              const isGenerated = idx < qaHistory.length;

              let bgClass = "bg-slate-100 text-slate-400 border-slate-200 opacity-60 cursor-not-allowed"; 
              
              if (isCurrent) {
                bgClass = "bg-blue-600 text-white border-blue-600 font-bold ring-2 ring-blue-300 cursor-pointer";
              } else if (isGenerated) {
                if (isAnswered && isMarked) bgClass = "bg-purple-600 text-white border-purple-600 font-bold cursor-pointer";
                else if (isMarked) bgClass = "bg-amber-500 text-white border-amber-500 font-bold cursor-pointer";
                else if (isAnswered) bgClass = "bg-emerald-500 text-white border-emerald-500 font-bold cursor-pointer";
                else bgClass = "bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200 cursor-pointer";
              }

              return (
                <button
                  key={idx}
                  type="button"
                  disabled={!isGenerated && !isCurrent}
                  onClick={() => {
                    if (isGenerated || idx === currentIndex) {
                      setCurrentIndex(idx);
                    }
                  }}
                  className={`h-9 rounded-xl border flex items-center justify-center text-xs transition-all ${bgClass}`}
                >
                  {idx + 1}
                </button>
              );
            })}
          </div>

          {/* Legend */}
          <div className="mt-auto pt-3 border-t border-slate-100 flex flex-col gap-1.5 text-[10px] text-slate-500 font-medium">
            <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500 inline-block" /> Answered</div>
            <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-amber-500 inline-block" /> Marked for Review</div>
            <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-purple-600 inline-block" /> Answered & Marked</div>
            <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-blue-600 inline-block" /> Current Question</div>
          </div>
        </div>
      </div>

      {/* Summary Modal Before Round Completion */}
      {showSummaryModal && (
        <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 flex flex-col gap-4 animate-in zoom-in duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">Aptitude Summary & Review 📋</h3>
              <button 
                type="button"
                onClick={() => setShowSummaryModal(false)}
                className="text-xs font-bold text-slate-400 hover:text-slate-700 cursor-pointer bg-transparent border-0"
              >
                ✕ Close
              </button>
            </div>

            <div className="flex flex-col gap-3 text-sm text-slate-700">
              <p className="m-0 text-xs text-slate-500">Your Aptitude Round is about to be completed. Check the summary and confirm.:</p>
              
              <div className="grid grid-cols-2 gap-2 mt-1">
                <div className="bg-emerald-50 border border-emerald-200 p-2.5 rounded-xl flex flex-col">
                  <span className="text-[11px] text-emerald-600 font-semibold">Answered</span>
                  <strong className="text-base text-emerald-700">{answeredCount}</strong>
                </div>
                <div className="bg-amber-50 border border-amber-200 p-2.5 rounded-xl flex flex-col">
                  <span className="text-[11px] text-amber-600 font-semibold">Marked for Review</span>
                  <strong className="text-base text-amber-700">{markedCount}</strong>
                </div>
                <div className="bg-purple-50 border border-purple-200 p-2.5 rounded-xl flex flex-col">
                  <span className="text-[11px] text-purple-600 font-semibold">Unattempted</span>
                  <strong className="text-base text-purple-700">{unattemptedCount}</strong>
                </div>
                <div className="bg-blue-50 border border-blue-200 p-2.5 rounded-xl flex flex-col">
                  <span className="text-[11px] text-blue-600 font-semibold">Total Questions Count</span>
                  <strong className="text-base text-blue-700">{expectedTotalQuestions}</strong>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 mt-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowSummaryModal(false)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
              >
                Continue Reviewing 🔍
              </button>
              
              <button
                type="button"
                onClick={handleSubmitRound}
                className="rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-emerald-500 cursor-pointer shadow"
              >
                Confirm & Next Round 🚀
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}