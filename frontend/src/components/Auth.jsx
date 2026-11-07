import React, { useState } from 'react';
import axios from 'axios';
import { auth, googleProvider } from '../firebase';
import { signInWithPopup } from 'firebase/auth';

// 🌍 Environment Variables Setup
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export default function Auth({ onLoginSuccess }) {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState(''); 
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);

  // Forgot Password States
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    const endpoint = isLogin ? '/api/auth/login' : '/api/auth/register';

    try {
      const payload = isLogin ? { identifier: email, password } : { username, email, password };
      const res = await axios.post(`${API_URL}${endpoint}`, payload);
      
      const token = res.data.token;
      if (token) {
        // Save user details to localStorage so Dashboard can pick them up instantly
        const savedUsername = res.data.username || res.data.user?.username || (!isLogin ? username : email.split('@')[0]);
        const savedEmail = res.data.email || res.data.user?.email || email;

        localStorage.setItem('auth_token', token);
        localStorage.setItem('token', token);
        localStorage.setItem('userName', savedUsername);
        localStorage.setItem('userEmail', savedEmail);
        localStorage.setItem('user', JSON.stringify(res.data));

        onLoginSuccess(token);
      } else {
        if (!isLogin) {
          alert('Registration successful! Please login.');
          setIsLogin(true);
        }
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;

      const res = await axios.post(`${API_URL}/api/auth/social-login`, {
        email: user.email,
        username: user.displayName || user.email.split('@')[0],
        googleId: user.uid
      });

      const token = res.data.token;
      if (token) {
        const savedUsername = res.data.username || res.data.user?.username || user.displayName || user.email.split('@')[0];
        const savedEmail = res.data.email || res.data.user?.email || user.email;

        localStorage.setItem('auth_token', token);
        localStorage.setItem('token', token);
        localStorage.setItem('userName', savedUsername);
        localStorage.setItem('userEmail', savedEmail);
        localStorage.setItem('user', JSON.stringify(res.data));

        onLoginSuccess(token);
      }
    } catch (err) {
      alert(err.response?.data?.message || err.message || 'Google login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPasswordSubmit = async (e) => {
    e.preventDefault();
    setForgotLoading(true);
    try {
      const res = await axios.post(`${API_URL}/api/auth/forgot-password`, { email: forgotEmail });
      alert(res.data.message);
      setShowForgotModal(false);
      setForgotEmail('');
    } catch (err) {
      alert(err.response?.data?.message || 'Some error occurred!');
    } finally {
      setForgotLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-6 font-sans relative">
      
      {/* Brand Header */}
      <div className="mb-10 flex items-center gap-3 text-3xl font-black tracking-tight text-slate-900">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-lg text-2xl">
          🤖
        </div>
        <span>InterviewIQ<span className="text-emerald-500">.AI</span></span>
      </div>

      {/* Auth Card */}
      <div className="w-full max-w-[440px] rounded-3xl border border-slate-200/80 bg-white p-8 shadow-[0_10px_30px_rgba(0,0,0,0.06)]">
        <h2 className="mb-3 text-2xl font-extrabold text-slate-900 tracking-tight">
          {isLogin ? 'Welcome Back 👋' : 'Create Account 🚀'}
        </h2>
        <p className="mb-8 text-sm text-slate-500 font-medium">
          {isLogin ? 'Login to continue your AI mock interview session.' : 'Sign up to start practicing technical interviews.'}
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          {!isLogin && (
            <div>
              <label className="mb-1.5 block text-xs font-bold text-slate-600 uppercase tracking-wider">Username</label>
              <input 
                type="text" 
                placeholder="Choose a unique username" 
                value={username} 
                onChange={(e) => setUsername(e.target.value)} 
                required 
                className="w-full rounded-xl border border-slate-300 bg-slate-50/50 px-4 py-3.5 text-sm text-slate-900 outline-none transition-all focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>
          )}

          <div>
            <label className="mb-1.5 block text-xs font-bold text-slate-600 uppercase tracking-wider">
              {isLogin ? 'Email or Username' : 'Email Address'}
            </label>
            <input 
              type={isLogin ? 'text' : 'email'} 
              placeholder={isLogin ? 'Enter your email or username' : 'name@example.com'} 
              value={email} 
              onChange={(e) => setEmail(e.target.value)} 
              required 
              className="w-full rounded-xl border border-slate-300 bg-slate-50/50 px-4 py-3.5 text-sm text-slate-900 outline-none transition-all focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Password</label>
              {!isLogin && <span className="text-xs text-emerald-600 font-semibold">Min. 8 characters</span>}
            </div>
            <div className="relative">
              <input 
                type={showPassword ? "text" : "password"} 
                placeholder="••••••••••••" 
                value={password} 
                onChange={(e) => setPassword(e.target.value)} 
                required 
                className="w-full rounded-xl border border-slate-300 bg-slate-50/50 px-4 py-3.5 pr-12 text-sm text-slate-900 outline-none transition-all focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
              />
              <button 
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 cursor-pointer text-slate-400 hover:text-emerald-600 focus:outline-none"
              >
                {showPassword ? 
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.223 6.223A10.463 10.463 0 0 1 12 4.5c4.756 0 8.774 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.223 6.223 3 3m18 18 3.774-3.774M16.21 16.21a5.5 5.5 0 0 1-7.778-7.778m7.778 7.778L12 12" /></svg> :
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /></svg>
                }
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between text-xs font-medium text-slate-600 mt-1">
            <label className="flex items-center gap-2 cursor-pointer group">
              <input 
                type="checkbox" 
                checked={rememberMe} 
                onChange={(e) => setRememberMe(e.target.checked)} 
                className="h-4 w-4 rounded border-slate-300 text-emerald-500 focus:ring-emerald-500 accent-emerald-500"
              />
              <span className="group-hover:text-emerald-700">Keep me signed in</span>
            </label>
            {isLogin && (
              <button 
                type="button" 
                onClick={() => setShowForgotModal(true)} 
                className="text-emerald-600 hover:underline font-semibold bg-transparent border-none cursor-pointer p-0"
              >
                Forgot Password?
              </button>
            )}
          </div>

          <button 
            type="submit" 
            disabled={loading}
            className="mt-3 w-full cursor-pointer rounded-xl bg-emerald-500 py-4 text-sm font-bold text-white shadow-md shadow-emerald-500/20 transition-all duration-300 hover:bg-emerald-600 hover:shadow-lg hover:shadow-emerald-500/30 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? 'Processing...' : (isLogin ? 'Sign In Securely' : 'Create Account')}
          </button>
        </form>

        {/* Divider */}
        <div className="my-8 flex items-center gap-4">
          <div className="h-px flex-1 bg-slate-200"></div>
          <span className="text-xs font-bold uppercase text-slate-400 tracking-wider px-1">OR</span>
          <div className="h-px flex-1 bg-slate-200"></div>
        </div>

        {/* Google Login */}
        <button 
          type="button" 
          onClick={handleGoogleLogin} 
          disabled={loading}
          className="flex w-full cursor-pointer items-center justify-center gap-3 rounded-xl border border-slate-300 bg-white py-3.5 text-sm font-bold text-slate-800 transition-all hover:bg-slate-50 hover:border-slate-400 active:scale-[0.98] disabled:opacity-60"
        >
          <img src="https://authjs.dev/img/providers/google.svg" alt="Google" className="w-5 h-5" />
          {isLogin ? 'Sign in with Google' : 'Continue with Google'}
        </button>

        {/* Switcher */}
        <p className="mt-8 text-center text-sm text-slate-600 font-medium">
          {isLogin ? "Don't have an account yet?" : "Already have an account?"}{' '}
          <span 
            onClick={() => setIsLogin(!isLogin)} 
            className="cursor-pointer font-bold text-emerald-600 hover:underline ml-1"
          >
            {isLogin ? 'Create One' : 'Login'}
          </span>
        </p>
      </div>

      {/* Forgot Password Modal */}
      {showForgotModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="text-xl font-black text-slate-900 mb-2">Reset Password 🔑</h3>
            <p className="text-sm text-slate-500 mb-4">Enter your registered email address, we will send the password reset link.</p>
            
            <form onSubmit={handleForgotPasswordSubmit} className="space-y-4">
              <input 
                type="email"
                required
                placeholder="name@example.com"
                value={forgotEmail}
                onChange={(e) => setForgotEmail(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm focus:border-emerald-500 focus:outline-none"
              />
              <div className="flex gap-3 justify-end">
                <button 
                  type="button"
                  onClick={() => setShowForgotModal(false)}
                  className="rounded-xl px-4 py-2.5 text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 cursor-pointer"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={forgotLoading}
                  className="rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-bold text-white hover:bg-emerald-600 cursor-pointer disabled:opacity-50"
                >
                  {forgotLoading ? 'Sending...' : 'Send Link'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <p className="mt-10 text-xs text-slate-400"> InterviewIQ.AI Platform</p>
    </div>
  );
}