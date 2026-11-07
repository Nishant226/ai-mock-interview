import React, { useState, useEffect } from 'react';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export default function Profile({ token }) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  const fetchProfile = async () => {
    try {
      const res = await axios.get(`${API_URL}/api/auth/profile`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.data.success) {
        setProfile(res.data);
      }
    } catch (err) {
      console.error('Error fetching profile:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) fetchProfile();
  }, [token]);

  // Pack Active karne ka handler function
  const handleActivatePack = async (packId) => {
    try {
      const userId = profile.id;
      const res = await axios.post(`${API_URL}/api/auth/activate-pack`, {
        userId,
        packId
      });
      if (res.data.success) {
        setMessage(res.data.message);
        fetchProfile(); // Profile data turant refresh karein taaki UI update ho jaye
      }
    } catch (err) {
      console.error('Activation Error:', err);
      setMessage('Pack activate karne mein error aaya.');
    }
  };

  if (loading) {
    return <div className="text-white text-center p-8 text-lg">Loading Profile & Ledger... ⏳</div>;
  }

  return (
    <div className="max-w-4xl mx-auto p-6 text-white bg-slate-900 rounded-2xl shadow-2xl border border-slate-800 my-8">
      <h2 className="text-3xl font-extrabold mb-6 text-emerald-400">👤 User Profile & Multi-Pack Ledger</h2>
      
      {message && (
        <div className="mb-6 p-4 bg-emerald-950/80 border border-emerald-500 text-emerald-300 rounded-xl text-sm font-medium">
          {message}
        </div>
      )}
      
      {/* User Basic Info Card */}
      <div className="mb-8 p-6 bg-slate-800/80 rounded-2xl border border-slate-700/60 shadow-inner">
        <p className="text-xl font-semibold mb-1">Username: <span className="text-emerald-300">{profile?.username}</span></p>
        <p className="text-sm text-slate-400 mb-3">Email: {profile?.email}</p>
        <div className="flex items-center gap-4 mt-4 pt-4 border-t border-slate-700">
          <div>
            <span className="text-xs text-slate-400 uppercase tracking-wider block">Total Credits</span>
            <span className="text-2xl font-bold text-emerald-400">{profile?.credits}</span>
          </div>
          <div className="border-l border-slate-700 pl-4">
            <span className="text-xs text-slate-400 uppercase tracking-wider block">Active Plan Tier</span>
            <span className="text-2xl font-bold text-indigo-400">{profile?.planType}</span>
          </div>
        </div>
      </div>

      {/* Active Purchased Packs Ledger Section */}
      <h3 className="text-2xl font-bold mb-4 text-slate-200">📦 Your Active Purchased Packs</h3>
      
      {profile?.activePacks && profile.activePacks.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {profile.activePacks.map((pack) => {
            const isActive = pack._id === profile.currentActivePackId;
            return (
              <div 
                key={pack._id} 
                className={`p-6 rounded-2xl border transition-all duration-300 ${
                  isActive 
                    ? 'border-emerald-500 bg-emerald-950/20 shadow-lg shadow-emerald-900/20' 
                    : 'border-slate-700 bg-slate-800/50 hover:border-slate-600'
                }`}
              >
                <div className="flex justify-between items-center mb-3">
                  <span className="font-extrabold text-xl text-emerald-300 tracking-wide">{pack.planType} PACK</span>
                  {isActive && (
                    <span className="px-3 py-1 bg-emerald-500 text-slate-950 text-xs font-black rounded-full uppercase tracking-wider shadow">
                      ACTIVE 🔥
                    </span>
                  )}
                </div>
                
                <div className="space-y-1 mb-6 text-sm text-slate-300">
                  <p>Remaining Credits: <strong className="text-white text-base">{pack.remainingCredits}</strong> / {pack.totalCreditsGiven}</p>
                  <p className="text-xs text-slate-400">Purchased on: {new Date(pack.purchasedAt).toLocaleDateString()}</p>
                </div>
                
                {!isActive ? (
                  <button 
                    onClick={() => handleActivatePack(pack._id)}
                    className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl transition-all shadow-md cursor-pointer text-sm"
                  >
                    Activate for Interview 🚀
                  </button>
                ) : (
                  <div className="w-full py-2.5 bg-slate-800 text-emerald-400 text-center font-bold rounded-xl border border-emerald-500/30 text-sm">
                    Currently Selected ✅
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="p-8 text-center bg-slate-800/40 rounded-2xl border border-slate-800">
          <p className="text-slate-400 mb-2">You don't have any active pack in your ledger right now.</p>
          <a href="/pricing" className="inline-block mt-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl transition-all">
            Explore Pricing & Buy Packs 🛒
          </a>
        </div>
      )}
    </div>
  );
}