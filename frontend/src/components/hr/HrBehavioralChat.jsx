import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import Webcam from 'react-webcam';

// 🌍 Environment Variables Setup
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const FASTAPI_URL = import.meta.env.VITE_FASTAPI_URL || 'http://127.0.0.1:8000';

export default function HrBehavioralChat({ interview: initialInterview, setInterview, token, interviewId: propInterviewId, onComplete }) {
  const [interview, setInterviewState] = useState(initialInterview || null);
  
  // 🔥 Safe ID resolution
  const interviewId = propInterviewId || initialInterview?._id || interview?._id || localStorage.getItem('active_interview_id') || localStorage.getItem('currentInterviewId');

  const [answer, setAnswer] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [micError, setMicError] = useState(null);

  // Per-Round Independent Timer & Transition States
  const [timeLeft, setTimeLeft] = useState(900);
  const [showTransitionGate, setShowTransitionGate] = useState(false);
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [nextRoundTitle, setNextRoundTitle] = useState('');

  // Communication & Audio Metrics states
  const [speakingSeconds, setSpeakingSeconds] = useState(0);
  const [wordCount, setWordCount] = useState(0);
  const [fillerCount, setFillerCount] = useState(0);
  const speakingTimerRef = useRef(null);

  // 🌟 Multiple Audio Hits Collection Ref for per-question averaging
  const currentAudioAnalysesRef = useRef([]);

  // Audio Recorder & Vocal Analysis states
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

  // ================= FASTAPI WEBCAM & PROCTORING STATES =================
  const [webcamReady, setWebcamReady] = useState(false);
  const [metrics, setMetrics] = useState({
    faceDetected: true,
    suspiciousActivity: false,
    warningMessage: "",
    eyeContactScore: 8.5,
    confidenceScore: 8.2,
    posture: "Upright & Balanced",
    expression: "Neutral & Professional"
  });

  const webcamRef = useRef(null);
  const analysisIntervalRef = useRef(null);
  const chatEndRef = useRef(null);
  const recognitionRef = useRef(null);
  
  const previousAnswerRef = useRef('');

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

        const dur = Number(res.data?.roundsConfig?.hrBehavioral?.durationMinutes) || 15;
        setTimeLeft(dur * 60);
      } catch (err) {
        console.error("HR Behavioral round session load error:", err);
      }
    };

    if (!interview) {
      fetchSessionData();
    } else {
      const dur = Number(interview?.roundsConfig?.hrBehavioral?.durationMinutes) || 15;
      setTimeLeft(dur * 60);
    }
  }, [interviewId, token]);

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
          
          if (response.data) {
            setMetrics(response.data);
            
            // Push each frame to running history array
            const existingFrames = JSON.parse(localStorage.getItem('all_proctoring_frames') || '[]');
            existingFrames.push({
              eyeContactScore: response.data.eyeContactScore ?? response.data.eyeContact ?? 8.0,
              confidenceScore: response.data.confidenceScore ?? response.data.confidence ?? 8.0,
              posture: response.data.posture || response.data.postureStatus || 'Upright & Balanced',
              expression: response.data.expression || response.data.emotion || 'Neutral'
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
    q => (q.roundType || '').toLowerCase() === 'behavioral' || (q.roundType || '').toLowerCase() === 'hr'
  );
  const currentIndex = interview?.currentQuestionIndex || 0;

  const hrDuration = Number(interview?.roundsConfig?.hrBehavioral?.durationMinutes) || 15;
  const expectedTotalQuestions = Math.max(3, Math.round(hrDuration / 2.5));

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
              
              currentAudioAnalysesRef.current.push({
                wpm: res.data.wpm || 90,
                fillerWordsCount: res.data.fillerWordsCount || 0,
                vocalConfidenceScore: Number(res.data.vocalConfidenceScore || 7.5),
                energyScore: Number(res.data.energyScore || 7.5),
                toneModulationScore: Number(res.data.toneModulationScore || 7.5),
                toneFeedback: res.data.toneFeedback || "Standard Tone"
              });

              localStorage.setItem('latest_vocal_metrics', JSON.stringify(res.data));
            }
          } catch (err) {
            console.error("Audio Analysis service connection error:", err);
          }
        };
      };

      mediaRecorder.start(100);
    } catch (err) {
      setMicError("Microphone permission was denied.");
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

      const fillers = ['umm', 'like', 'aah', 'you know', 'actually', 'basically', 'ah', 'um', 'uh', 'so'];
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

  const handleSubmitAnswer = async (e) => {
    if (e) e.preventDefault();
    if (!answer.trim()) return;

    const activeId = interviewId || initialInterview?._id || interview?._id || localStorage.getItem('active_interview_id') || localStorage.getItem('currentInterviewId');
    if (!activeId) {
      alert("Interview ID is missing! Please restart interview from dashboard.");
      return;
    }

    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    stopRecording();
    setSubmitting(true);

    const words = answer.trim().split(/\s+/).filter(Boolean);
    const totalWords = words.length;

    const localStorageVocal = JSON.parse(localStorage.getItem('latest_vocal_metrics') || '{}');
    const analyses = currentAudioAnalysesRef.current;

    let finalWpm = localStorageVocal.wpm || vocalMetrics.wpm || 90;
    let finalFillers = localStorageVocal.fillerWordsCount ?? vocalMetrics.fillerWordsCount ?? fillerCount;
    let finalConfidence = Number(localStorageVocal.vocalConfidenceScore || vocalMetrics.vocalConfidenceScore || 7.5);
    let finalEnergy = Number(localStorageVocal.energyScore || vocalMetrics.energyScore || 7.5);
    let finalToneFeedback = localStorageVocal.toneFeedback || vocalMetrics.toneFeedback || "Clear and structured response articulation.";

    if (analyses.length > 0) {
      finalWpm = Math.round(analyses.reduce((sum, a) => sum + a.wpm, 0) / analyses.length);
      finalFillers = Math.round(analyses.reduce((sum, a) => sum + a.fillerWordsCount, 0) / analyses.length);
      finalConfidence = Number((analyses.reduce((sum, a) => sum + a.vocalConfidenceScore, 0) / analyses.length).toFixed(1));
      finalEnergy = Number((analyses.reduce((sum, a) => sum + a.energyScore, 0) / analyses.length).toFixed(1));
      finalToneFeedback = analyses[analyses.length - 1].toneFeedback || finalToneFeedback;
    }

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
        postureScore: metrics.postureScore || (metrics.posture === 'Upright & Balanced' ? 9.0 : 6.0),
        expressionData: metrics.expression || metrics.dominantExpression || 'Neutral & Professional'
      }
    };

    try {
      const response = await axios.post(
        `${API_URL}/api/interview/${activeId}/answer`,
        payload,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      localStorage.removeItem('latest_vocal_metrics');
      currentAudioAnalysesRef.current = [];

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
        setInterviewState(response.data.interview);
        if (setInterview) setInterview(response.data.interview);
        setAnswer('');
        previousAnswerRef.current = '';
        setWordCount(0);
        setFillerCount(0);
        setSpeakingSeconds(0);
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Error submitting answer');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitRound = async () => {
    setShowSummaryModal(false);
    
    const activeId = interviewId || initialInterview?._id || interview?._id || localStorage.getItem('active_interview_id') || localStorage.getItem('currentInterviewId');
    if (!activeId) {
      alert("Interview ID is missing! Please restart interview from dashboard.");
      return;
    }

    setSubmitting(true);
    try {
      const response = await axios.post(
        `${API_URL}/api/interview/${activeId}/answer`,
        { 
          answer: answer.trim() || 'Candidate manually finished the round early.',
          forceFinish: true, 
          isEarlyFinish: true,
          behavioralMetrics: {
            eyeContactScore: metrics.eyeContactScore,
            confidenceScore: metrics.confidenceScore,
            postureScore: metrics.postureScore || (metrics.posture === 'Upright & Balanced' ? 9.0 : 6.0),
            expressionData: metrics.expression || metrics.dominantExpression || 'Neutral & Professional'
          }
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (response.data.isRoundChanged) {
        setNextRoundTitle(response.data.nextRoundType || 'Next Round');
        setShowTransitionGate(true);
      } else if (response.data.completed || response.data.report || response.data.interview?.status === 'COMPLETED') {
        if (onComplete) {
          onComplete(response.data.report || response.data.interview);
        } else {
          window.location.reload();
        }
      } else {
        if (onComplete) {
          onComplete(response.data.report || response.data.interview);
        } else {
          window.location.reload();
        }
      }
    } catch (err) {
      console.error("Early finish error:", err);
      window.location.reload();
    } finally {
      setSubmitting(false);
    }
  };

  const answeredCount = qaHistory.filter(q => q.answer && q.answer.trim() !== '').length;
  const progressPercentage = Math.round((answeredCount / (expectedTotalQuestions || 1)) * 100);

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  return (
    <div className="flex h-screen flex-col bg-slate-50 font-sans relative overflow-hidden">
      
      {showTransitionGate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-md">
          <div className="w-[440px] rounded-3xl bg-white p-8 text-center shadow-2xl border border-slate-200 animate-in fade-in zoom-in duration-300">
            <div className="text-5xl mb-3">🎉</div>
            <h3 className="text-2xl font-black text-slate-900 mb-2">HR & Behavioral Completed!</h3>
            <p className="text-sm text-slate-600 mb-6 leading-relaxed">
              Fantastic work! You have finished all behavioral questions. Click below to view: <br />
              <strong className="text-emerald-600 text-lg uppercase font-extrabold mt-1 inline-block">{nextRoundTitle}</strong>
            </p>
            <button 
              onClick={() => {
                setShowTransitionGate(false);
                window.location.reload();
              }}
              className="w-full rounded-xl bg-emerald-600 py-3.5 text-sm font-bold text-white shadow-lg hover:bg-emerald-500 cursor-pointer transition-colors"
            >
              Continue 🚀
            </button>
          </div>
        </div>
      )}

      {/* Top Header */}
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-8 py-3.5 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🌟</span>
          <div>
            <h3 className="m-0 text-base font-extrabold text-slate-900">{interview?.role || "Software Engineer"}</h3>
            <span className="text-xs text-slate-500">Active Phase: <strong className="text-emerald-600 uppercase font-bold">HR & Behavioral Interview</strong></span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => setShowSummaryModal(true)}
            className="rounded-xl bg-rose-50 border border-rose-200 px-3.5 py-1.5 text-xs font-extrabold text-rose-600 hover:bg-rose-100 cursor-pointer transition-colors flex items-center gap-1.5 shadow-sm"
          >
            🛑 Finish Round Early
          </button>

          <div className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-[13px] font-bold ${timeLeft < 120 ? 'bg-red-50 border border-red-200 text-red-600 animate-pulse' : 'bg-blue-50 border border-blue-200 text-blue-600'}`}>
            <span>⏳ HR Time Left:</span>
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
          
          <div className="max-w-[800px] w-full mx-auto px-6 pt-5 pb-2 shrink-0">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-100">
                Question {currentIndex + 1} of {expectedTotalQuestions}
              </span>
            </div>
            <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
              <div 
                className="bg-emerald-500 h-full transition-all duration-300" 
                style={{ width: `${progressPercentage}%` }}
              />
            </div>
          </div>

          {/* Chat Message History */}
          <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-4 max-w-[800px] mx-auto w-full">
            {qaHistory.map((item, idx) => {
              const isLatestUnanswered = idx === currentIndex && (!item.answer || item.answer === '');

              return (
                <React.Fragment key={idx}>
                  <div className="flex items-start gap-3">
                    <div className="bg-slate-900 text-white rounded-full h-8 w-8 shrink-0 flex items-center justify-center font-bold text-xs">AI</div>
                    <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 text-slate-900 text-sm flex-1 flex flex-col gap-3">
                      <span>{item.question}</span>

                      {isLatestUnanswered && (
                        <div className="bg-emerald-50/70 border border-emerald-200/80 rounded-xl p-3 text-xs text-emerald-900 flex flex-col gap-1">
                          <div className="font-bold flex items-center gap-1.5 text-emerald-800">
                            <span>🌟</span> STAR Method Tip for Behavioral Answer:
                          </div>
                          <p className="m-0 text-[11px] text-emerald-700 leading-relaxed">
                            Structure your answer using <strong>S</strong>ituation, <strong>T</strong>ask, <strong>A</strong>ction, and <strong>R</strong>esult.
                          </p>
                        </div>
                      )}

                      {isLatestUnanswered && (
                        <button 
                          type="button"
                          onClick={() => speakText(item.question)}
                          className="self-start rounded-md border-0 bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-900 cursor-pointer hover:bg-slate-200 transition-colors"
                        >
                          🔊 Replay Question
                        </button>
                      )}
                    </div>
                  </div>

                  {item.answer && (
                    <div className="flex items-start justify-end gap-3">
                      <div className="bg-emerald-500 text-white p-4 rounded-2xl shadow-sm text-sm max-w-[800px]">
                        {item.answer}
                      </div>
                    </div>
                  )}
                </React.Fragment>
              );
            })}
            <div ref={chatEndRef} />
          </div>

          {/* Bottom Input Bar with Dedicated Stop Button */}
          <div className="border-t bg-white p-4 shadow-[0_-4px_20px_rgba(0,0,0,0.03)]">
            <form onSubmit={handleSubmitAnswer} className="max-w-[800px] mx-auto flex items-center gap-3">
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
                rows="2"
                placeholder={isRecording ? "Listening to your voice... Speak now!" : "Type your HR response here or click mic to speak..."}
                value={answer}
                onChange={(e) => {
                  const val = e.target.value;
                  setAnswer(val);
                  const words = val.trim().split(/\s+/).filter(Boolean);
                  setWordCount(words.length);
                  const fillers = ['umm', 'like', 'aah', 'you know', 'actually', 'basically', 'ah', 'um', 'uh', 'so'];
                  let count = 0;
                  words.forEach(w => {
                    if (fillers.includes(w.toLowerCase())) count++;
                  });
                  setFillerCount(count);
                }}
                className="flex-1 rounded-xl border p-3 text-sm outline-none focus:border-emerald-500"
                required
              />
              
              <button 
                type="submit" 
                disabled={submitting} 
                className="rounded-xl bg-slate-900 px-6 py-3 text-white font-bold text-sm hover:bg-emerald-500 disabled:opacity-50 cursor-pointer"
              >
                {submitting ? 'Submitting...' : 'Next 🚀'}
              </button>
            </form>
          </div>
        </div>

        {/* Right Side Panel: Proctoring Webcam Monitor & Vocal Tone Analytics */}
        <div className="flex w-[290px] shrink-0 flex-col gap-4 overflow-y-auto border-l border-slate-200 bg-white p-5">
          
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider m-0">Proctoring Monitor 📷</h4>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${metrics.faceDetected && !metrics.suspiciousActivity ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                {metrics.faceDetected ? (metrics.suspiciousActivity ? 'Flagged' : 'Secure') : 'No Face'}
              </span>
            </div>

            <div className={`relative aspect-[4/3] w-full overflow-hidden rounded-xl bg-slate-900 shadow-sm ${metrics.suspiciousActivity ? 'border-2 border-red-500' : 'border'}`}>
              <Webcam
                audio={false}
                ref={webcamRef}
                screenshotFormat="image/jpeg"
                onUserMedia={() => setWebcamReady(true)}
                className="h-full w-full object-cover"
              />
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
                <strong className="text-slate-800 font-bold text-[10px] leading-tight break-words mt-0.5">{metrics.posture || 'Upright'}</strong>
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
              <strong className="text-slate-900">{vocalMetrics.wpm} WPM</strong>
            </div>
            <div className="flex items-center justify-between text-[13px] text-slate-900">
              <span>Fillers Count:</span>
              <strong className="text-rose-600">{vocalMetrics.fillerWordsCount} Fillers</strong>
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

      {showSummaryModal && (
        <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 flex flex-col gap-4 animate-in zoom-in duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">Finish HR Round Early? 🛑</h3>
              <button 
                type="button"
                onClick={() => setShowSummaryModal(false)}
                className="text-xs font-bold text-slate-400 hover:text-slate-700 cursor-pointer bg-transparent border-0"
              >
                ✕ Close
              </button>
            </div>

            <p className="m-0 text-xs text-slate-600">
              You have answered {answeredCount} out of so far {expectedTotalQuestions}We have already answered the questions. Do you really want to finish this round here and move ahead?
            </p>

            <div className="flex items-center justify-end gap-3 mt-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowSummaryModal(false)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
              >
                Continue Interview 💬
              </button>
              
              <button
                type="button"
                onClick={handleSubmitRound}
                className="rounded-xl bg-rose-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-rose-500 cursor-pointer shadow"
              >
                Confirm & Finish Now 🚀
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}