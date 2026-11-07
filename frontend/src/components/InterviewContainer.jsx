import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import Webcam from 'react-webcam';
import AptitudeRound from './technical/AptitudeRound';
import CodingRound from './technical/CodingRound';
import TechnicalRound from './technical/TechnicalRound';
import HrBehavioralChat from './hr/HrBehavioralChat';
import PreInterviewCheckModal from './PreInterviewCheckModal';

// 🌍 Environment Variables Setup
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const FASTAPI_URL = import.meta.env.VITE_FASTAPI_URL || 'http://localhost:8000';


export default function InterviewContainer({ interviewId, token, onInterviewComplete }) {
  const [interview, setInterview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [userPlan, setUserPlan] = useState('FREE'); //  User Plan State
  
  // 🔥 Persistent Pre-Interview System Check using localStorage per interviewId
  const [isSystemChecked, setIsSystemChecked] = useState(() => {
    return localStorage.getItem(`system_checked_${interviewId}`) === 'true';
  });
  
  // 🛡️ Anti-Cheat FullScreen & Proctoring State
  const [violationWarning, setViolationWarning] = useState(false);
  const [proctoringAlert, setProctoringAlert] = useState('');
  const [forceFullScreenGate, setForceFullScreenGate] = useState(false); //  Secure Full-Screen Gate State
  
  // 🔥 Global Behavioral / Proctoring Metrics State for all rounds
  const [behavioralMetricsState, setBehavioralMetricsState] = useState({
    eyeContactScore: 8.5,
    confidenceScore: 8.2,
    dominantExpression: 'Focused & Upright',
    faceDetected: true,
    suspiciousActivity: false,
    posture: 'Upright & Balanced',
    expression: 'Neutral & Professional'
  });

  const webcamContainerRef = useRef(null);
  const proctoringLoopRef = useRef(null);

  const fetchSession = async () => {
    try {
      setLoading(true);
      // 🌟 Reset violations count on fresh session load
      localStorage.setItem('proctoring_violations_count', '0');
      const currentToken = token || localStorage.getItem('token') || localStorage.getItem('auth_token');

      // Fetch user profile to check plan type
      if (currentToken) {
        try {
          const base64Payload = currentToken.split('.')[1];
          const payload = JSON.parse(atob(base64Payload));
          const userId = payload?.id || payload?.userId;
          if (userId) {
            const profileRes = await axios.get(`${API_URL}/api/auth/profile`, {
              headers: { Authorization: `Bearer ${currentToken}` }
            });
            if (profileRes.data && profileRes.data.planType) {
              setUserPlan(profileRes.data.planType.toUpperCase());
            }
          }
        } catch (e) {
          console.error("Profile plan fetch error:", e);
        }
      }

      const res = await axios.get(`${API_URL}/api/interview/${interviewId}`, {
        headers: { Authorization: `Bearer ${currentToken}` }
      });

      if (res.data.status === 'COMPLETED' || res.data.completed) {
        // 🖥️ Auto-Exit Fullscreen & Cleanup Media Streams
        cleanupMediaStreams();
        if (document.fullscreenElement) {
          document.exitFullscreen().catch(err => console.log(err));
        }

        if (onInterviewComplete) {
          onInterviewComplete(res.data.report || res.data);
        }
        return;
      }

      setInterview(res.data);
    } catch (err) {
      console.error("Session Fetch Error:", err);
      setError("Failed to load active interview session.");
    } finally {
      setLoading(false);
    }
  };

  const cleanupMediaStreams = () => {
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        navigator.mediaDevices.getUserMedia({ audio: true, video: true })
          .then(stream => {
            stream.getTracks().forEach(track => track.stop());
          }).catch(() => {});
      }
    } catch (e) {}
  };

  useEffect(() => {
    if (interviewId && token) {
      localStorage.setItem('active_interview_id', interviewId);
      fetchSession();
    }
    return () => {
      cleanupMediaStreams();
      if (proctoringLoopRef.current) clearInterval(proctoringLoopRef.current);
    };
  }, [interviewId, token]);

  const currentRoundType = (interview?.currentRoundType || '').toLowerCase();
  const currentQIndex = interview?.currentQuestionIndex || 0;
  const currentQ = interview?.qaHistory?.[currentQIndex] || {};
  const qRoundType = (currentQ?.roundType || '').toLowerCase();
  
  const activeRound = qRoundType || currentRoundType;

  // 🔥 Automatically re-apply full-screen or trigger gate whenever the active round changes
  useEffect(() => {
    const handleRoundFullScreen = async () => {
      window._isSwitchingRound = true;
      if (isSystemChecked && !document.fullscreenElement) {
        try {
          await document.documentElement.requestFullscreen();
        } catch (err) {
          setForceFullScreenGate(true);
        }
      }
      setTimeout(() => {
        window._isSwitchingRound = false;
      }, 1500);
    };
    handleRoundFullScreen();
  }, [activeRound, isSystemChecked]);

  // 🛡️ Advanced Debounced Proctoring Violation Refs
  const isFaceMissingActiveRef = useRef(false);
  const isMultipleFacesActiveRef = useRef(false);
  const isFullscreenViolationActiveRef = useRef(false);

  // 🛡️ CONTAINER-LEVEL BACKGROUND LIVE PROCTORING LOOP (Skipped during round transitions)
  useEffect(() => {
    if (!isSystemChecked) return;

    if (userPlan !== 'ULTIMATE') {
      return;
    }

    const runBackgroundProctoring = async () => {
      // 🔥 Skip proctoring checks if round is switching or transition gate is open
      if (window._isSwitchingRound || forceFullScreenGate) return;

      if (!webcamContainerRef.current) return;
      const imageSrc = webcamContainerRef.current.getScreenshot();
      if (!imageSrc) return;

      try {
        const res = await axios.post(`${FASTAPI_URL}/analyze-frame`, { image: imageSrc });
        const data = res.data;

        if (data) {
          setBehavioralMetricsState(data);

          const faceMissing = data.faceDetected === false;
          const multipleFaces = data.multipleFaces || (data.faceCount && data.faceCount > 1);

          // 1. Face Missing Violation Check
          if (faceMissing) {
            if (!isFaceMissingActiveRef.current && !window._isSwitchingRound) {
              isFaceMissingActiveRef.current = true;
              setProctoringAlert('Face not detected in frame!');
              setViolationWarning(true);

              const currentCount = parseInt(localStorage.getItem('proctoring_violations_count') || '0', 10);
              localStorage.setItem('proctoring_violations_count', (currentCount + 1).toString());
            }
          } else {
            isFaceMissingActiveRef.current = false;
          }

          // 2. Multiple Faces Violation Check
          if (multipleFaces) {
            if (!isMultipleFacesActiveRef.current && !window._isSwitchingRound) {
              isMultipleFacesActiveRef.current = true;
              setProctoringAlert('Multiple faces detected in frame!');
              setViolationWarning(true);

              const currentCount = parseInt(localStorage.getItem('proctoring_violations_count') || '0', 10);
              localStorage.setItem('proctoring_violations_count', (currentCount + 1).toString());
            }
          } else {
            isMultipleFacesActiveRef.current = false;
          }

          if (!faceMissing && !multipleFaces && !isFullscreenViolationActiveRef.current) {
            setProctoringAlert('');
            setViolationWarning(false);
          }
        }
      } catch (err) {
        // Silent catch
      }
    };

    proctoringLoopRef.current = setInterval(runBackgroundProctoring, 2000);

    return () => {
      if (proctoringLoopRef.current) clearInterval(proctoringLoopRef.current);
    };
  }, [isSystemChecked, userPlan, forceFullScreenGate]);

  // 🛡️ FULLSCREEN / ESC EXIT PROCTORING LISTENER
  useEffect(() => {
    const handleFullScreenChange = () => {
      if (isSystemChecked && !document.fullscreenElement) {
        const isSwitchingRound = window._isSwitchingRound === true;
        
        if (!isSwitchingRound) {
          if (!isFullscreenViolationActiveRef.current) {
            isFullscreenViolationActiveRef.current = true;
            setViolationWarning(true);
            setProctoringAlert('You exited full-screen mode!');
            
            const currentCount = parseInt(localStorage.getItem('proctoring_violations_count') || '0', 10);
            localStorage.setItem('proctoring_violations_count', (currentCount + 1).toString());
          }
        } else {
          setForceFullScreenGate(true);
        }
      } else {
        isFullscreenViolationActiveRef.current = false;
      }
    };

    document.addEventListener('fullscreenchange', handleFullScreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullScreenChange);
    };
  }, [isSystemChecked]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-900 text-white font-sans">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
          <p className="text-sm font-semibold text-slate-300">Loading Interview Session...</p>
        </div>
      </div>
    );
  }

  if (error || !interview) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-900 text-white font-sans">
        <div className="text-center p-6 bg-slate-800 rounded-2xl border border-slate-700 max-w-md">
          <p className="text-red-400 font-bold mb-4">{error || "Interview session not found."}</p>
          <button 
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs cursor-pointer"
          >
            Retry Connection 🔄
          </button>
        </div>
      </div>
    );
  }

  if (!isSystemChecked) {
    return (
      <PreInterviewCheckModal 
        token={token} 
        onReadyToStart={() => {
          localStorage.setItem(`system_checked_${interviewId}`, 'true');
          setIsSystemChecked(true);
        }} 
      />
    );
  }

  return (
    <div className="relative min-h-screen">
      
      {/* 🖥️ Force Full-Screen Secure Interactive Gate */}
      {forceFullScreenGate && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center bg-slate-950/90 backdrop-blur-md p-4">
          <div className="max-w-md w-full bg-white rounded-3xl p-8 text-center shadow-2xl border border-slate-200 flex flex-col gap-4 animate-in zoom-in duration-200">
            <div className="text-5xl">🖥️</div>
            <h3 className="text-xl font-black text-slate-900">Full-Screen Mode Required</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
             According to interview security rules, you need to stay in full-screen mode. This secure gate appears if you switch rounds or minimize the window.
            </p>
            <button
              onClick={() => {
                window._isSwitchingRound = true;
                document.documentElement.requestFullscreen().then(() => {
                  setForceFullScreenGate(false);
                  setViolationWarning(false);
                  setTimeout(() => { window._isSwitchingRound = false; }, 1000);
                }).catch(err => console.log(err));
              }}
              className="w-full rounded-xl bg-emerald-600 py-3.5 text-xs font-bold text-white shadow-lg hover:bg-emerald-500 cursor-pointer transition-colors"
            >
              Click Here to Return Full-Screen 🚀
            </button>
          </div>
        </div>
      )}

      {/* 🛡️ Hidden background webcam stream - Only active for Ultimate Plan */}
      {userPlan === 'ULTIMATE' && (
        <div className="absolute opacity-0 pointer-events-none -top-[9999px] -left-[9999px] h-[480px] w-[640px] overflow-hidden">
          <Webcam
            audio={false}
            ref={webcamContainerRef}
            screenshotFormat="image/jpeg"
            videoConstraints={{ width: 640, height: 480, facingMode: "user" }}
            className="h-full w-full"
          />
        </div>
      )}

      {/* 🚨 Fullscreen / Proctoring Violation Popup Banner */}
      {violationWarning && !forceFullScreenGate && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-rose-600 text-white px-4 py-3 text-center text-xs font-black shadow-2xl flex items-center justify-center gap-3 animate-pulse">
          <span>⚠️ PROCTORING VIOLATION: {proctoringAlert || 'Suspicious activity detected!'} Logged for report.</span>
          <button 
            onClick={() => {
              if (!document.fullscreenElement) {
                window._isSwitchingRound = true;
                document.documentElement.requestFullscreen().catch(err => console.log(err));
                setTimeout(() => { window._isSwitchingRound = false; }, 1000);
              }
              setViolationWarning(false);
            }}
            className="bg-white text-rose-700 px-3 py-1 rounded-lg font-bold text-[11px] cursor-pointer"
          >
            Dismiss & Return Full-Screen
          </button>
        </div>
      )}

      {/* Rounds Mapping with Global Behavioral Metrics Prop */}
      {activeRound.includes('hr') || activeRound.includes('behavioral') ? (
        <HrBehavioralChat 
          interview={interview} 
          setInterview={setInterview} 
          token={token} 
          interviewId={interviewId} 
          onComplete={onInterviewComplete} 
          behavioralMetrics={behavioralMetricsState}
        />
      ) : activeRound.includes('coding') ? (
        <CodingRound 
          interview={interview} 
          setInterview={setInterview} 
          token={token} 
          interviewId={interviewId} 
          onComplete={onInterviewComplete} 
          behavioralMetrics={behavioralMetricsState}
        />
      ) : activeRound.includes('aptitude') && (currentQ.options || currentQ.optionA) ? (
        <AptitudeRound 
          interview={interview} 
          setInterview={setInterview} 
          token={token} 
          interviewId={interviewId} 
          onComplete={onInterviewComplete} 
          behavioralMetrics={behavioralMetricsState}
        />
      ) : (
        <TechnicalRound 
          interview={interview} 
          setInterview={setInterview} 
          token={token} 
          interviewId={interviewId} 
          onComplete={onInterviewComplete} 
          behavioralMetrics={behavioralMetricsState}
        />
      )}
    </div>
  );
}