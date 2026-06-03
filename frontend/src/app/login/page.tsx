"use client";

import { useState } from "react";
import { LogIn, UserPlus } from "lucide-react";
import axios from "axios";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function LoginPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      if (isLogin) {
        const res = await axios.post(`${API}/login`, { email, password });
        localStorage.setItem("access_token", res.data.access_token);
        setMessage("Successfully logged in!");
        window.location.href = "/";
      } else {
        await axios.post(`${API}/signup`, { email, password });
        setMessage("Account created successfully! You can now log in.");
        setIsLogin(true);
      }
    } catch (err: any) {
      setMessage(err.response?.data?.detail || "An error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md p-8 space-y-6 bg-card border border-card-border rounded-2xl shadow-2xl backdrop-blur-xl relative overflow-hidden">
        {/* Glow effect */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-32 bg-primary/20 blur-3xl rounded-full pointer-events-none"></div>

        <div className="text-center space-y-2 relative z-10">
          <h1 className="text-3xl font-bold tracking-tight">
            Market Pulse <span className="text-primary">AI</span>
          </h1>
          <p className="text-muted text-sm">
            {isLogin ? "Welcome back. Log in to your dashboard." : "Create your account to get started."}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 relative z-10">
          <div className="space-y-1">
            <label className="text-sm font-medium text-foreground/80">Email</label>
            <input
              type="email"
              required
              className="w-full px-4 py-2 bg-accent/50 border border-card-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all text-sm"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-foreground/80">Password</label>
            <input
              type="password"
              required
              className="w-full px-4 py-2 bg-accent/50 border border-card-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all text-sm"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {message && (
            <div className={`p-3 text-sm rounded-lg ${message.includes('error') || message.includes('Incorrect') || message.includes('already') || message.includes('failed') || message.includes('cancelled') ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-green-500/10 text-green-400 border border-green-500/20'}`}>
              {message}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-primary hover:bg-blue-600 text-white font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            {loading ? (
              <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
            ) : isLogin ? (
              <><LogIn className="w-4 h-4" /> Log In</>
            ) : (
              <><UserPlus className="w-4 h-4" /> Sign Up</>
            )}
          </button>
        </form>

        <div className="pt-2 text-center text-sm relative z-10">
          <span className="text-muted">
            {isLogin ? "Don't have an account?" : "Already have an account?"}
          </span>
          <button
            onClick={() => { setIsLogin(!isLogin); setMessage(""); }}
            className="ml-2 text-primary hover:underline focus:outline-none"
          >
            {isLogin ? "Sign up" : "Log in"}
          </button>
        </div>
      </div>
    </div>
  );
}
