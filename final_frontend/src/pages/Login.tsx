import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { API_BASE_URL } from '../lib/api';
import { Eye, EyeOff, Terminal, KeyRound } from 'lucide-react';

export const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { login } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || 'Login failed');
      }

      login(data.access_token);
      navigate('/analytics');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface-dim text-on-background flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative overflow-hidden font-sans">
      {/* Background decoration grid lines */}
      <div className="absolute inset-0 opacity-[0.02] pointer-events-none" style={{ backgroundImage: "linear-gradient(to right, #8a919f 1px, transparent 1px), linear-gradient(to bottom, #8a919f 1px, transparent 1px)", backgroundSize: "32px 32px" }}></div>
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-primary/5 rounded-full blur-[100px] pointer-events-none" />

      <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10 text-center space-y-3">
        <div className="flex justify-center">
          <div className="h-10 w-10 rounded bg-primary/10 flex items-center justify-center text-primary border border-primary/20">
            <Terminal className="h-5 w-5 animate-pulse text-primary" />
          </div>
        </div>
        <div>
          <h2 className="text-xl font-bold text-white uppercase tracking-tight leading-none">
            DATA ANALYST AGENT
          </h2>
          <p className="mt-1.5 text-[9px] font-mono uppercase tracking-[0.25em] text-outline">
            Analyst Sign In
          </p>
        </div>
      </div>

      <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-md relative z-10 px-4">
        <div className="bg-surface-container-low border border-outline-variant py-8 px-6 shadow-xl rounded sm:px-10">
          <form className="space-y-4" onSubmit={handleSubmit}>
            {error && (
              <div className="bg-error-container/10 border border-error/20 text-error p-3 rounded-sm text-[11px] font-mono flex items-start gap-2.5">
                <Terminal className="h-4 w-4 shrink-0 mt-0.5" />
                <span>ERR::AUTH_FAILED: {error}</span>
              </div>
            )}
            
            <div className="space-y-1.5">
              <label className="block text-[10px] font-mono uppercase tracking-wider text-outline">
                Email Address
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-outline-variant">
                  <Terminal className="h-3.5 w-3.5" />
                </div>
                <input
                  type="email"
                  required
                  placeholder="admin@platform.io"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="block w-full pl-9 pr-3 py-2 bg-surface-dim border border-outline-variant rounded-[4px] text-on-background placeholder-outline/30 text-xs focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all font-mono"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-[10px] font-mono uppercase tracking-wider text-outline">
                Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-outline-variant">
                  <KeyRound className="h-3.5 w-3.5" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full pl-9 pr-10 py-2 bg-surface-dim border border-outline-variant rounded-[4px] text-on-background placeholder-outline/30 text-xs focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-outline-variant hover:text-on-background focus:outline-none"
                >
                  {showPassword ? (
                    <EyeOff className="h-3.5 w-3.5" />
                  ) : (
                    <Eye className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={loading}
                className="w-full flex justify-center items-center py-2 px-4 rounded-[4px] font-mono text-[10px] uppercase tracking-wider text-on-primary bg-primary hover:opacity-95 font-bold focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50 transition-all active:scale-[0.98] cursor-pointer"
              >
                {loading ? 'Signing In...' : 'Sign In'}
              </button>
            </div>
          </form>

          <div className="mt-5 text-center text-[11px] font-mono text-outline">
            Don't have an account?{' '}
            <Link to="/register" className="font-bold text-primary hover:underline transition-all">
              Sign Up
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};
