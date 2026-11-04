import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { deleteUser } from 'firebase/auth';
import { auth } from '../firebase'; 

// 🌍 Environment Variables Setup
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export default function Dashboard({ token, onStartInterview, onLogout, onDeleteAccount, onViewHistory }) {
  const navigate = useNavigate();
  const [showDropdown, setShowDropdown] = useState(false);
  const [cardsOpen, setCardsOpen] = useState(false);
  const [activeFaq, setActiveFaq] = useState(null);
  
  // 🪙 User Credits State
  const [userCredits, setUserCredits] = useState(null);
  
  // Ref for Video & Sections to trigger via Intersection Observer / Scroll
  const videoSectionRef = useRef(null);
  const aboutRef = useRef(null);
  const pricingRef = useRef(null);
  const faqRef = useRef(null);

  // 🪙 Fetch user credits from backend on mount if token exists
  useEffect(() => {
    const fetchUserCredits = async () => {
      try {
        const tokenVal = localStorage.getItem('auth_token') || localStorage.getItem('token');
        if (tokenVal) {
          const base64Payload = tokenVal.split('.')[1];
          const payload = JSON.parse(atob(base64Payload));
          const userId = payload?.id || payload?.userId;
          
          if (userId) {
            const res = await axios.get(`${API_URL}/api/auth/credits/${userId}`);
            if (res.data && res.data.success) {
              setUserCredits(res.data.credits);
            }
          }
        }
      } catch (err) {
        console.error("Failed to fetch credits:", err);
      }
    };

    if (token) {
      fetchUserCredits();
    }
  }, [token]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setCardsOpen(true);
        }
      },
      { threshold: 0.3 }
    );

    if (videoSectionRef.current) {
      observer.observe(videoSectionRef.current);
    }

    return () => {
      if (videoSectionRef.current) {
        observer.unobserve(videoSectionRef.current);
      }
    };
  }, []);

  const scrollToSection = (elementRef) => {
    if (elementRef && elementRef.current) {
      elementRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  };

  // Footer Rotating Content State & Timer
  const [currentSlide, setCurrentSlide] = useState(0);
  const slides = [
    {
      tag: "BUILT AROUND YOU",
      titlePart1: "Your prep. ",
      titlePart2: "All in one place.",
      subtitle: "Practise, get feedback and feel ready for your next step."
    },
    {
      tag: "BUILT AROUND YOU",
      titlePart1: "Walk in with ",
      titlePart2: "confidence.",
      subtitle: "Turn every practice into a better next attempt."
    }
  ];

  useEffect(() => {
    const slideTimer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % slides.length);
    }, 4000);
    return () => clearInterval(slideTimer);
  }, [slides.length]);

  // Hero Section Dynamic Typo Animation
  const titles = ["AI Intelligence", "Technical Accuracy", "Soft Skills",];
  const [titleIndex, setTitleIndex] = useState(0);
  const [currentText, setCurrentText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [typingSpeed, setTypingSpeed] = useState(150);

  useEffect(() => {
    const fullText = titles[titleIndex];
    const handleTyping = () => {
      if (!isDeleting) {
        setCurrentText(fullText.substring(0, currentText.length + 1));
        if (currentText === fullText) {
          setTimeout(() => setIsDeleting(true), 1500);
        }
      } else {
        setCurrentText(fullText.substring(0, currentText.length - 1));
        if (currentText === "") {
          setIsDeleting(false);
          setTitleIndex((prev) => (prev + 1) % titles.length);
        }
      }
    };
    const timer = setTimeout(handleTyping, isDeleting ? 75 : typingSpeed);
    return () => clearTimeout(timer);
  }, [currentText, isDeleting, titleIndex]);

  // Helper to fetch Real User Details (Name & Email) from LocalStorage, JWT or Firebase
  const getUserDetails = () => {
    let email = localStorage.getItem('userEmail');
    let name = localStorage.getItem('userName') || localStorage.getItem('name');
    
    // 1. Check stored 'user' object JSON
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      try {
        const parsedUser = JSON.parse(storedUser);
        if (parsedUser?.email) email = parsedUser.email;
        if (parsedUser?.name) name = parsedUser.name;
        if (parsedUser?.username) name = parsedUser.username;
        if (parsedUser?.fullName) name = parsedUser.fullName;
      } catch (e) {}
    }

    // 2. Check JWT Token Payload
    const tokenVal = localStorage.getItem('auth_token') || localStorage.getItem('token');
    if ((!email || !name) && tokenVal) {
      try {
        const base64Payload = tokenVal.split('.')[1];
        const payload = JSON.parse(atob(base64Payload));
        if (payload?.email) email = payload.email;
        if (payload?.name) name = payload.name;
        if (payload?.username) name = payload.username;
      } catch (e) {}
    }

    // 3. Check Firebase Current User
    if (!email && auth.currentUser) {
      email = auth.currentUser.email;
      if (auth.currentUser.displayName) name = auth.currentUser.displayName;
    }

    // 4. Fallback: If name is missing, derive it from email prefix
    if (!name && email) {
      const emailPrefix = email.split('@')[0];
      name = emailPrefix.charAt(0).toUpperCase() + emailPrefix.slice(1);
    }

    return { 
      name: name || "User", 
      email: email || "user@interviewiq.ai" 
    };
  };

  const userDetails = getUserDetails();

  const handleStartInterviewClick = () => {
    if (!token) {
      onStartInterview(); 
      return;
    }
    navigate('/setup'); // Navigates to the interview setup page route
  };

  const scrollToHowItWorks = () => {
    const section = videoSectionRef.current;
    if (section) {
      section.scrollIntoView({ behavior: 'smooth' });
    }
  };

  // Robust Account Deletion Handler with Proper Error Handling & Feedback
  const handleDeleteAccountClick = async () => {
    if (!window.confirm("Do you want to permanently delete your account?")) {
      return;
    }

    try {
      let userEmail = localStorage.getItem('userEmail');

      if (!userEmail) {
        const storedUser = localStorage.getItem('user');
        if (storedUser) {
          try {
            const parsedUser = JSON.parse(storedUser);
            userEmail = parsedUser?.email || parsedUser?.userEmail;
          } catch (e) {}
        }
      }

      if (!userEmail) {
        const tokenVal = localStorage.getItem('auth_token') || localStorage.getItem('token');
        if (tokenVal) {
          try {
            const base64Payload = tokenVal.split('.')[1];
            const payload = JSON.parse(atob(base64Payload));
            userEmail = payload?.email;
          } catch (e) {
            console.error("Error decoding token", e);
          }
        }
      }

      if (!userEmail && auth.currentUser) {
        userEmail = auth.currentUser.email;
      }

      if (!userEmail) {
        alert("User email not found. Please log in again.");
        return;
      }

      await axios.delete(`${API_URL}/api/auth/delete-account/${userEmail}`);

      if (auth.currentUser) {
        try {
          await deleteUser(auth.currentUser);
        } catch (fbErr) {
          console.log("Firebase user delete skipped or requires recent login", fbErr);
        }
      }

      if (onDeleteAccount) {
        onDeleteAccount();
      }

      localStorage.clear();
      window.location.href = '/';

    } catch (err) {
      console.error("Delete error:", err);
      if (err.code === 'auth/requires-recent-login') {
        alert("For security reasons, please log out and log back in before deleting your account.");
      } else {
        alert("Failed to delete account. Please try again later.");
      }
    }
  };

  const faqs = [
    { 
      q: "Is InterviewIQ.AI free to try?", 
      a: "Yes, new users receive trial credits upon signing up so they can experience our live AI mock interviews and test out the evaluation feedback firsthand." 
    },
    { 
      q: "How does the voice interview work?", 
      a: "Our platform simulates real-time conversational interviews using advanced speech recognition and adaptive AI follow-up questions tailored dynamically to your responses." 
    },
    { 
      q: "What levels can I practice for?", 
      a: "We offer tailored preparation tracks ranging from beginner student internship preparation to fresher job roles and advanced senior-level interviews." 
    },
    { 
      q: "What roles can I practice for?", 
      a: "You can practice across multiple domains including software engineering, frontend/backend development, data science, DevOps, product management, and HR rounds." 
    },
    { 
      q: "What plans are available?", 
      a: "We offer flexible credit packs such as the Starter Pack, Pro Pack, and Ultimate Pack with zero monthly subscriptions—pay only for the interviews you take." 
    },
    { 
      q: "Will this actually help me crack interviews?", 
      a: "Absolutely! With deep technical accuracy scores, confidence tracking, resume-based context generation, and downloadable PDF performance reports, you gain the exact insights needed to master your actual job interviews." 
    }
  ];
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-20 overflow-x-hidden font-sans">
      
      {/* Advanced CSS Keyframes & Animations */}
      <style>{`
        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes floatBadge {
          0% { transform: translateY(0px); }
          50% { transform: translateY(-6px); }
          100% { transform: translateY(0px); }
        }
        @keyframes fadeInScroll {
          from { opacity: 0; transform: translateY(30px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeSlide {
          from { opacity: 0; transform: translateY(10px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        .animated-hero {
          animation: slideDown 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .floating-badge {
          animation: floatBadge 3s ease-in-out infinite;
        }
        .slide-fade {
          animation: fadeSlide 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .hover-card {
          transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .hover-card:hover {
          transform: translateY(-6px);
          box-shadow: 0 20px 30px -10px rgba(16, 185, 129, 0.15);
          border-color: #10b981 !important;
          background: #ffffff !important;
        }
        .start-btn {
          transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
          background-color: #0f172a;
          color: #ffffff;
        }
        .start-btn:hover {
          background-color: #10b981 !important;
          border-color: #10b981 !important;
          color: #ffffff !important;
          transform: translateY(-3px) scale(1.03);
          box-shadow: 0 15px 30px rgba(16, 185, 129, 0.35);
        }
        .start-btn:hover .rocket-icon {
          transform: translateY(-4px) rotate(10deg);
        }
        .rocket-icon {
          display: inline-block;
          transition: transform 0.3s ease;
        }
        .secondary-cta-btn {
          transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
          background-color: #ffffff;
          color: #0f172a;
        }
        .secondary-cta-btn:hover {
          background-color: #f1f5f9 !important;
          transform: translateY(-2px);
          box-shadow: 0 10px 20px rgba(15, 23, 42, 0.1);
        }
        .history-btn {
          transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
          background-color: #ffffff;
          color: #0f172a;
        }
        .history-btn:hover {
          background-color: #0f172a !important;
          color: #ffffff !important;
          transform: translateY(-2px) scale(1.02);
          box-shadow: 0 12px 25px rgba(15, 23, 42, 0.3);
        }
      `}</style>

      {/* Top Navbar with Clean Links (Point 1) */}
      <nav className="sticky top-0 z-50 flex items-center justify-between border-b border-slate-200 bg-white/85 px-[60px] py-[18px] backdrop-blur-md">
        <div className="flex items-center gap-2.5 text-[20px] font-extrabold tracking-tight cursor-pointer" onClick={() => window.scrollTo({top: 0, behavior: 'smooth'})}>
          <span className="rounded-[10px] bg-gradient-to-br from-slate-900 to-slate-700 px-3 py-2 text-[15px] text-white shadow-[0_4px_10px_rgba(0,0,0,0.1)]">🤖</span>
          InterviewIQ<span className="text-emerald-500">.AI</span>
        </div>
        
        <div className="hidden md:flex items-center gap-8 text-[15px] font-semibold text-slate-700">
          <button onClick={() => window.scrollTo({top: 0, behavior: 'smooth'})} className="hover:text-emerald-600 transition-colors cursor-pointer">Home</button>
          <button onClick={() => scrollToSection(aboutRef)} className="hover:text-emerald-600 transition-colors cursor-pointer">About</button>
          <button onClick={scrollToHowItWorks} className="hover:text-emerald-600 transition-colors cursor-pointer">How it works</button>
          <button onClick={() => scrollToSection(pricingRef)} className="hover:text-emerald-600 transition-colors cursor-pointer">Pricing</button>
          <button onClick={() => scrollToSection(faqRef)} className="hover:text-emerald-600 transition-colors cursor-pointer">FAQ</button>
        </div>

        <div className="relative flex items-center gap-5">
          {!token ? (
            <div className="flex items-center gap-3">
              <button 
                onClick={onStartInterview}
                className="cursor-pointer rounded-full border border-slate-300 bg-white px-5 py-2 text-[14px] font-bold text-slate-900"
              >
                Login
              </button>
              <button 
                onClick={onStartInterview}
                className="cursor-pointer rounded-full border-none bg-emerald-500 px-5 py-2 text-[14px] font-bold text-white shadow-[0_4px_12px_rgba(16,185,129,0.3)]"
              >
                Sign Up
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-4">
              <div className="hidden sm:flex items-center gap-2 rounded-full bg-emerald-50 border border-emerald-200 px-3.5 py-1 text-xs font-bold text-emerald-700 shadow-sm">
                <span>🪙 Credits:</span>
                <span className="text-sm font-black">{userCredits !== null ? userCredits : '...'}</span>
                <button 
                  onClick={() => navigate('/pricing')}
                  className="ml-1 cursor-pointer rounded-full bg-emerald-600 px-2.5 py-0.5 text-[11px] font-extrabold text-white shadow hover:bg-emerald-700 transition-colors"
                >
                  Buy ⚡
                </button>
              </div>

              <div className="relative">
                <div 
                  onClick={() => setShowDropdown(!showDropdown)}
                  className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-emerald-600 text-[15px] font-bold text-white shadow-[0_4px_12px_rgba(16,185,129,0.3)] hover:opacity-90 transition-opacity"
                >
                  {userDetails.name.charAt(0).toUpperCase()}
                </div>

                {showDropdown && (
                  <div className="absolute right-0 top-[50px] z-[101] w-[240px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_12px_35px_rgba(0,0,0,0.12)] slide-fade">
                    <div className="border-b border-slate-100 bg-slate-50/70 px-4 py-3">
                      <p className="text-[14px] font-bold text-slate-900 truncate">{userDetails.name}</p>
                      <p className="text-[12px] font-medium text-slate-500 truncate">{userDetails.email}</p>
                      <div className="mt-2 sm:hidden flex items-center justify-between text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-1.5 rounded">
                        <span>Credits: {userCredits !== null ? userCredits : '...'}</span>
                        <button 
                          onClick={() => navigate('/pricing')}
                          className="bg-emerald-600 text-white px-2 py-0.5 rounded text-[10px]"
                        >
                          Buy ⚡
                        </button>
                      </div>
                    </div>

                    <div className="py-1">
                      {onViewHistory && (
                        <button 
                          onClick={() => { setShowDropdown(false); onViewHistory(); }}
                          className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-[14px] font-medium text-slate-700 hover:bg-slate-100/80 transition-colors cursor-pointer"
                        >
                          <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"></path>
                          </svg>
                          History & Stats
                        </button>
                      )}

                      {/* 👤 YAHAN PROFILE BUTTON ADD KAREIN 👇 */}
                       <button 
                       onClick={() => { setShowDropdown(false); navigate('/profile'); }}
                       className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-[14px] font-medium text-slate-700 hover:bg-slate-100/80 transition-colors cursor-pointer"
      >
                      <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path>
                     </svg>
                      My Profile & Packs
                      </button>
                      <button 
                        onClick={() => { setShowDropdown(false); if(onLogout) onLogout(); }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-[14px] font-medium text-slate-700 hover:bg-slate-100/80 transition-colors cursor-pointer"
                      >
                        <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path>
                        </svg>
                        Logout
                      </button>
                    </div>

                    <div className="border-t border-slate-100 py-1 bg-red-50/30">
                      <button 
                        onClick={() => { 
                          setShowDropdown(false); 
                          handleDeleteAccountClick();
                        }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-[14px] font-medium text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                      >
                        <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                        </svg>
                        Delete Account
                      </button>
                    </div>

                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </nav>

      {/* Hero Section */}
      <div className="animated-hero text-center px-5 pt-[90px] pb-10">
        <div className="floating-badge mb-[25px] inline-block rounded-[30px] border border-emerald-200 bg-emerald-50 px-[18px] py-2 text-[13px] font-bold text-emerald-600">
          ✨ AI Powered Smart Interview Platform
        </div>
        
        <h1 className="mb-5 text-[56px] font-black leading-[1.15] tracking-[-1px] text-slate-900">
          Practice Interviews with <br />
          <span className="bg-gradient-to-r from-emerald-500 to-emerald-600 bg-clip-text text-transparent">
            {currentText}
          </span>
          <span className="border-r-4 border-emerald-500 animate-pulse"></span>
        </h1>

        <p className="mx-auto mb-10 max-w-[650px] text-[17px] leading-[1.6] text-slate-500">
          Role-based mock interviews with smart follow-ups, adaptive difficulty, resume-driven evaluation, and real-time performance analytics.
        </p>

        <div className="flex flex-wrap justify-center gap-[15px]">
          <button 
            onClick={handleStartInterviewClick}
            className="start-btn flex cursor-pointer items-center gap-2 rounded-[35px] border-2 border-slate-900 px-[42px] py-4 text-[16px] font-bold shadow-[0_10px_25px_rgba(15,23,42,0.1)]"
          >
            Start Interview <span className="rocket-icon">🚀</span>
          </button>

          {!token && (
            <button 
              onClick={scrollToHowItWorks}
              className="secondary-cta-btn cursor-pointer rounded-[35px] border-2 border-slate-300 px-9 py-4 text-[16px] font-bold shadow-[0_10px_25px_rgba(15,23,42,0.05)]"
            >
              🔍 How It Works
            </button>
          )}

          {token && onViewHistory && (
            <button 
              onClick={onViewHistory}
              className="history-btn cursor-pointer rounded-[35px] border-2 border-slate-900 px-9 py-4 text-[16px] font-bold shadow-[0_10px_25px_rgba(15,23,42,0.1)]"
            >
              📈 My History
            </button>
          )}
        </div>
      </div>
       
      {/* How It Works Section (Clean 3-Column Modern Layout) */}
      <div ref={videoSectionRef} className="mx-auto my-[90px] max-w-[1200px] px-5">
        <div className="text-center mb-16">
          <span className="inline-block text-emerald-600 text-xs font-extrabold uppercase tracking-widest bg-emerald-50 border border-emerald-200 px-4 py-1.5 rounded-full shadow-sm">
            STEP BY STEP
          </span>
          <h2 className="text-4xl md:text-5xl font-black text-slate-900 mt-4 tracking-tight">
            How It <span className="text-emerald-500">Works</span>
          </h2>
          <p className="text-slate-500 text-base md:text-lg mt-3 max-w-xl mx-auto font-medium">
            Get interview-ready in three simple steps with our intelligent AI platform.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-stretch">
          
          {/* Step 01 */}
          <div className="hover-card rounded-3xl border border-slate-200 bg-white p-8 flex flex-col justify-between shadow-lg shadow-slate-100 transition-all duration-300">
            <div>
              <div className="flex items-center justify-between mb-6">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-600 font-black text-xl shadow-inner">
                  01
                </div>
                <span className="text-2xl">⚙️</span>
              </div>
              <h3 className="text-2xl font-black text-slate-900 mb-3 tracking-tight">
                Role & Experience Setup
              </h3>
              <p className="text-slate-500 text-sm leading-relaxed font-normal">
                Select your target job title, seniority level, and upload an optional resume for personalized custom questions.
              </p>
            </div>
            
            <div className="border-t border-slate-100 pt-5 mt-6 text-xs font-bold text-emerald-600 flex items-center gap-2">
              <span>⚡ Tailored to your profile</span>
            </div>
          </div>

          {/* Step 02 (Highlighted Most Popular Style) */}
          <div className="hover-card rounded-3xl border-2 border-emerald-500 bg-white p-8 flex flex-col justify-between shadow-2xl shadow-emerald-500/10 transition-all duration-300 relative">
            <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 rounded-full bg-emerald-500 px-3.5 py-0.5 text-[11px] font-black text-white shadow uppercase tracking-wider">
              Live Simulation
            </div>
            <div>
              <div className="flex items-center justify-between mb-6">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500 text-white font-black text-xl shadow-md">
                  02
                </div>
                <span className="text-2xl">🎙️</span>
              </div>
              <h3 className="text-2xl font-black text-slate-900 mb-3 tracking-tight">
                AI Voice & Text Simulation
              </h3>
              <p className="text-slate-500 text-sm leading-relaxed font-normal">
                Engage in a live interactive interview with real-time speech recognition and adaptive follow-ups tailored to your replies.
              </p>
            </div>
            
            <div className="border-t border-slate-100 pt-5 mt-6 text-xs font-bold text-emerald-600 flex items-center gap-2">
              <span>⚡ Conversational & dynamic</span>
            </div>
          </div>

          {/* Step 03 */}
          <div className="hover-card rounded-3xl border border-slate-200 bg-white p-8 flex flex-col justify-between shadow-lg shadow-slate-100 transition-all duration-300">
            <div>
              <div className="flex items-center justify-between mb-6">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-600 font-black text-xl shadow-inner">
                  03
                </div>
                <span className="text-2xl">📊</span>
              </div>
              <h3 className="text-2xl font-black text-slate-900 mb-3 tracking-tight">
                Instant Evaluation & Report
              </h3>
              <p className="text-slate-500 text-sm leading-relaxed font-normal">
                Receive deep scoring on technical accuracy, confidence analytics, and download comprehensive PDF performance reports.
              </p>
            </div>
            
            <div className="border-t border-slate-100 pt-5 mt-6 text-xs font-bold text-emerald-600 flex items-center gap-2">
              <span>⚡ Actionable insights</span>
            </div>
          </div>

        </div>
      </div>

      
      {/* Smart Platform Features Heading */}
      <div className="my-[70px] mb-12 text-center">
        <span className="inline-block text-emerald-600 text-xs font-extrabold uppercase tracking-widest bg-emerald-50 border border-emerald-200 px-4 py-1.5 rounded-full shadow-sm mb-3">
          CORE HIGHLIGHTS
        </span>
        <h2 className="text-3xl md:text-5xl font-black tracking-tight text-slate-900">
          Powered by <span className="text-emerald-500">Smart AI Features</span>
        </h2>
        <p className="text-slate-500 text-base mt-3 max-w-xl mx-auto font-medium">
          Everything you need to practice smarter, evaluate accurately, and clear your interviews with absolute confidence.
        </p>
      </div>

      {/* Smart Platform Features Grid */}
      <div className="mx-auto max-w-[1150px] px-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          
          {/* Card 1 */}
          <div className="hover-card flex items-center justify-between gap-5 rounded-[24px] border border-slate-200 bg-white p-8 shadow-sm transition-all duration-300">
            <div>
              <h3 className="mb-2 text-xl font-black text-slate-900 tracking-tight">AI Answer Evaluation</h3>
              <p className="text-sm leading-relaxed text-slate-500 font-normal">Scores communication, technical accuracy, and confidence instantly.</p>
            </div>
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-emerald-100 bg-emerald-50/80 text-2xl shadow-inner transition-transform duration-300 hover:scale-110">📊</div>
          </div>

          {/* Card 2 */}
          <div className="hover-card flex items-center justify-between gap-5 rounded-[24px] border border-slate-200 bg-white p-8 shadow-sm transition-all duration-300">
            <div>
              <h3 className="mb-2 text-xl font-black text-slate-900 tracking-tight">Resume Based Interview</h3>
              <p className="text-sm leading-relaxed text-slate-500 font-normal">Project-specific deep dive questions generated from your uploaded resume.</p>
            </div>
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-emerald-100 bg-emerald-50/80 text-2xl shadow-inner transition-transform duration-300 hover:scale-110">📄</div>
          </div>

          {/* Card 3 */}
          <div className="hover-card flex items-center justify-between gap-5 rounded-[24px] border border-slate-200 bg-white p-8 shadow-sm transition-all duration-300">
            <div>
              <h3 className="mb-2 text-xl font-black text-slate-900 tracking-tight">Download Performance Reports</h3>
              <p className="text-sm leading-relaxed text-slate-500 font-normal">Export detailed interview evaluation reports in PDF format instantly.</p>
            </div>
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-emerald-100 bg-emerald-50/80 text-2xl shadow-inner transition-transform duration-300 hover:scale-110">📥</div>
          </div>

          {/* Card 4 */}
          <div className="hover-card flex items-center justify-between gap-5 rounded-[24px] border border-slate-200 bg-white p-8 shadow-sm transition-all duration-300">
            <div>
              <h3 className="mb-2 text-xl font-black text-slate-900 tracking-tight">Multiple Roles & Domains</h3>
              <p className="text-sm leading-relaxed text-slate-500 font-normal">Practice Software Development, HR, DevOps, Data Science, and more.</p>
            </div>
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-emerald-100 bg-emerald-50/80 text-2xl shadow-inner transition-transform duration-300 hover:scale-110">💼</div>
          </div>

          {/* Card 5 */}
          <div className="hover-card flex items-center justify-between gap-5 rounded-[24px] border border-slate-200 bg-white p-8 shadow-sm transition-all duration-300">
            <div>
              <h3 className="mb-2 text-xl font-black text-slate-900 tracking-tight">Real-Time Analytics & History</h3>
              <p className="text-sm leading-relaxed text-slate-500 font-normal">Track your interview score progress and performance history trends easily.</p>
            </div>
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-emerald-100 bg-emerald-50/80 text-2xl shadow-inner transition-transform duration-300 hover:scale-110">📈</div>
          </div>

          {/* Card 6 */}
          <div className="hover-card flex items-center justify-between gap-5 rounded-[24px] border border-slate-200 bg-white p-8 shadow-sm transition-all duration-300">
            <div>
              <h3 className="mb-2 text-xl font-black text-slate-900 tracking-tight">Webcam & OpenCV Detection</h3>
              <p className="text-sm leading-relaxed text-slate-500 font-normal">Real-time face tracking, proctoring, and body language analysis.</p>
            </div>
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-emerald-100 bg-emerald-50/80 text-2xl shadow-inner transition-transform duration-300 hover:scale-110">📷</div>
          </div>

        </div>
      </div>

      {/* Choose Your Level Section */}
      <div ref={aboutRef} className="mx-auto max-w-[1200px] px-5 py-20">
        <div className="text-center mb-16">
          <span className="inline-block text-emerald-600 text-xs font-extrabold uppercase tracking-widest bg-emerald-50 border border-emerald-200 px-4 py-1.5 rounded-full shadow-sm">
            AI INTERVIEW PRACTICE
          </span>
          <h2 className="text-4xl md:text-5xl font-black text-slate-900 mt-4 tracking-tight">
            Choose Your <span className="text-emerald-500">Level</span>
          </h2>
          <p className="text-slate-500 text-base md:text-lg mt-3 max-w-2xl mx-auto font-medium">
            Practice live AI-powered mock interviews, get real-time feedback, and improve your skills to ace your next job interview with confidence.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-stretch">
          
          {/* Internship Preparation */}
          <div className="hover-card rounded-3xl border border-slate-200 bg-white p-8 flex flex-col justify-between shadow-lg shadow-slate-100 transition-all duration-300">
            <div>
              <div className="mb-5">
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-sky-700 bg-sky-50 border border-sky-200 px-3.5 py-1.5 rounded-full">
                  <span className="h-1.5 w-1.5 rounded-full bg-sky-500"></span> For Complete Beginners
                </span>
              </div>
              <h3 className="text-2xl font-black text-slate-900 mb-3 tracking-tight">
                Internship Preparation
              </h3>
              <p className="text-slate-500 text-sm leading-relaxed mb-8 font-normal">
                Get ready for internship interviews with basic questions, aptitude rounds, and college project discussions.
              </p>
            </div>
            
            <ul className="space-y-3.5 text-xs font-semibold text-slate-700 border-t border-slate-100 pt-6">
              <li className="flex items-center gap-2.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 text-[11px]">✓</span> 
                <span>Basic DSA & aptitude</span>
              </li>
              <li className="flex items-center gap-2.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 text-[11px]">✓</span> 
                <span>HR & behavioral questions</span>
              </li>
              <li className="flex items-center gap-2.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 text-[11px]">✓</span> 
                <span>College project discussion</span>
              </li>
              <li className="flex items-center gap-2.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 text-[11px]">✓</span> 
                <span>Easy difficulty</span>
              </li>
            </ul>
          </div>

          {/* Fresher Job Preparation */}
          <div className="hover-card rounded-3xl border-2 border-emerald-500 bg-white p-8 flex flex-col justify-between shadow-2xl shadow-emerald-500/10 transition-all duration-300">
            <div>
              <div className="mb-5">
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3.5 py-1.5 rounded-full">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span> For New Joinee
                </span>
              </div>
              <h3 className="text-2xl font-black text-slate-900 mb-3 tracking-tight">
                Fresher Job Preparation
              </h3>
              <p className="text-slate-500 text-sm leading-relaxed mb-8 font-normal">
                Prepare for your first job interview with fundamental questions, final year project deep-dives, and role-specific technical rounds.
              </p>
            </div>
            
            <ul className="space-y-3.5 text-xs font-semibold text-slate-700 border-t border-slate-100 pt-6">
              <li className="flex items-center gap-2.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white text-[11px]">✓</span> 
                <span>Core fundamentals (OOP, DBMS, OS)</span>
              </li>
              <li className="flex items-center gap-2.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white text-[11px]">✓</span> 
                <span>Final year project questions</span>
              </li>
              <li className="flex items-center gap-2.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white text-[11px]">✓</span> 
                <span>Role-specific technical questions</span>
              </li>
              <li className="flex items-center gap-2.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white text-[11px]">✓</span> 
                <span>Easy to medium difficulty</span>
              </li>
            </ul>
          </div>

          {/* Experienced Job Preparation */}
          <div className="hover-card rounded-3xl border border-slate-200 bg-white p-8 flex flex-col justify-between shadow-lg shadow-slate-100 transition-all duration-300">
            <div>
              <div className="mb-5">
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-purple-700 bg-purple-50 border border-purple-200 px-3.5 py-1.5 rounded-full">
                  <span className="h-1.5 w-1.5 rounded-full bg-purple-500"></span> For Experienced Individuals
                </span>
              </div>
              <h3 className="text-2xl font-black text-slate-900 mb-3 tracking-tight">
                Experienced Job Preparation
              </h3>
              <p className="text-slate-500 text-sm leading-relaxed mb-8 font-normal">
                Sharpen skills to crack experienced-level interviews with scenario-based questions, system design, and leadership rounds.
              </p>
            </div>
            
            <ul className="space-y-3.5 text-xs font-semibold text-slate-700 border-t border-slate-100 pt-6">
              <li className="flex items-center gap-2.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 text-[11px]">✓</span> 
                <span>Scenario & situational questions</span>
              </li>
              <li className="flex items-center gap-2.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 text-[11px]">✓</span> 
                <span>System design rounds</span>
              </li>
              <li className="flex items-center gap-2.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 text-[11px]">✓</span> 
                <span>Leadership & conflict resolution</span>
              </li>
              <li className="flex items-center gap-2.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 text-[11px]">✓</span> 
                <span>Easy to Hard progression</span>
              </li>
            </ul>
          </div>

        </div>
      </div>

      {/* About Us / Why Choose Us Section */}
      <div className="mx-auto max-w-[1200px] px-5 py-20 my-10 bg-slate-50/60 rounded-[32px] border border-slate-200/80 shadow-sm">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          
          {/* Left Column: Vision & Heading */}
          <div>
            <span className="inline-block text-emerald-600 text-xs font-extrabold uppercase tracking-widest bg-emerald-100/70 border border-emerald-200 px-4 py-1.5 rounded-full shadow-sm mb-4">
              ABOUT INTERVIEWIQ.AI
            </span>
            <h2 className="text-3xl md:text-5xl font-black text-slate-900 tracking-tight leading-[1.2] mb-6">
              Empowering Job Seekers with <span className="text-emerald-500">Real-Time AI Intelligence</span>
            </h2>
            <p className="text-slate-600 text-base md:text-lg leading-relaxed mb-6 font-normal">
              InterviewIQ.AI is designed to bridge the gap between preparation and performance. We provide an interactive, pressure-free environment where candidates can practice realistic mock interviews, receive instant feedback, and build unwavering confidence.
            </p>
            <p className="text-slate-500 text-sm leading-relaxed font-normal mb-8">
              Whether you are a complete beginner aiming for your first internship or an experienced developer cracking senior technical rounds, our adaptive AI tailors every question to your experience level and resume.
            </p>

            {/* Quick Stats */}
            <div className="grid grid-cols-3 gap-4 border-t border-slate-200 pt-6">
              <div>
                <h4 className="text-2xl md:text-3xl font-black text-emerald-600">10k+</h4>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mt-1">Interviews Taken</p>
              </div>
              <div>
                <h4 className="text-2xl md:text-3xl font-black text-emerald-600">95%</h4>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mt-1">Accuracy Score</p>
              </div>
              <div>
                <h4 className="text-2xl md:text-3xl font-black text-emerald-600">24/7</h4>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mt-1">AI Availability</p>
              </div>
            </div>
          </div>

          {/* Right Column: Key Value Pillars */}
          <div className="space-y-4">
            
            <div className="rounded-2xl bg-white p-6 border border-slate-200 shadow-sm flex items-start gap-4 transition-all duration-300 hover:shadow-md">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 font-bold text-xl border border-emerald-100">
                🎯
              </div>
              <div>
                <h3 className="text-lg font-black text-slate-900 mb-1">Targeted Skill Evaluation</h3>
                <p className="text-xs md:text-sm text-slate-500 leading-relaxed font-normal">
                  Get precise feedback on communication skills, technical accuracy, confidence metrics, and body language during mock sessions.
                </p>
              </div>
            </div>

            <div className="rounded-2xl bg-white p-6 border border-slate-200 shadow-sm flex items-start gap-4 transition-all duration-300 hover:shadow-md">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 font-bold text-xl border border-emerald-100">
                🚀
              </div>
              <div>
                <h3 className="text-lg font-black text-slate-900 mb-1">Resume-Based Personalization</h3>
                <p className="text-xs md:text-sm text-slate-500 leading-relaxed font-normal">
                  Our system scans your resume projects and tech stack to ask deep-dive technical questions tailored specifically to your background.
                </p>
              </div>
            </div>

            <div className="rounded-2xl bg-white p-6 border border-slate-200 shadow-sm flex items-start gap-4 transition-all duration-300 hover:shadow-md">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 font-bold text-xl border border-emerald-100">
                ⚡
              </div>
              <div>
                <h3 className="text-lg font-black text-slate-900 mb-1">Instant Performance Insights</h3>
                <p className="text-xs md:text-sm text-slate-500 leading-relaxed font-normal">
                  Download structured PDF reports immediately after your interview to analyze strengths, weaknesses, and key areas of improvement.
                </p>
              </div>
            </div>

          </div>

        </div>
      </div>

      {/* Flexible Pricing & Credit Packages Section (Point 3) */}
      <div ref={pricingRef} className="mx-auto max-w-6xl px-5 py-16">
        <div className="text-center pt-10 pb-10">
          <div className="mb-4 inline-block rounded-full bg-emerald-50 border border-emerald-200 px-4 py-1.5 text-xs font-bold text-emerald-700">
            🪙 Flexible Pricing & Credit Packages
          </div>
          <h1 className="text-4xl md:text-5xl font-black text-slate-900 tracking-tight mb-4">
            Upgrade Your Interview <span className="text-emerald-500">Preparation</span>
          </h1>
          <p className="max-w-2xl mx-auto text-slate-500 text-base">
            Choose a credit pack that fits your preparation goals. Pay only for what you use, with zero subscriptions or hidden fees.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-stretch">
          <div className="relative flex flex-col justify-between rounded-3xl p-8 border border-slate-200 bg-white shadow-lg">
            <div>
              <div className="flex justify-between items-center mb-2">
                <h3 className="text-xl font-black text-slate-900">Starter Pack</h3>
                <span className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">Quick Prep</span>
              </div>
              <p className="text-xs text-slate-500 mb-6">Ideal for a quick practice before an interview.</p>
              <div className="mb-6 bg-slate-50 p-4 rounded-2xl border border-slate-100 flex items-baseline gap-2">
                <span className="text-4xl font-black text-slate-900">₹99</span>
                <span className="text-xs font-extrabold text-emerald-600">/ 2 Credits (50₹ per interview)</span>
              </div>
              <ul className="space-y-3 mb-8 text-sm text-slate-600">
                <li className="flex items-center gap-2.5"><span className="text-emerald-600 font-bold">✓</span> 2 Full AI Mock Interviews</li>
                <li className="flex items-center gap-2.5"><span className="text-emerald-600 font-bold">✓</span> Instant Detailed Evaluation & Feedback</li>
                <li className="flex items-center gap-2.5"><span className="text-emerald-600 font-bold">✓</span> Download PDF Performance Report</li>
              </ul>
            </div>
            <button onClick={() => navigate('/pricing')} className="w-full py-3.5 px-6 rounded-2xl font-extrabold text-sm bg-slate-900 text-white hover:bg-slate-800 transition-all cursor-pointer">
              Get 2 Credits 🚀
            </button>
          </div>

          <div className="relative flex flex-col justify-between rounded-3xl p-8 border-2 border-emerald-500 bg-white shadow-2xl scale-105 z-10">
            <div className="absolute -top-4 left-1/2 -translate-x-1/2 rounded-full bg-emerald-500 px-4 py-1 text-xs font-extrabold text-white shadow-md">
              Most Popular 🔥
            </div>
            <div>
              <div className="flex justify-between items-center mb-2">
                <h3 className="text-xl font-black text-slate-900">Pro Pack</h3>
              </div>
              <p className="text-xs text-slate-500 mb-6">Best value for active job seekers looking for comprehensive prep.</p>
              <div className="mb-6 bg-slate-50 p-4 rounded-2xl border border-slate-100 flex items-baseline gap-2">
                <span className="text-4xl font-black text-slate-900">₹199</span>
                <span className="text-xs font-extrabold text-emerald-600">/ 5 Credits (40₹ per interview)</span>
              </div>
              <ul className="space-y-3 mb-8 text-sm text-slate-600">
                <li className="flex items-center gap-2.5"><span className="text-emerald-600 font-bold">✓</span> 5 Full AI Mock Interviews</li>
                <li className="flex items-center gap-2.5"><span className="text-emerald-600 font-bold">✓</span> Custom Round Configuration (MCQ, Tech, Coding)</li>
                <li className="flex items-center gap-2.5"><span className="text-emerald-600 font-bold">✓</span> Resume & JD Contextual Question Generation</li>
                <li className="flex items-center gap-2.5"><span className="text-emerald-600 font-bold">✓</span> Download PDF Performance Report</li>
                <li className="flex items-center gap-2.5"><span className="text-emerald-600 font-bold">✓</span> Priority AI Response Generation</li>
              </ul>
            </div>
            <button onClick={() => navigate('/pricing')} className="w-full py-3.5 px-6 rounded-2xl font-extrabold text-sm bg-emerald-500 text-white hover:bg-emerald-600 transition-all cursor-pointer shadow-lg shadow-emerald-500/30">
              Get 5 Credits 🚀
            </button>
          </div>

          <div className="relative flex flex-col justify-between rounded-3xl p-8 border border-slate-200 bg-white shadow-lg">
            <div>
              <div className="flex justify-between items-center mb-2">
                <h3 className="text-xl font-black text-slate-900">Ultimate Pack</h3>
                <span className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">Best Value</span>
              </div>
              <p className="text-xs text-slate-500 mb-6">For candidates aiming for top tier companies and multiple roles.</p>
              <div className="mb-6 bg-slate-50 p-4 rounded-2xl border border-slate-100 flex items-baseline gap-2">
                <span className="text-4xl font-black text-slate-900">₹499</span>
                <span className="text-xs font-extrabold text-emerald-600">/ 15 Credits (33₹ per interview)</span>
              </div>
              <ul className="space-y-3 mb-8 text-sm text-slate-600">
                <li className="flex items-center gap-2.5"><span className="text-emerald-600 font-bold">✓</span> 15 Full AI Mock Interviews</li>
                <li className="flex items-center gap-2.5"><span className="text-emerald-600 font-bold">✓</span> All Pro Features Included</li>
                <li className="flex items-center gap-2.5"><span className="text-emerald-600 font-bold">✓</span> Unlimited Retry & Practice History Access</li>
                <li className="flex items-center gap-2.5"><span className="text-emerald-600 font-bold">✓</span> Advanced Proctoring & OpenCV Feedback</li>
                <li className="flex items-center gap-2.5"><span className="text-emerald-600 font-bold">✓</span> 24/7 Priority Support[cite: 9]</li>
              </ul>
            </div>
            <button onClick={() => navigate('/pricing')} className="w-full py-3.5 px-6 rounded-2xl font-extrabold text-sm bg-slate-900 text-white hover:bg-slate-800 transition-all cursor-pointer">
              Get 15 Credits 🚀
            </button>
          </div>
        </div>
      </div>

      {/* FAQ Section with Expandable Accordions */}
      <div ref={faqRef} className="mx-auto max-w-4xl px-5 py-16">
        <div className="text-center mb-10">
          <span className="text-emerald-600 text-xs font-extrabold uppercase tracking-widest bg-emerald-50 border border-emerald-200 px-3.5 py-1 rounded-full">FAQ</span>
          <h2 className="text-3xl md:text-4xl font-black text-slate-900 mt-3">Got questions?</h2>
        </div>

        <div className="space-y-4">
          {faqs.map((faq, index) => (
            <div key={index} className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm transition-all">
              <button 
                onClick={() => setActiveFaq(activeFaq === index ? null : index)}
                className="w-full flex items-center justify-between p-6 text-left font-bold text-slate-900 text-base cursor-pointer hover:text-emerald-600"
              >
                <span>{faq.q}</span>
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 text-lg font-bold">
                  {activeFaq === index ? '-' : '+'}
                </span>
              </button>
              {activeFaq === index && (
                <div className="px-6 pb-6 text-slate-500 text-sm leading-relaxed border-t border-slate-100 pt-4">
                  {faq.a}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

  {/* FOOTER AUTO-ROTATING SECTION */}
      <div className="mx-auto mt-12 mb-16 max-w-[900px] px-5 text-center">
        <div key={currentSlide} className="slide-fade py-10 px-5">
          <div className="mb-4 inline-block text-[13px] font-extrabold uppercase tracking-widest text-emerald-600">
            {slides[currentSlide].tag}
          </div>
          <h2 className="mb-4 text-[44px] font-black tracking-tight text-slate-900 leading-[1.2]">
            {slides[currentSlide].titlePart1}
            <span className="text-emerald-500">
              {slides[currentSlide].titlePart2}
            </span>
          </h2>
          <p className="mx-auto max-w-[600px] text-[18px] text-slate-500 font-medium">
            {slides[currentSlide].subtitle}
          </p>
        </div>
        
        <div className="mt-2 flex justify-center gap-2">
          {slides.map((_, index) => (
            <button
              key={index}
              onClick={() => setCurrentSlide(index)}
              className={`h-2.5 rounded-full transition-all duration-300 cursor-pointer ${currentSlide === index ? 'w-8 bg-emerald-500' : 'w-2.5 bg-slate-300'}`}
              aria-label={`Slide ${index + 1}`}
            />
          ))}
        </div>
      </div>

      {/* Large Bold Footer */}
      <div className="mx-auto max-w-5xl px-5 py-0 text-center mt-0">
        <div className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight flex items-center justify-center gap-3">
          Crafted <span className="text-red-500 animate-pulse text-3xl md:text-4xl">❤️</span> by <span className="text-emerald-600 font-black text-3xl md:text-4xl">Nishant</span>
        </div>
      </div>

    </div>
  );
}