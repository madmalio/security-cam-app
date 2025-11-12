"use client";

import React, { useState, FormEvent } from "react";
import { Video, Mail, Lock, Loader } from "lucide-react";
import { toast } from "sonner";
import { User } from "@/app/types";
import { useAuth } from "@/app/contexts/AuthContext"; // <-- 1. IMPORT

// --- Constants ---
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

// --- 2. No more props ---
export default function AuthPage() {
  const { login } = useAuth(); // <-- 3. Get login function from context
  const [isLoginView, setIsLoginView] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleRegister = async (e: FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_URL}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        const errData = await response.json();
        if (errData.detail && Array.isArray(errData.detail)) {
          throw new Error(errData.detail[0].msg);
        }
        if (errData.detail) {
          throw new Error(errData.detail);
        }
        throw new Error("Registration failed");
      }

      toast.success("Registration successful! Please log in.");
      setIsLoginView(true);
    } catch (err: any) {
      setError(err.message);
      toast.error(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const formData = new URLSearchParams();
      formData.append("username", email);
      formData.append("password", password);

      const response = await fetch(`${API_URL}/token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: formData,
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.detail || "Invalid email or password");
      }

      const data = await response.json();
      const { access_token, refresh_token } = data;

      if (!access_token || !refresh_token) {
        throw new Error("Login failed: Missing tokens.");
      }

      const userResponse = await fetch(`${API_URL}/users/me`, {
        headers: {
          Authorization: `Bearer ${access_token}`,
        },
      });

      if (!userResponse.ok) {
        throw new Error("Failed to fetch user data after login.");
      }
      const userData: User = await userResponse.json();

      // --- 4. Call context login function ---
      login(access_token, refresh_token, userData);
    } catch (err: any) {
      setError(err.message);
      toast.error(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100 dark:bg-zinc-900">
      <div className="w-full max-w-md rounded-lg bg-white p-8 shadow-lg dark:bg-zinc-800">
        <div className="mb-6 flex justify-center">
          <Video className="h-12 w-12 text-blue-600 dark:text-blue-500" />
        </div>
        <h2 className="mb-4 text-center text-2xl font-bold text-gray-900 dark:text-white">
          {isLoginView ? "Welcome Back" : "Create Account"}
        </h2>
        {error && (
          <div className="mb-4 rounded-md bg-red-100 p-3 text-center text-sm text-red-700 dark:bg-red-900 dark:text-red-200">
            {error}
          </div>
        )}
        <form onSubmit={isLoginView ? handleLogin : handleRegister}>
          <div className="mb-4">
            <label
              htmlFor="email"
              className="mb-2 block text-sm font-medium text-gray-700 dark:text-zinc-300"
            >
              Email
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-400" />
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="you@example.com"
                className="w-full rounded-md border border-gray-300 p-2.5 pl-10 text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:ring-blue-500 dark:border-zinc-600 dark:bg-zinc-700 dark:text-white dark:placeholder:text-zinc-500"
              />
            </div>
          </div>
          <div className="mb-6">
            <label
              htmlFor="password"
              className="mb-2 block text-sm font-medium text-gray-700 dark:text-zinc-300"
            >
              Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-400" />
              <input
                type="password"
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                className="w-full rounded-md border border-gray-300 p-2.5 pl-10 text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:ring-blue-500 dark:border-zinc-600 dark:bg-zinc-700 dark:text-white dark:placeholder:text-zinc-500"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={isLoading}
            className="w-full rounded-lg bg-blue-600 px-5 py-2.5 text-center text-sm font-medium text-white hover:bg-blue-700 focus:ring-4 focus:ring-blue-300 disabled:opacity-50"
          >
            {isLoading ? (
              <Loader className="mx-auto h-5 w-5 animate-spin" />
            ) : isLoginView ? (
              "Login"
            ) : (
              "Register"
            )}
          </button>
        </form>
        <p className="mt-6 text-center text-sm text-gray-600 dark:text-zinc-400">
          {isLoginView ? "Don't have an account?" : "Already have an account?"}
          <button
            onClick={() => {
              setIsLoginView(!isLoginView);
              setError(null);
            }}
            className="ml-1 font-medium text-blue-600 hover:underline dark:text-blue-500"
          >
            {isLoginView ? "Register" : "Login"}
          </button>
        </p>
      </div>
    </div>
  );
}
