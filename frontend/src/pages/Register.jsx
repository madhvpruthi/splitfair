import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Lock, User, Mail, AlertCircle, Sparkles } from 'lucide-react';

export const Register = () => {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  // OTP Verification mode states
  const [isVerifyMode, setIsVerifyMode] = useState(false);
  const [otp, setOtp] = useState('');
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpError, setOtpError] = useState('');
  const [timeLeft, setTimeLeft] = useState(0);

  const { register, verifyOtp, resendOtp } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (timeLeft <= 0) return;
    const interval = setInterval(() => {
      setTimeLeft((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [timeLeft]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await register(username, email.trim(), password);
      setIsVerifyMode(true);
      setTimeLeft(60);
    } catch (err) {
      console.error(err);
      const data = err.response?.data;
      if (data && typeof data === 'object') {
        const messages = [];
        for (const key in data) {
          if (Array.isArray(data[key])) {
            messages.push(...data[key]);
          } else if (typeof data[key] === 'string') {
            messages.push(data[key]);
          }
        }
        if (messages.length > 0) {
          setError(messages.join(' '));
          setLoading(false);
          return;
        }
      }
      setError('Registration failed. Please check your details and try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    setOtpLoading(true);
    setOtpError('');
    try {
      await verifyOtp(username, otp);
      navigate('/dashboard');
    } catch (err) {
      console.error(err);
      setOtpError(
        err.response?.data?.detail ||
        'Verification failed. Please check your code.'
      );
    } finally {
      setOtpLoading(false);
    }
  };

  const handleResend = async () => {
    setError('');
    setOtpError('');
    try {
      await resendOtp(username);
      setTimeLeft(60);
      setOtp('');
    } catch (err) {
      console.error(err);
      setOtpError(
        err.response?.data?.detail ||
        'Failed to resend OTP.'
      );
    }
  };

  if (isVerifyMode) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
        {/* Background radial gradient glow */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-600/20 rounded-full blur-[100px] animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-600/10 rounded-full blur-[120px] animate-pulse" />

        <div className="glass-panel w-full max-w-md p-8 relative z-10">
          <div className="text-center mb-8">
            <div className="inline-flex bg-indigo-600 p-3 rounded-2xl text-white shadow-xl shadow-indigo-600/30 mb-3">
              <Lock size={24} />
            </div>
            <h2 className="text-2xl font-extrabold text-slate-100">Verify Code</h2>
            <p className="text-sm text-slate-400 mt-1.5">
              Enter the 6-digit code sent to verify your account
            </p>
          </div>

          {otpError && (
            <div className="flex items-center gap-2 text-sm text-rose-400 bg-rose-500/10 p-3.5 rounded-xl border border-rose-500/20 mb-6">
              <AlertCircle size={18} className="shrink-0" />
              <span>{otpError}</span>
            </div>
          )}

          <form onSubmit={handleVerifyOtp} className="space-y-6">
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-2.5 uppercase tracking-wider text-center">
                6-Digit Verification Code
              </label>
              <div className="relative">
                <input
                  type="text"
                  maxLength={6}
                  pattern="\d{6}"
                  placeholder="000000"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                  className="w-full text-center py-4 text-3xl font-mono tracking-[0.5em] pl-[0.5em] bg-slate-950/40 border border-slate-800 rounded-2xl text-slate-100 focus:outline-none focus:border-indigo-500/80 transition-colors"
                  required
                  autoFocus
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={otpLoading || otp.length !== 6}
              className="btn-primary w-full py-3.5 text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {otpLoading ? (
                <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                'Verify & Activate'
              )}
            </button>
          </form>

          <div className="mt-6 text-center space-y-4">
            <div>
              {timeLeft > 0 ? (
                <p className="text-xs text-slate-400">
                  Resend code in <span className="font-semibold text-slate-200">{timeLeft}s</span>
                </p>
              ) : (
                <button
                  onClick={handleResend}
                  className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold underline decoration-2 underline-offset-4"
                >
                  Resend Verification Code
                </button>
              )}
            </div>
            
            <div>
              <button
                onClick={() => {
                  setIsVerifyMode(false);
                  setOtp('');
                  setOtpError('');
                }}
                className="text-xs text-slate-400 hover:text-slate-300 transition-colors"
              >
                Change details / Go back
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background radial gradient glow */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-600/20 rounded-full blur-[100px] animate-pulse" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-600/10 rounded-full blur-[120px] animate-pulse" />

      <div className="glass-panel w-full max-w-md p-8 relative z-10">
        <div className="text-center mb-8">
          <div className="inline-flex bg-indigo-600 p-3 rounded-2xl text-white shadow-xl shadow-indigo-600/30 mb-3">
            <Sparkles size={24} />
          </div>
          <h2 className="text-2xl font-extrabold text-slate-100">Create Account</h2>
          <p className="text-sm text-slate-400 mt-1.5">Sign up to easily split expenses with friends</p>
        </div>

        {error && (
          <div className="flex items-center gap-2 text-sm text-rose-400 bg-rose-500/10 p-3.5 rounded-xl border border-rose-500/20 mb-6">
            <AlertCircle size={18} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">
              Username
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-500">
                <User size={18} />
              </span>
              <input
                type="text"
                placeholder="Pick a unique username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="glass-input w-full pl-11 py-3 text-sm focus:border-indigo-500"
                required
                autoComplete="username"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">
              Email Address
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-500">
                <Mail size={18} />
              </span>
              <input
                type="email"
                placeholder="your.name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="glass-input w-full pl-11 py-3 text-sm focus:border-indigo-500"
                required
                autoComplete="email"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">
              Password
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-500">
                <Lock size={18} />
              </span>
              <input
                type="password"
                placeholder="At least 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="glass-input w-full pl-11 py-3 text-sm focus:border-indigo-500"
                required
                autoComplete="new-password"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full py-3.5 mt-2 text-sm font-semibold flex items-center justify-center gap-2"
          >
            {loading ? (
              <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              'Create Account'
            )}
          </button>
        </form>

        <p className="text-center text-sm text-slate-400 mt-6">
          Already have an account?{' '}
          <Link to="/login" className="text-indigo-400 hover:text-indigo-300 font-semibold underline decoration-2 underline-offset-4">
            Sign In here
          </Link>
        </p>
      </div>
    </div>
  );
};
