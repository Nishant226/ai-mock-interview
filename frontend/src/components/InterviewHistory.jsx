import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { useNavigate } from 'react-router-dom';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
export default function InterviewHistory({ token, onBack }) {
  const navigate = useNavigate();
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedInterview, setSelectedInterview] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [userPlan, setUserPlan] = useState('FREE');

  // Fetch History strictly using JWT token & dynamic my-history endpoint
  const fetchHistory = async () => {
    try {
      const currentToken = token || localStorage.getItem('token') || localStorage.getItem('auth_token');

      // Fetch user profile to check plan
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

      const endpoint = `${API_URL}/api/interview/history/my-history`;

      const response = await axios.get(endpoint, {
        headers: currentToken ? { Authorization: `Bearer ${currentToken}` } : {}
      });

      if (response.data && response.data.history) {
        setHistory(response.data.history);
      } else if (Array.isArray(response.data)) {
        setHistory(response.data);
      }
    } catch (err) {
      console.error("❌ Error fetching interview history:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, [token]);

  // 🗑️ Handle Deleting a Specific Interview History Record
  const handleDelete = async (interviewId, e) => {
    e.stopPropagation();
    if (!window.confirm("Are you sure you want to delete this interview record?")) return;

    try {
      const currentToken = token || localStorage.getItem('token') || localStorage.getItem('auth_token');
      await axios.delete(`${API_URL}/api/interview/${interviewId}`, {
        headers: currentToken ? { Authorization: `Bearer ${currentToken}` } : {}
      });

      // Update state locally to remove deleted item instantly
      setHistory(prev => prev.filter(item => item._id !== interviewId));
      if (selectedInterview && selectedInterview._id === interviewId) {
        setSelectedInterview(null);
      }
    } catch (err) {
      console.error("❌ Error deleting interview:", err);
      alert("Failed to delete interview record.");
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 font-sans">
        <div className="text-center">
          <div className="mb-2.5 text-3xl animate-bounce">⏳</div>
          <h3 className="font-bold text-slate-900">Loading your interview history...</h3>
        </div>
      </div>
    );
  }

  // Calculate Overall Stats
  const totalSessions = history.length;
  const validScores = history.map(item => Number(item.finalReport?.totalScore || item.score || 0)).filter(s => s > 0);
  const averageScore = validScores.length > 0 ? (validScores.reduce((a, b) => a + b, 0) / validScores.length).toFixed(1) : '0.0';

  // Filter history based on search term
  const filteredHistory = history.filter(item => 
    (item.role || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (item.interviewMode || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Format data for Recharts
  const chartData = history.slice().reverse().map((item, index) => ({
    session: `Session ${index + 1}`,
    score: Number(item.finalReport?.totalScore || item.score || 0),
    role: item.role || 'Interview'
  }));

  const isUltimate = userPlan === 'ULTIMATE';

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8 font-sans">
      <div className="mx-auto max-w-[950px] flex flex-col gap-6">
        
        {/* Header & Back Button */}
        <div className="flex items-center justify-between border-b border-slate-200 pb-5">
          <div>
            <h2 className="mb-1 text-2xl font-black text-slate-900">📈 Performance & Interview History</h2>
            <p className="text-xs text-slate-500 font-medium">Review your past mock interviews, scores progression, and detailed transcripts.</p>
          </div>
          <button 
            onClick={onBack}
            className="cursor-pointer rounded-xl bg-slate-900 px-5 py-2.5 text-xs font-bold text-white transition-colors hover:bg-slate-800 shadow"
          >
            ← Back to Dashboard
          </button>
        </div>

        {/* 🔒 Ultimate Plan Notice Banner for Non-Ultimate Users */}
        {!isUltimate && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-3">
              <span className="text-2xl">👑</span>
              <div>
                <h4 className="text-xs font-extrabold text-amber-900">Unlock Unlimited History & Analytics</h4>
                <p className="text-[11px] text-amber-700 mt-0.5">Starter & Pro plans show recent logs. Upgrade to Ultimate Pack to unlock lifetime practice history access!</p>
              </div>
            </div>
            <button 
              onClick={() => navigate('/pricing')}
              className="cursor-pointer rounded-xl bg-amber-600 px-4 py-2 text-xs font-bold text-white hover:bg-amber-700 shadow-sm shrink-0"
            >
              Upgrade to Ultimate 🚀
            </button>
          </div>
        )}

        {history.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-[60px] text-center shadow-sm">
            <div className="mb-3 text-4xl">📂</div>
            <h3 className="font-bold text-slate-900 text-base">No past interviews found</h3>
            <p className="text-xs text-slate-500 mt-1">Complete your first mock interview session to track analytics and logs here!</p>
          </div>
        ) : (
          <>
            {/* 1. TOP STATS OVERVIEW CARDS */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm flex flex-col">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Total Sessions Logged</span>
                <strong className="text-2xl font-black text-slate-900 mt-1">{totalSessions} <span className="text-xs font-medium text-slate-400">Interviews</span></strong>
              </div>
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4 shadow-sm flex flex-col">
                <span className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider">Average Score</span>
                <strong className="text-2xl font-black text-emerald-800 mt-1">{averageScore} <span className="text-xs font-medium text-emerald-600">/ 10</span></strong>
              </div>
            </div>

            {/* 2. SCORE PROGRESSION TREND CHART */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="mb-4 text-sm font-bold text-slate-900 flex items-center gap-2">
                <span>📊</span> Score Progression Trend Over Time
              </h3>
              <div className="h-[240px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="session" stroke="#64748b" fontSize={11} />
                    <YAxis domain={[0, 10]} stroke="#64748b" fontSize={11} />
                    <Tooltip contentStyle={{ background: '#0f172a', color: '#fff', borderRadius: '10px', border: 'none', fontSize: '12px' }} />
                    <Line type="monotone" dataKey="score" stroke="#10b981" strokeWidth={3} dot={{ fill: '#10b981', r: 5 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* 3. SEARCH & FILTER BAR */}
            <div className="flex items-center gap-3">
              <input 
                type="text"
                placeholder="Search by role or interview mode..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs outline-none focus:border-blue-500 shadow-sm"
              />
            </div>

            {/* 4. SELECTED INTERVIEW TRANSCRIPT MODAL / DETAIL VIEW */}
            {selectedInterview && (
              <div className="rounded-2xl border-2 border-emerald-500 bg-white p-6 shadow-xl animate-in fade-in duration-200">
                <div className="mb-4 flex items-center justify-between pb-3 border-b border-slate-100">
                  <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                    <span>🔍</span> Transcript & Review: <span className="text-emerald-600">{selectedInterview.role}</span>
                  </h3>
                  <button 
                    onClick={() => setSelectedInterview(null)}
                    className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border-0 bg-slate-100 font-bold text-slate-500 hover:bg-slate-200"
                  >
                    ✕
                  </button>
                </div>
                <div className="mb-4 rounded-xl bg-slate-50 p-3.5 text-xs text-slate-700 border border-slate-200 leading-relaxed">
                  <strong>Executive Summary:</strong> {selectedInterview.finalReport?.summary || selectedInterview.summary || "Completed session successfully with professional intent."}
                </div>
                <div className="flex max-h-[380px] flex-col gap-3 overflow-y-auto pr-1">
                  {(selectedInterview.qaHistory || []).map((qa, i) => (
                    <div key={i} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm flex flex-col gap-2">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded uppercase">Question {i + 1} ({qa.roundType || 'Technical'})</span>
                        <span className="font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">Score: {qa.score}/10</span>
                      </div>
                      <div className="text-xs font-bold text-slate-900">{qa.question}</div>
                      <div className="rounded-lg bg-slate-50 p-2.5 text-xs text-slate-700 border border-slate-100 font-mono">
                        <strong>Response:</strong> {qa.answer || 'No answer recorded'}
                      </div>
                      <div className="text-[11px] font-semibold text-slate-600 bg-indigo-50/50 p-2 rounded border border-indigo-100/50">
                        <strong>Feedback:</strong> {qa.feedback}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 5. PAST INTERVIEWS LIST */}
            <div>
              <h3 className="mb-3 text-sm font-bold text-slate-900 flex items-center gap-2">
                <span>📜</span> Past Interview Logs ({filteredHistory.length})
              </h3>
              <div className="flex flex-col gap-3">
                {filteredHistory.map((item, idx) => (
                  <div key={item._id || idx} className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:border-slate-300 transition-all">
                    <div>
                      <div className="mb-1 text-sm font-extrabold text-slate-900">{item.role}</div>
                      <div className="text-xs text-slate-500 font-medium">
                        📅 {new Date(item.createdAt || Date.now()).toLocaleDateString()} &nbsp;•&nbsp; Mode: <span className="font-semibold text-slate-700">{item.interviewMode || 'Technical'}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <div className="text-[10px] font-bold text-slate-400 uppercase">Score</div>
                        <div className="text-base font-black text-emerald-600">{item.finalReport?.totalScore || item.score || '0'}/10</div>
                      </div>
                      <button 
                        onClick={() => setSelectedInterview(item)}
                        className="cursor-pointer rounded-xl bg-slate-100 px-3.5 py-2 text-xs font-bold text-slate-800 transition-colors hover:bg-slate-200"
                      >
                        View 👁️
                      </button>
                      <button 
                        onClick={(e) => handleDelete(item._id, e)}
                        className="cursor-pointer rounded-xl bg-rose-50 px-3 py-2 text-xs font-bold text-rose-600 transition-colors hover:bg-rose-100"
                        title="Delete this interview"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

      </div>
    </div>
  );
}