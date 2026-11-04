import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export default function Pricing({ token }) {
  const navigate = useNavigate();
  const [loadingPlan, setLoadingPlan] = useState(null);

  // Credit Plans Data
  const plans = [
    {
      id: 'STARTER',
      name: 'Starter Pack',
      price: 99,
      credits: 2,
      description: 'Ideal for a quick practice before an interview.',
      popular: false,
      badge: 'Quick Prep',
      features: [
        '2 Full AI Mock Interviews',
        'Instant Detailed Evaluation & Feedback',
        'Download PDF Performance Report'
      ]
    },
    {
      id: 'PRO',
      name: 'Pro Pack',
      price: 199,
      credits: 5,
      description: 'Best value for active job seekers looking for comprehensive prep.',
      popular: true,
      badge: 'Most Popular 🔥',
      features: [
        '5 Full AI Mock Interviews',
        'Custom Round Configuration (MCQ, Tech, Coding)',
        'Resume & JD Contextual Question Generation',
        'Download PDF Performance Report',
        'Priority AI Response Generation'
      ]
    },
    {
      id: 'ULTIMATE',
      name: 'Ultimate Pack',
      price: 499,
      credits: 15,
      description: 'For candidates aiming for top tier companies and multiple roles.',
      popular: false,
      badge: 'Best Value',
      features: [
        '15 Full AI Mock Interviews',
        'All Pro Features Included',
        'Unlimited Retry & Practice History Access',
        'Advanced Proctoring & OpenCV Feedback',
        '24/7 Priority Support'
      ]
    }
  ];

  // Razorpay Payment Handler
  const handlePayment = async (plan) => {
    try {
      setLoadingPlan(plan.id);
      const authToken = token || localStorage.getItem('auth_token') || localStorage.getItem('token');
      
      let userId = '';
      let userEmail = localStorage.getItem('userEmail') || '';
      let userName = localStorage.getItem('userName') || 'User';

      if (authToken) {
        try {
          const base64Payload = authToken.split('.')[1];
          const payload = JSON.parse(atob(base64Payload));
          userId = payload?.id || payload?.userId;
          if (payload?.email) userEmail = payload.email;
          if (payload?.name) userName = payload.name;
        } catch (e) {
          console.error("Token decoding error", e);
        }
      }

      if (!userId) {
        alert("Session expired or user not logged in. Please login again.");
        navigate('/');
        return;
      }

      // 1. Create Razorpay order on backend (Passing planType & amount explicitly)
      const { data } = await axios.post(
        '${API_URL}/api/payment/create-order',
        {
          amount: plan.price,
          userId: userId,
          credits: plan.credits,
          planType: plan.id // 👈 Pass planType here ('STARTER', 'PRO', 'ULTIMATE')
        },
        { headers: { Authorization: `Bearer ${authToken}` } }
      );

      if (!data.success) {
        alert("Failed to create payment order. Please try again.");
        return;
      }

      // 2. Open Razorpay Modal
      const options = {
        key: "rzp_test_TpOt9TWpO3FynL",
        amount: data.order.amount,
        currency: "INR",
        name: "InterviewIQ.AI",
        description: `${plan.credits} Mock Interview Credits - ${plan.name}`,
        order_id: data.order.id,
        handler: async function (response) {
          try {
            // 3. Verify Payment on Backend (Passing planType & amount explicitly)
            const verifyRes = await axios.post(
              '${API_URL}/api/payment/verify-payment',
              {
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
                userId: userId,
                creditsToAdd: plan.credits,
                planType: plan.id, // Pass planType here too
                amount: plan.price  // Pass amount as backup safeguard
              },
              { headers: { Authorization: `Bearer ${authToken}` } }
            );

            if (verifyRes.data.success) {
              alert(`🎉 Payment Successful! Ultimate Plan & ${plan.credits} credits activated on your account.`);
              navigate('/dashboard'); 
            } else {
              alert("Payment verification failed!");
            }
          } catch (verifyErr) {
            console.error("Verification Error:", verifyErr);
            alert("Error verifying payment with server.");
          }
        },
        prefill: {
          name: userName,
          email: userEmail
        },
        theme: {
          color: "#10b981"
        }
      };

      const rzp = new window.Razorpay(options);
      rzp.open();

    } catch (err) {
      console.error("Payment initiation error:", err);
      alert("Error starting payment. Please check your backend connection.");
    } finally {
      setLoadingPlan(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans pb-20">
      
      {/* Top Header Navigation */}
      <nav className="flex items-center justify-between border-b border-slate-200 bg-white px-8 py-4 shadow-sm">
        <div 
          onClick={() => navigate('/')} 
          className="flex cursor-pointer items-center gap-2.5 text-xl font-extrabold tracking-tight"
        >
          <span className="rounded-lg bg-slate-900 px-2.5 py-1.5 text-sm text-white">🤖</span>
          InterviewIQ<span className="text-emerald-500">.AI</span>
        </div>

        <button 
          onClick={() => navigate(-1)} 
          className="cursor-pointer rounded-full border border-slate-300 bg-white px-5 py-2 text-sm font-bold text-slate-700 hover:bg-slate-100 transition-colors"
        >
          ← Back
        </button>
      </nav>

      {/* Hero Section */}
      <div className="text-center pt-14 pb-10 px-5">
        <div className="mb-4 inline-block rounded-full bg-emerald-50 border border-emerald-200 px-4 py-1.5 text-xs font-bold text-emerald-700">
          🪙 Flexible Pricing & Credit Packages
        </div>
        <h1 className="text-4xl md:text-5xl font-black text-slate-900 tracking-tight mb-4">
          Upgrade Your Interview <span className="text-emerald-500">Preparation</span>
        </h1>
        <p className="max-w-2xl mx-auto text-slate-500 text-base md:text-lg">
          Choose a credit pack that fits your preparation goals. Pay only for what you use, with zero subscriptions or hidden fees.
        </p>
      </div>

      {/* Plans Grid */}
      <div className="max-w-6xl mx-auto px-5 grid grid-cols-1 md:grid-cols-3 gap-8 items-stretch">
        {plans.map((plan) => (
          <div 
            key={plan.id}
            className={`relative flex flex-col justify-between rounded-3xl p-8 transition-all duration-300 bg-white ${
              plan.popular 
                ? 'border-2 border-emerald-500 shadow-2xl scale-105 z-10' 
                : 'border border-slate-200 shadow-lg hover:border-emerald-300 hover:shadow-xl'
            }`}
          >
            {plan.popular && (
              <div className="absolute -top-4 left-1/2 -translate-x-1/2 rounded-full bg-emerald-500 px-4 py-1 text-xs font-extrabold text-white shadow-md">
                {plan.badge}
              </div>
            )}

            <div>
              <div className="flex justify-between items-center mb-2">
                <h3 className="text-xl font-black text-slate-900">{plan.name}</h3>
                {!plan.popular && (
                  <span className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
                    {plan.badge}
                  </span>
                )}
              </div>

              <p className="text-xs text-slate-500 mb-6 min-h-[36px]">{plan.description}</p>

              {/* Price & Credits Display */}
              <div className="mb-6 bg-slate-50 p-4 rounded-2xl border border-slate-100 flex items-baseline gap-2">
                <span className="text-4xl font-black text-slate-900">₹{plan.price}</span>
                <span className="text-sm font-extrabold text-emerald-600">
                  / {plan.credits} Credits ({Math.round(plan.price / plan.credits)}₹ per interview)
                </span>
              </div>

              {/* Feature List */}
              <ul className="space-y-3 mb-8 text-sm text-slate-600">
                {plan.features.map((feat, idx) => (
                  <li key={idx} className="flex items-center gap-2.5">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 text-xs font-bold">✓</span>
                    <span>{feat}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Buy Action Button */}
            <button
              onClick={() => handlePayment(plan)}
              disabled={loadingPlan === plan.id}
              className={`w-full py-3.5 px-6 rounded-2xl font-extrabold text-sm transition-all duration-300 cursor-pointer ${
                plan.popular 
                  ? 'bg-emerald-500 text-white hover:bg-emerald-600 shadow-lg shadow-emerald-500/30' 
                  : 'bg-slate-900 text-white hover:bg-slate-800'
              } disabled:opacity-60`}
            >
              {loadingPlan === plan.id ? 'Connecting Razorpay...' : `Get ${plan.credits} Credits 🚀`}
            </button>
          </div>
        ))}
      </div>

    </div>
  );
}