"use client";

import React, { useState, useEffect } from "react";
import { Toaster, toast } from "sonner";
import { Loader } from "lucide-react";
import { User } from "./types";
import AuthPage from "./components/AuthPage";
import DashboardPage from "./components/DashboardPage";

// --- Constants ---
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

export default function Page() {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadToken = async () => {
      const storedToken = localStorage.getItem("authToken");
      if (storedToken) {
        try {
          const userResponse = await fetch(`${API_URL}/users/me`, {
            headers: {
              Authorization: `Bearer ${storedToken}`,
            },
          });
          if (!userResponse.ok) {
            throw new Error("Invalid token");
          }
          const userData = await userResponse.json();
          setToken(storedToken);
          setUser(userData);
        } catch (error) {
          localStorage.removeItem("authToken");
        }
      }
      setIsLoading(false);
    };
    loadToken();
  }, []);

  const handleLogin = (newToken: string, newUser: User) => {
    setToken(newToken);
    setUser(newUser);
    localStorage.setItem("authToken", newToken);
  };

  const handleLogout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem("authToken");
    toast.success("You have been logged out.");
  };

  // --- 1. NEW: Function to update user state ---
  const handleUserUpdate = (updatedUser: User) => {
    setUser(updatedUser);
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-100 dark:bg-gray-900">
        <Loader className="h-12 w-12 animate-spin text-blue-600" />
      </div>
    );
  }

  const isLoggedIn = token && user;

  return (
    <main>
      <Toaster position="top-right" richColors />
      {!isLoggedIn ? (
        <AuthPage onLoginSuccess={handleLogin} />
      ) : (
        // --- 2. UPDATED: Pass new props ---
        <DashboardPage
          token={token}
          user={user}
          onLogout={handleLogout}
          onUserUpdate={handleUserUpdate}
        />
      )}
    </main>
  );
}
