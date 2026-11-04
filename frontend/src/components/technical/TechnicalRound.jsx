import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import Webcam from 'react-webcam';

// 🌍 Environment Variables Setup
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const FASTAPI_URL = import.meta.env.VITE_FASTAPI_URL || 'http://127.0.0.1:8000';

export default function TechnicalRound({ interview: initialInterview, setInterview, token, interviewId: propInterviewId, onComplete }) {
  const interviewId = propInterviewId || localStorage.getItem('active_interview_id') || localStorage.getItem('currentInterviewId');
  const [interview, setInterviewState] = useState(initialInterview || null);

  const [answer, setAnswer] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [micError, setMicError] = useState(null);

  // Per-Round Independent Timer & Transition States
  const [timeLeft, setTimeLeft] = useState(900); // Default 15 mins
  const [showTransitionGate, setShowTransitionGate] = useState(false);
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [nextRoundTitle, setNextRoundTitle] = useState('');

  // Communication & Audio Metrics states
  const [speakingSeconds, setSpeakingSeconds] = useState(0);
  const [wordCount, setWordCount] = useState(0);
  const [fillerCount, setFillerCount] = useState(0);
  const speakingTimerRef = useRef(null);

  // Audio Recorder & Vocal Analysis states (FastAPI Synchronized)
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const [vocalMetrics, setVocalMetrics] = useState({
    wpm: 90,
    fillerWordsCount: 0,
    vocalConfidenceScore: 7.5,
    energyScore: 7.5,
    toneModulationScore: 7.5,
    toneFeedback: "Standard Tone"
  });

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
  const chatEndRef = useRef(null);
  const recognitionRef = useRef(null);
  
  const previousAnswerRef = useRef('');

  // Load Session if missing
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

        const dur = Number(res.data?.roundsConfig?.technical?.durationMinutes) || 15;
        setTimeLeft(dur * 60);
      } catch (err) {
        console.error("Technical round session load error:", err);
      }
    };

    if (!interview) {
      fetchSessionData();
    } else {
      const dur = Number(interview?.roundsConfig?.technical?.durationMinutes) || 15;
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

  const qaHistory = (interview?.qaHistory || []).filter(
    q => (q.roundType || '').toLowerCase() === 'technical'
  );
  const currentIndex = interview?.currentQuestionIndex || 0;
  
  const techDuration = Number(interview?.roundsConfig?.technical?.durationMinutes) || 15;
  const expectedTotalQuestions = Math.max(3, Math.round(techDuration / 3));

  // AI Voice Narration (TTS)
  const speakText = (text) => {
    if (isMuted) return;
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      utterance.lang = 'en-US';

      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => setIsSpeaking(false);
      utterance.onerror = () => setIsSpeaking(false);

      window.speechSynthesis.speak(utterance);
    }
  };

  useEffect(() => {
    const currentQ = qaHistory[currentIndex]?.question;
    if (currentQ) {
      setTimeout(() => speakText(currentQ), 500);
    }
    return () => {
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    };
  }, [currentIndex, interview, isMuted]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [interview, isSpeaking]);

  const handleVoiceInput = async () => {
    setMicError(null);
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setMicError("Your browser does not support voice recognition. Please use Google Chrome.");
      return;
    }

    if (isRecording) {
      stopRecording();
      return;
    }

    previousAnswerRef.current = answer;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const options = MediaRecorder.isTypeSupported('audio/webm') 
        ? { mimeType: 'audio/webm' } 
        : { mimeType: 'audio/ogg' };
      const mediaRecorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        stream.getTracks().forEach(track => track.stop());

        if (audioBlob.size === 0) return;

        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = async () => {
          const base64Audio = reader.result;
          try {
            const res = await axios.post('${FASTAPI_URL}/analyze-audio', {
              audio: base64Audio,
              transcriptText: answer,
              wordCount: wordCount,
              speakingSeconds: speakingSeconds
            });
            if (res.data && res.data.success) {
              setVocalMetrics(res.data);
              setFillerCount(res.data.fillerWordsCount ?? fillerCount);
              localStorage.setItem('latest_vocal_metrics', JSON.stringify(res.data));
            }
          } catch (err) {
            console.error("Audio Analysis service connection error:", err);
          }
        };
      };

      mediaRecorder.start(100);
    } catch (err) {
      console.error("Microphone access error:", err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setMicError("Microphone permission was denied. Please allow mic access in browser settings.");
      } else {
        setMicError("Unable to access microphone. Please check device settings.");
      }
      return;
    }

    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;
    recognition.lang = 'en-US';
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.continuous = true;

    recognition.onstart = () => {
      setIsRecording(true);
      setSpeakingSeconds(0);
      speakingTimerRef.current = setInterval(() => {
        setSpeakingSeconds(prev => prev + 1);
      }, 1000);
    };

    recognition.onresult = (event) => {
      let currentSessionTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcriptChunk = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          previousAnswerRef.current = previousAnswerRef.current 
            ? `${previousAnswerRef.current} ${transcriptChunk}` 
            : transcriptChunk;
        } else {
          currentSessionTranscript += transcriptChunk;
        }
      }
      
      const combinedAnswer = previousAnswerRef.current 
        ? (currentSessionTranscript ? `${previousAnswerRef.current} ${currentSessionTranscript}` : previousAnswerRef.current)
        : currentSessionTranscript;

      setAnswer(combinedAnswer);

      const words = combinedAnswer.trim().split(/\s+/).filter(Boolean);
      setWordCount(words.length);

      const fillers = ['umm', 'like', 'aah', 'you know', 'actually', 'basically', 'ah', 'um'];
      let count = 0;
      words.forEach(w => {
        if (fillers.includes(w.toLowerCase())) count++;
      });
      setFillerCount(count);
    };

    recognition.onerror = () => {
      setIsRecording(false);
      if (speakingTimerRef.current) clearInterval(speakingTimerRef.current);
    };

    recognition.onend = () => {
      setIsRecording(false);
      if (speakingTimerRef.current) clearInterval(speakingTimerRef.current);
    };

    try { 
      recognition.start(); 
    } catch (err) { 
      setIsRecording(false); 
      if (speakingTimerRef.current) clearInterval(speakingTimerRef.current);
    }
  };

  const stopRecording = () => {
    if (!isRecording) return;
    setIsRecording(false);
    
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch(e) {}
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try { mediaRecorderRef.current.stop(); } catch(e) {}
    }
    
    if (speakingTimerRef.current) {
      clearInterval(speakingTimerRef.current);
      speakingTimerRef.current = null;
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
      setHint(res.data.hint || "Consider core architectural principles, time/space complexity, and edge cases.");
    } catch (err) {
      setHint("Think about modular design, clean code practices, and separation of concerns.");
    } finally {
      setLoadingHint(false);
    }
  };

  const insertFormatting = (type) => {
    let insertion = '';
    if (type === 'code') {
      insertion = '\n```javascript\n// Write your code or logic here\n```\n';
    } else if (type === 'bold') {
      insertion = '**bold text**';
    } else if (type === 'bullet') {
      insertion = '\n• Point 1\n• Point 2\n';
    }
    setAnswer(prev => prev + insertion);
  };

  const handleSubmitAnswer = async (e) => {
    e.preventDefault();
    if (!answer.trim()) return;

    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    stopRecording();

    setSubmitting(true);

    const words = answer.trim().split(/\s+/).filter(Boolean);
    const totalWords = words.length;

    const localStorageVocal = JSON.parse(localStorage.getItem('latest_vocal_metrics') || '{}');

    const finalWpm = localStorageVocal.wpm || vocalMetrics.wpm || (speakingSeconds > 0 ? Math.round(totalWords / (speakingSeconds / 60)) : 90);
    const finalFillers = localStorageVocal.fillerWordsCount ?? vocalMetrics.fillerWordsCount ?? fillerCount;
    const finalConfidence = Number(localStorageVocal.vocalConfidenceScore || vocalMetrics.vocalConfidenceScore || 7.5);
    const finalEnergy = Number(localStorageVocal.energyScore || vocalMetrics.energyScore || 7.5);
    const finalToneFeedback = localStorageVocal.toneFeedback || vocalMetrics.toneFeedback || "Clear technical articulation.";

    const communicationMetrics = {
      wpm: Number(finalWpm),
      fillerWordsCount: Number(finalFillers),
      totalWords: totalWords,
      durationSeconds: speakingSeconds > 0 ? speakingSeconds : 10,
      vocalConfidenceScore: Number(finalConfidence),
      energyScore: Number(finalEnergy),
      toneModulationScore: Number(vocalMetrics.toneModulationScore || 7.5),
      toneFeedback: finalToneFeedback
    };

    const payload = {
      answer,
      communicationMetrics,
      behavioralMetrics: {
        eyeContactScore: metrics.eyeContactScore,
        confidenceScore: metrics.confidenceScore,
        postureScore: metrics.postureScore || 8.0,
        expressionData: metrics.expression || 'Neutral'
      }
    };

    const activeId = interviewId || localStorage.getItem('active_interview_id') || localStorage.getItem('currentInterviewId');
    try {
      const response = await axios.post(
        `${API_URL}/api/interview/${activeId}/answer`,
        payload,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      localStorage.removeItem('latest_vocal_metrics');

      if (response.data.isRoundChanged) {
        setNextRoundTitle(response.data.nextRoundType || 'Next Round');
        setShowTransitionGate(true);
      } else if (response.data.completed) {
        if (onComplete) {
          onComplete(response.data.report);
        } else {
          window.location.reload();
        }
      } else {
        setInterviewState(response.data.interview);
        if (setInterview) setInterview(response.data.interview);
        setAnswer('');
        previousAnswerRef.current = '';
        setWordCount(0);
        setFillerCount(0);
        setSpeakingSeconds(0);
        setHint('');
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Error submitting answer');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitRound = async () => {
    setShowSummaryModal(false);
    setSubmitting(true);
    const activeId = interviewId || localStorage.getItem('active_interview_id') || localStorage.getItem('currentInterviewId');
    try {
      const response = await axios.post(
        `${API_URL}/api/interview/${activeId}/answer`,
        { 
          answer: answer || 'No Answer',
          forceFinish: true,
          isEarlyFinish: true,
          behavioralMetrics: {
            eyeContactScore: metrics.eyeContactScore,
            confidenceScore: metrics.confidenceScore,
            postureScore: metrics.postureScore || 8.0,
            expressionData: metrics.expression || 'Neutral'
          }
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      if (response.data.isRoundChanged) {
        setNextRoundTitle(response.data.nextRoundType || 'Next Round');
        setShowTransitionGate(true);
      } else if (response.data.completed || response.data.interview?.status === 'COMPLETED') {
        if (onComplete) {
          onComplete(response.data.report);
        } else {
          window.location.reload();
        }
      } else {
        window.location.reload();
      }
    } catch (err) {
      console.error("Technical Final Round Submit Error:", err);
      window.location.reload();
    } finally {
      setSubmitting(false);
    }
  };

  const answeredCount = qaHistory.filter(q => q.answer && q.answer.trim() !== '').length;
  const unattemptedCount = Math.max(0, expectedTotalQuestions - answeredCount);
  const progressPercentage = Math.min(100, Math.round((answeredCount / (expectedTotalQuestions || 1)) * 100));

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
            <h3 className="text-2xl font-black text-slate-900 mb-2">Technical Round Completed!</h3>
            <p className="text-sm text-slate-600 mb-6 leading-relaxed">
              Fantastic work! You have finished all technical questions. Click below to enter: <br />
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
          <span className="text-2xl">⚡</span>
          <div>
            <h3 className="m-0 text-base font-extrabold text-slate-900">{interview?.role || "Software Engineer"}</h3>
            <span className="text-xs text-slate-500">Active Phase: <strong className="text-blue-600 uppercase font-bold">Technical Interview</strong></span>
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
            <span>⏳ Technical Time Left:</span>
            <span>{formatTime(timeLeft)}</span>
          </div>

          <button
            type="button"
            onClick={() => {
              const newMuteState = !isMuted;
              setIsMuted(newMuteState);
              if (newMuteState && 'speechSynthesis' in window) {
                window.speechSynthesis.cancel();
              }
            }}
            className={`text-xs font-semibold px-3.5 py-1.5 rounded-full border transition-colors cursor-pointer flex items-center gap-1.5 ${isMuted ? 'bg-rose-50 text-rose-600 border-rose-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}
          >
            {isMuted ? '🔇 AI Voice: Muted' : '🔊 AI Voice: Active'}
          </button>
        </div>
      </div>

      {/* Main Workspace Area */}
      <div className="flex flex-1 overflow-hidden">
        
        {/* Center Chat Area */}
        <div className="flex flex-1 flex-col overflow-hidden relative bg-slate-50">
          
          {/* Microphone Permission Error Alert Banner */}
          {micError && (
            <div className="mx-6 mt-4 p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 font-medium flex items-center justify-between">
              <span>⚠️ <strong>Microphone Error:</strong> {micError}</span>
              <button 
                type="button" 
                onClick={() => setMicError(null)} 
                className="text-rose-600 font-bold hover:text-rose-900 cursor-pointer bg-transparent border-0"
              >
                ✕
              </button>
            </div>
          )}

          {/* Top Bar: Question Counter & Progress Bar */}
          <div className="max-w-[800px] w-full mx-auto px-6 pt-5 pb-2">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-blue-600 bg-blue-50 px-3 py-1 rounded-full border border-blue-100">
                Question {Math.min(currentIndex + 1, expectedTotalQuestions)} of {expectedTotalQuestions}
              </span>
            </div>
            <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
              <div 
                className="bg-blue-600 h-full transition-all duration-300" 
                style={{ width: `${progressPercentage}%` }}
              />
            </div>
          </div>

          {/* Chat Message History */}
          <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-4 max-w-[800px] mx-auto w-full">
            {hint && (
              <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 font-medium flex items-start gap-2">
                <span className="text-base">💡</span>
                <div className="flex-1">
                  <strong>AI Hint:</strong> {hint}
                </div>
              </div>
            )}

            {qaHistory.map((item, idx) => {
              const isLatestUnanswered = idx === currentIndex && (!item.answer || item.answer === '');

              return (
                <React.Fragment key={idx}>
                  <div className="flex items-start gap-3">
                    <div className="bg-blue-600 text-white rounded-full h-8 w-8 shrink-0 flex items-center justify-center font-bold text-xs">AI</div>
                    <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 text-slate-900 text-sm flex-1 flex flex-col gap-2">
                      <span>{item.question}</span>
                      {isLatestUnanswered && (
                        <div className="flex items-center gap-2 mt-1">
                          <button 
                            type="button"
                            onClick={() => speakText(item.question)}
                            className="rounded-md border-0 bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-900 cursor-pointer hover:bg-slate-200 transition-colors"
                          >
                            🔊 Replay Question
                          </button>
                          <button
                            type="button"
                            onClick={handleGetHint}
                            disabled={loadingHint}
                            className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700 cursor-pointer hover:bg-amber-100 transition-colors"
                          >
                            {loadingHint ? 'Thinking...' : '💡 Ask for Hint'}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {item.answer && (
                    <div className="flex items-start justify-end gap-3">
                      <div className="bg-blue-600 text-white p-4 rounded-2xl shadow-sm text-sm max-w-[800px]">
                        {item.answer}
                      </div>
                    </div>
                  )}
                </React.Fragment>
              );
            })}
            <div ref={chatEndRef} />
          </div>

          {/* Bottom Input Bar */}
          <div className="border-t bg-white p-4 shadow-[0_-4px_20px_rgba(0,0,0,0.03)]">
            <form onSubmit={handleSubmitAnswer} className="max-w-[800px] mx-auto flex flex-col gap-2">
              
              <div className="flex items-center gap-2 pb-1">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Format:</span>
                <button
                  type="button"
                  onClick={() => insertFormatting('code')}
                  className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer transition-colors flex items-center gap-1"
                >
                  💻 Insert Code Block
                </button>
                <button
                  type="button"
                  onClick={() => insertFormatting('bold')}
                  className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer transition-colors"
                >
                  <strong>B</strong> Bold
                </button>
                <button
                  type="button"
                  onClick={() => insertFormatting('bullet')}
                  className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer transition-colors"
                >
                  • Bullet List
                </button>
              </div>

              <div className="flex items-center gap-3">
                <button 
                  type="button"
                  onClick={() => handleVoiceInput()}
                  title="Click to speak your answer"
                  className={`cursor-pointer rounded-xl border border-slate-300 px-4 py-3 text-base transition-colors ${isRecording ? 'bg-red-500 text-white border-red-500 animate-pulse' : 'bg-slate-100 text-slate-900 hover:bg-slate-200'}`}
                >
                  {isRecording ? '🔴 Listening...' : '🎤'}
                </button>

                {isRecording && (
                  <button 
                    type="button"
                    onClick={() => stopRecording()}
                    className="rounded-xl bg-rose-600 px-4 py-3 text-white font-bold text-sm hover:bg-rose-500 cursor-pointer shadow flex items-center gap-1.5 shrink-0"
                  >
                    🛑 Stop
                  </button>
                )}

                <textarea
                  rows="3"
                  placeholder={isRecording ? "Listening to your voice... Speak now!" : "Type your technical response, code or use mic..."}
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  className="flex-1 rounded-xl border p-3 text-sm outline-none focus:border-blue-500 font-mono"
                  required
                />
                
                <button 
                  type="submit" 
                  disabled={submitting} 
                  className="rounded-xl bg-slate-900 px-6 py-3 text-white font-bold text-sm hover:bg-blue-600 disabled:opacity-50 cursor-pointer self-end shadow"
                >
                  {submitting ? 'Submitting...' : 'Submit Answer 🚀'}
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Right Side Panel: Proctoring Webcam Monitor & Vocal Tone Analytics */}
        <div className="flex w-[290px] shrink-0 flex-col gap-4 overflow-y-auto border-l border-slate-200 bg-white p-5">
          
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

          <div className="flex w-full flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3.5">
            <div className="text-xs font-bold text-slate-600 mb-1">Vocal Tone Analytics 🎙️</div>
            <div className="flex items-center justify-between text-[13px] text-slate-900">
              <span>Pacing:</span>
              <strong className="text-slate-900">{vocalMetrics.wpm || 90} WPM</strong>
            </div>
            <div className="flex items-center justify-between text-[13px] text-slate-900">
              <span>Fillers Count:</span>
              <strong className="text-rose-600">{vocalMetrics.fillerWordsCount ?? 0} Fillers</strong>
            </div>
            <div className="flex items-center justify-between text-[13px] text-slate-900">
              <span>Vocal Confidence:</span>
              <strong className={vocalMetrics.vocalConfidenceScore > 6 ? 'text-emerald-600' : 'text-amber-600'}>
                {vocalMetrics.vocalConfidenceScore} / 10
              </strong>
            </div>
            <div className="flex items-center justify-between text-[13px] text-slate-900">
              <span>Voice Energy:</span>
              <strong className="text-blue-600">{vocalMetrics.energyScore || 8.0} / 10</strong>
            </div>
            <div className="mt-2 text-[11px] font-semibold italic text-slate-600 border-t pt-2 border-slate-200">
              "{vocalMetrics.toneFeedback}"
            </div>
          </div>

        </div>

      </div>

      {/* Summary Modal Before Round Completion */}
      {showSummaryModal && (
        <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 flex flex-col gap-4 animate-in zoom-in duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">Technical Summary & Review 📋</h3>
              <button 
                type="button"
                onClick={() => setShowSummaryModal(false)}
                className="text-xs font-bold text-slate-400 hover:text-slate-700 cursor-pointer bg-transparent border-0"
              >
                ✕ Close
              </button>
            </div>

            <div className="flex flex-col gap-3 text-sm text-slate-700">
              <p className="m-0 text-xs text-slate-500">Your technical round is about to be completed. Check the summary and confirm:</p>
              
              <div className="grid grid-cols-2 gap-3 mt-1">
                <div className="bg-emerald-50 border border-emerald-200 p-3 rounded-xl flex flex-col">
                  <span className="text-xs text-emerald-600 font-semibold">Answered</span>
                  <strong className="text-lg text-emerald-700">{answeredCount}</strong>
                </div>
                <div className="bg-purple-50 border border-purple-200 p-3 rounded-xl flex flex-col">
                  <span className="text-xs text-purple-600 font-semibold">Unattempted</span>
                  <strong className="text-lg text-purple-700">{unattemptedCount}</strong>
                </div>
                <div className="bg-blue-50 border border-blue-200 p-3 rounded-xl flex flex-col col-span-2">
                  <span className="text-xs text-blue-600 font-semibold">Total Questions Count</span>
                  <strong className="text-lg text-blue-700">{expectedTotalQuestions}</strong>
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