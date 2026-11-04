import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

export default function InterviewSetup({ token, onStartInterview }) {
  const navigate = useNavigate();
  const [candidateName, setCandidateName] = useState('');
  const [role, setRole] = useState('');
  const [experience, setExperience] = useState('');
  const [interviewMode, setInterviewMode] = useState('Technical (Custom Rounds)');
  const [difficulty, setDifficulty] = useState('Intermediate');
  const [jobDescription, setJobDescription] = useState('');
  
  // User Plan State for Feature Restrictions
  const [userPlan, setUserPlan] = useState('FREE');

  // Interviewer Persona selection state
  const [persona, setPersona] = useState('Friendly HR');

  // Round selection toggles
  const [aptitudeEnabled, setAptitudeEnabled] = useState(true);
  const [technicalEnabled, setTechnicalEnabled] = useState(true);
  const [systemDesignEnabled, setSystemDesignEnabled] = useState(false); 
  const [codingEnabled, setCodingEnabled] = useState(true);

  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

  // Independent Round timings
  const [aptitudeTime, setAptitudeTime] = useState('10');
  const [technicalTime, setTechnicalTime] = useState('15');
  const [codingTime, setCodingTime] = useState('20');

  const [resume, setResume] = useState(null);
  const [loading, setLoading] = useState(false);

  // Fetch User Plan on mount
  useEffect(() => {
    const fetchUserProfile = async () => {
      try {
        const authToken = token || localStorage.getItem('auth_token') || localStorage.getItem('token');
        if (!authToken) return;

        const base64Payload = authToken.split('.')[1];
        const payload = JSON.parse(atob(base64Payload));
        const userId = payload?.id || payload?.userId;

        if (userId) {
          const res = await axios.get(`${API_URL}/api/auth/profile`, {
            headers: { Authorization: `Bearer ${authToken}` }
          });
          if (res.data && (res.data.planType || res.data.plan)) {
            setUserPlan((res.data.planType || res.data.plan).toUpperCase());
          }
        }
      } catch (err) {
        console.error("Error fetching user plan profile:", err);
      }
    };
    fetchUserProfile();
  }, [token]);

  const handleStartInterviewSubmit = async (e) => {
    e.preventDefault();
    if (!candidateName || !role || !experience) {
      alert('Please fill in all required fields!');
      return;
    }

    if (interviewMode === 'Technical (Custom Rounds)' && !aptitudeEnabled && !technicalEnabled && !codingEnabled) {
      alert('Please select at least one round for the interview!');
      return;
    }

    setLoading(true);
    try {
      let extractedResumeText = '';
      const isAllowedProOrUltimate = userPlan === 'PRO' || userPlan === 'ULTIMATE';

      if (resume) {
        if (!isAllowedProOrUltimate) {
          alert("⚠️ Resume & JD Contextual Generation Pro / Ultimate plan feature !");
        } else {
          extractedResumeText = `Candidate Resume File Attached: ${resume.name} (Role: ${role}, Exp: ${experience})`;
        }
      }

      const roundsConfig = {};
      if (interviewMode === 'Technical (Custom Rounds)') {
        if (!isAllowedProOrUltimate) {
          roundsConfig.technical = { enabled: true, durationMinutes: 15, difficultyLevel: difficulty, candidateExperience: experience };
        } else {
          roundsConfig.aptitude = { 
            enabled: aptitudeEnabled === true, 
            type: 'mcq', 
            durationMinutes: parseInt(aptitudeTime) || 10,
            difficultyLevel: difficulty,
            candidateExperience: experience
          };

          roundsConfig.technical = { 
            enabled: technicalEnabled === true, 
            includeSystemDesign: systemDesignEnabled === true, 
            durationMinutes: parseInt(technicalTime) || 15, 
            difficultyLevel: difficulty,
            candidateExperience: experience
          };

          roundsConfig.coding = { 
            enabled: codingEnabled === true, 
            durationMinutes: parseInt(codingTime) || 20 
          };
        }
      } else {
        roundsConfig.hrBehavioral = { 
          enabled: true, 
          durationMinutes: parseInt(technicalTime) || 15 
        };
      }

      const payload = {
        candidateName,
        role: `${role} (${experience}) - ${interviewMode}`,
        experience,
        difficulty,
        jobDescription: isAllowedProOrUltimate ? jobDescription : '',
        resumeText: extractedResumeText,
        interviewMode,
        roundsConfig,
        persona: interviewMode === 'HR & Behavioral' ? persona : undefined
      };

      const authToken = token || localStorage.getItem('auth_token') || localStorage.getItem('token');
      const response = await axios.post(
        '${API_URL}/api/interview/start',
        payload,
        { headers: { Authorization: `Bearer ${authToken}` } }
      );

      const interviewId = response.data?.interviewId || response.data?._id;

      if (interviewId) {
        // 🔥 AUTOMATIC CLEANUP SO YOU NEVER NEED MANUAL COMMANDS AGAIN
        localStorage.removeItem('all_proctoring_frames');
        localStorage.removeItem('proctoring_violations_count');
        localStorage.removeItem('cached_proctoring_metrics');

        localStorage.setItem('currentInterviewId', interviewId);
        localStorage.setItem('active_interview_id', interviewId);
        
        if (onStartInterview) {
          onStartInterview(interviewId);
        } else {
          navigate('/interview');
        }
      } else {
        alert('Failed to obtain interview session ID from server.');
      }

    } catch (err) {
      console.error("Start interview error:", err);
      if (err.response?.status === 403 && err.response?.data?.outOfCredits) {
        alert("⚠️ You've run out of available interview credits! Top up to start a new mock interview.");
      } else {
        alert(err.response?.data?.message || 'Error starting interview. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const isStarterOrFree = userPlan === 'STARTER' || userPlan === 'FREE';

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 font-sans">
      <div className="grid w-full max-w-[1050px] grid-cols-1 overflow-hidden rounded-[28px] bg-white shadow-[0_20px_50px_rgba(0,0,0,0.1)] border border-slate-200 md:grid-cols-[1fr_1.4fr]">
        
        {/* Left Banner Section */}
        <div className="flex flex-col justify-center bg-gradient-to-br from-emerald-50 to-emerald-100 p-8 md:p-[45px] border-b md:border-b-0 md:border-r border-emerald-200">
          <h2 className="mb-3.5 text-[28px] font-black text-emerald-800">Start Your AI Interview</h2>
          <p className="text-[15px] leading-relaxed text-emerald-700">
            Experience a fully tailored multi-round technical evaluation powered by advanced AI and custom interviewer styles.
          </p>
          <div className="mt-9 flex flex-col gap-3.5">
            <div className="rounded-xl bg-white px-[18px] py-3 text-[13px] font-bold text-emerald-700 shadow-[0_4px_10px_rgba(0,0,0,0.03)]">
              ✨ Tailored AI Evaluation & Smart MCQs
            </div>
            <div className="rounded-xl bg-white/60 px-[18px] py-3 text-[13px] font-bold text-emerald-900">
              🚀 Professional English Evaluation
            </div>
            <div className="rounded-xl bg-white/60 px-[18px] py-3 text-[13px] font-bold text-emerald-900">
              🎭 Custom Personas (HR, Manager, Stress)
            </div>
            <div className="rounded-xl bg-white/60 px-[18px] py-3 text-[13px] font-bold text-emerald-900 flex justify-between items-center">
              <span>🪙 Current Plan: <strong className="text-emerald-700 uppercase">{userPlan}</strong></span>
              {isStarterOrFree && (
                <button 
                  type="button" 
                  onClick={() => navigate('/pricing')} 
                  className="bg-emerald-600 text-white text-[10px] px-2.5 py-1 rounded-lg font-bold hover:bg-emerald-700 cursor-pointer"
                >
                  Upgrade 🚀
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Right Form Section */}
        <div className="flex flex-col justify-center max-h-[90vh] overflow-y-auto p-8 md:p-[35px_45px]">
          <div className="mb-4">
            <h3 className="text-[22px] font-extrabold text-slate-900">Advanced Interview Setup</h3>
          </div>

          <form onSubmit={handleStartInterviewSubmit} className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="mb-1 block text-[13px] font-bold text-slate-600">Your Name</label>
                <input 
                  type="text" 
                  placeholder="e.g. Enter your name" 
                  value={candidateName} 
                  onChange={(e) => setCandidateName(e.target.value)} 
                  className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition-colors focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                  required 
                />
              </div>
              <div>
                <label className="mb-1 block text-[13px] font-bold text-slate-600">Experience (Years)</label>
                <input 
                  type="text" 
                  placeholder="e.g. 2 years, Fresher" 
                  value={experience} 
                  onChange={(e) => setExperience(e.target.value)} 
                  className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition-colors focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                  required 
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-[13px] font-bold text-slate-600">Target Role</label>
              <input 
                type="text" 
                placeholder="e.g. Software Engineer, Data Science" 
                value={role} 
                onChange={(e) => setRole(e.target.value)} 
                className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition-colors focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                required 
              />
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="mb-1 block text-[13px] font-bold text-slate-600">Interview Mode</label>
                <select 
                  value={interviewMode} 
                  onChange={(e) => setInterviewMode(e.target.value)}
                  className="w-full cursor-pointer rounded-xl border border-slate-300 bg-white px-2.5 py-2.5 text-[12px] font-medium text-slate-900 outline-none transition-colors focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                >
                  <option value="Technical (Custom Rounds)">Technical (Custom)</option>
                  <option value="HR & Behavioral">HR & Behavioral</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-[13px] font-bold text-slate-600">Difficulty</label>
                <select 
                  value={difficulty} 
                  onChange={(e) => setDifficulty(e.target.value)}
                  className="w-full cursor-pointer rounded-xl border border-slate-300 bg-white px-2.5 py-2.5 text-[12px] font-medium text-slate-900 outline-none transition-colors focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                >
                  <option value="Beginner">Beginner</option>
                  <option value="Intermediate">Intermediate</option>
                  <option value="Advanced">Advanced</option>
                </select>
              </div>
            </div>

            {/* Custom Rounds Section */}
            {interviewMode === 'Technical (Custom Rounds)' ? (
              <div className={`rounded-xl border border-slate-200 bg-slate-50 p-3.5 relative ${isStarterOrFree ? 'opacity-70' : ''}`}>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-[13px] font-extrabold text-slate-800">⚙️ Select Rounds & Set Time (Minutes)</label>
                  {isStarterOrFree && (
                    <span className="text-[10px] bg-amber-500 text-white px-2 py-0.5 rounded font-bold">
                      🔒 Pro/Ultimate Required
                    </span>
                  )}
                </div>
                
                <div className={`flex flex-col gap-2.5 ${isStarterOrFree ? 'pointer-events-none filter blur-[0.4px]' : ''}`}>
                  <div className="flex items-center justify-between bg-white p-2.5 rounded-lg border border-slate-200">
                    <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-700">
                      <input 
                        type="checkbox" 
                        checked={aptitudeEnabled} 
                        onChange={(e) => setAptitudeEnabled(e.target.checked)} 
                        className="rounded text-emerald-600 focus:ring-emerald-500 h-4 w-4"
                      />
                      1. Aptitude (MCQ)
                    </label>
                    <input 
                      type="number" 
                      value={aptitudeTime} 
                      onChange={(e) => setAptitudeTime(e.target.value)} 
                      disabled={!aptitudeEnabled}
                      className="w-20 rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900 outline-none focus:border-emerald-500 disabled:opacity-40"
                      min="5" max="60"
                    />
                  </div>

                  {/* Technical Questions + System Design Sub-Checkbox */}
                  <div className="flex flex-col bg-white p-2.5 rounded-lg border border-slate-200 gap-2">
                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-700">
                        <input 
                          type="checkbox" 
                          checked={technicalEnabled} 
                          onChange={(e) => setTechnicalEnabled(e.target.checked)} 
                          className="rounded text-emerald-600 focus:ring-emerald-500 h-4 w-4"
                        />
                        2. Technical Questions
                      </label>
                      <input 
                        type="number" 
                        value={technicalTime} 
                        onChange={(e) => setTechnicalTime(e.target.value)} 
                        disabled={!technicalEnabled}
                        className="w-20 rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900 outline-none focus:border-emerald-500 disabled:opacity-40"
                        min="5" max="60"
                      />
                    </div>

                    {/* 🚀 System Design Checkbox inside Technical Round */}
                    {technicalEnabled && (
                      <div className="pl-6 pt-2 border-t border-slate-100 flex items-center justify-between">
                        <label className="flex items-center gap-2 cursor-pointer text-[11px] font-semibold text-slate-700">
                          <input 
                            type="checkbox" 
                            checked={systemDesignEnabled} 
                            onChange={(e) => setSystemDesignEnabled(e.target.checked)} 
                            className="rounded text-emerald-600 focus:ring-emerald-500 h-3.5 w-3.5"
                          />
                          🎯 Include System Design Questions
                        </label>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between bg-white p-2.5 rounded-lg border border-slate-200">
                    <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-700">
                      <input 
                        type="checkbox" 
                        checked={codingEnabled} 
                        onChange={(e) => setCodingEnabled(e.target.checked)} 
                        className="rounded text-emerald-600 focus:ring-emerald-500 h-4 w-4"
                      />
                      3. Coding Round
                    </label>
                    <input 
                      type="number" 
                      value={codingTime} 
                      onChange={(e) => setCodingTime(e.target.value)} 
                      disabled={!codingEnabled}
                      className="w-20 rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900 outline-none focus:border-emerald-500 disabled:opacity-40"
                      min="5" max="60"
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
                <label className="mb-2 block text-[13px] font-extrabold text-slate-800">⏱️ HR & Behavioral Round Duration (Minutes)</label>
                <input 
                  type="number" 
                  value={technicalTime} 
                  onChange={(e) => setTechnicalTime(e.target.value)} 
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 outline-none focus:border-emerald-500"
                  min="5" max="60"
                />
              </div>
            )}

            {/* Job Description */}
            <div className={`relative ${isStarterOrFree ? 'opacity-70' : ''}`}>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[13px] font-bold text-slate-600">Job Description (JD)</label>
                {isStarterOrFree && <span className="text-[10px] text-amber-600 font-bold">🔒 Pro Plan Feature</span>}
              </div>
              <textarea 
                placeholder={isStarterOrFree ? "Upgrade to Pro/Ultimate to customize JD context..." : "Paste job description here..."}
                value={jobDescription} 
                onChange={(e) => setJobDescription(e.target.value)} 
                disabled={isStarterOrFree}
                rows={2}
                className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 outline-none transition-colors focus:border-emerald-500 resize-none disabled:bg-slate-100"
              />
            </div>

            {/* Resume Upload */}
            <div className={`relative ${isStarterOrFree ? 'opacity-70' : ''}`}>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[13px] font-bold text-slate-600">Resume (Optional)</label>
                {isStarterOrFree && <span className="text-[10px] text-amber-600 font-bold">🔒 Pro Plan Feature</span>}
              </div>
              <div className="cursor-pointer rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-2.5 text-center transition-colors hover:bg-slate-100">
                <input 
                  type="file" 
                  onChange={(e) => setResume(e.target.files[0])} 
                  disabled={isStarterOrFree}
                  className="hidden" 
                  id="resume-upload" 
                />
                <label htmlFor="resume-upload" className="cursor-pointer text-xs font-bold text-emerald-600">
                  📁 {resume ? resume.name : (isStarterOrFree ? 'Resume upload locked in Starter Plan' : 'Click to upload resume')}
                </label>
              </div>
            </div>

            <button 
              type="submit" 
              disabled={loading}
              className="mt-1 w-full cursor-pointer rounded-xl border-0 bg-slate-900 p-3 text-[15px] font-bold text-white shadow-[0_6px_15px_rgba(15,23,42,0.2)] transition-all duration-300 hover:-translate-y-0.5 hover:scale-[1.02] hover:bg-slate-800 hover:shadow-[0_12px_25px_rgba(16,185,129,0.4)] disabled:opacity-70"
            >
              {loading ? 'Initializing AI & Rounds...' : 'Start Interview 🚀'}
            </button>
          </form>
        </div>

      </div>
    </div>
  );
}