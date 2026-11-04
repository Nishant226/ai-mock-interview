import React from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import ErrorBoundary from './ErrorBoundary';
import Auth from './components/Auth';
import Dashboard from './components/Dashboard';
import InterviewSetup from './components/InterviewSetup';
import InterviewContainer from './components/InterviewContainer'; 
import InterviewReport from './components/InterviewReport';
import InterviewHistory from './components/InterviewHistory';
import ResetPassword from './components/ResetPassword';
import Pricing from './components/Pricing';
import Profile from './components/Profile'; 

function MainApp() {
    const navigate = useNavigate();
    const token = localStorage.getItem('auth_token') || null;
    const interviewId = localStorage.getItem('active_interview_id') || null;
    const reportData = JSON.parse(localStorage.getItem('interview_report') || 'null');

    const handleLoginSuccess = (newToken) => {
        localStorage.setItem('auth_token', newToken);
        navigate('/');
    };

    const handleLogout = () => {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('active_interview_id');
        localStorage.removeItem('interview_report');
        navigate('/auth');
    };

    const handleDeleteAccount = () => {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('active_interview_id');
        localStorage.removeItem('interview_report');
        navigate('/auth');
    };

    const handleStartInterviewRequest = (idOrCallback) => {
        localStorage.removeItem('interview_report');
        if (!token) {
            navigate('/auth');
            return;
        }
        
        if (typeof idOrCallback === 'string') {
            localStorage.setItem('active_interview_id', idOrCallback);
            navigate('/interview');
        } else if (typeof idOrCallback === 'function') {
            idOrCallback();
        }
    };

    const handleInterviewComplete = (report) => {
        // 🖥️ Force Exit Fullscreen immediately when interview completes & navigates to report
        if (document.fullscreenElement) {
            document.exitFullscreen().catch(err => console.log("Fullscreen exit error:", err));
        }

        localStorage.removeItem('active_interview_id');
        localStorage.setItem('interview_report', JSON.stringify(report));
        navigate('/report');
    };

    return (
        <Routes>
            {/* 1. Dashboard Route */}
            <Route 
                path="/" 
                element={
                    <Dashboard 
                        token={token} 
                        onStartInterview={handleStartInterviewRequest} 
                        onLogout={handleLogout}
                        onDeleteAccount={handleDeleteAccount}
                        onViewHistory={() => navigate('/history')}
                    />
                } 
            />

            {/* 2. Auth / Login Route */}
            <Route 
                path="/auth" 
                element={<Auth onLoginSuccess={handleLoginSuccess} />} 
            />

            {/* 3. Reset Password Route */}
            <Route 
                path="/reset-password/:token" 
                element={<ResetPassword />} 
            />

            {/* 4. Pricing / Buy Credits Route */}
            <Route 
                path="/pricing" 
                element={<Pricing token={token} />} 
            />

            {/* 👤 5. Profile & Multi-Pack Ledger Route (NEWLY ADDED) */}
            <Route 
                path="/profile" 
                element={
                    token ? (
                        <Profile token={token} />
                    ) : (
                        <Navigate to="/auth" />
                    )
                } 
            />

            {/* 6. Interview Setup Route */}
            <Route 
                path="/setup" 
                element={
                    token ? (
                        <InterviewSetup token={token} />
                    ) : (
                        <Navigate to="/auth" />
                    )
                } 
            />

            {/* 7. Interview Dynamic Phase Route */}
            <Route 
                path="/interview" 
                element={
                    interviewId ? (
                        <InterviewContainer 
                            interviewId={interviewId} 
                            token={token} 
                            onInterviewComplete={handleInterviewComplete} 
                        />
                    ) : (
                        <Navigate to="/" />
                    )
                } 
            />

            {/* 8. Interview Report Route */}
            <Route 
                path="/report" 
                element={
                    reportData ? (
                        <InterviewReport 
                            report={reportData} 
                            onRestart={() => {
                                localStorage.removeItem('interview_report');
                                navigate('/');
                            }} 
                        />
                    ) : (
                        <Navigate to="/" />
                    )
                } 
            />

            {/* 9. Interview History Route */}
            <Route 
                path="/history" 
                element={
                    <InterviewHistory 
                        token={token} 
                        onBack={() => navigate('/')} 
                    />
                } 
            />

            {/* Fallback Route */}
            <Route path="*" element={<Navigate to="/" />} />
        </Routes>
    );
}

export default function App() {
  return (
    <ErrorBoundary>
      <MainApp />
    </ErrorBoundary>
  );
}