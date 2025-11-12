"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
  useCallback,
} from "react";
import { User } from "@/app/types";
import { Toaster, toast } from "sonner"; // <-- FIX 1: Added 'Toaster' import
import AuthPage from "@/app/components/AuthPage";
import DashboardPage from "@/app/components/DashboardPage";
import { Loader } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

// --- Types ---
interface AuthContextType {
  user: User | null;
  api: (url: string, options?: RequestInit) => Promise<Response | undefined>;
  login: (access: string, refresh: string, user: User) => void;
  logout: () => void;
}

interface AuthProviderProps {
  children: ReactNode;
}

// --- Context ---
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// --- Provider ---
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // --- Logout Function ---
  const logout = useCallback(() => {
    setUser(null);
    setAccessToken(null);
    setRefreshToken(null);
    localStorage.removeItem("refreshToken");
    toast.success("You have been logged out.");
  }, []);

  // --- API Fetcher (Corrected) ---
  const api = useCallback(
    async (url: string, options: RequestInit = {}) => {
      let token = accessToken;

      const headers = new Headers(options.headers);
      headers.set("Content-Type", "application/json");
      if (token) {
        headers.set("Authorization", `Bearer ${token}`);
      }
      options.headers = headers;

      let response = await fetch(`${API_URL}${url}`, options);

      if (response.status === 401) {
        console.warn("Access token expired. Refreshing...");
        try {
          const refreshResponse = await fetch(`${API_URL}/token/refresh`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${refreshToken}`,
            },
          });

          if (!refreshResponse.ok) {
            throw new Error("Session expired. Please log in again.");
          }

          const data = await refreshResponse.json();
          const newAccessToken = data.access_token;
          const newRefreshToken = data.refresh_token;

          setAccessToken(newAccessToken);
          setRefreshToken(newRefreshToken);
          localStorage.setItem("refreshToken", newRefreshToken);

          console.log("Token refreshed. Retrying original request...");
          (options.headers as Headers).set(
            "Authorization",
            `Bearer ${newAccessToken}`
          );
          response = await fetch(`${API_URL}${url}`, options);
        } catch (error: any) {
          console.error("Refresh failed:", error.message);
          logout();
          return undefined;
        }
      }

      return response;
    },
    [accessToken, refreshToken, logout]
  );

  // --- Login Function ---
  const login = (access: string, refresh: string, user: User) => {
    setAccessToken(access);
    setRefreshToken(refresh);
    setUser(user);
    localStorage.setItem("refreshToken", refresh);
  };

  // --- Initial Load Effect ---
  useEffect(() => {
    const loadToken = async () => {
      const storedRefreshToken = localStorage.getItem("refreshToken");

      if (storedRefreshToken) {
        try {
          const response = await fetch(`${API_URL}/token/refresh`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${storedRefreshToken}`,
            },
          });

          if (!response.ok) {
            throw new Error("Session expired. Please log in again.");
          }

          const data = await response.json();

          const userResponse = await fetch(`${API_URL}/users/me`, {
            headers: {
              Authorization: `Bearer ${data.access_token}`,
            },
          });

          if (!userResponse.ok) {
            throw new Error("Failed to fetch user data.");
          }

          const userData = await userResponse.json();

          setAccessToken(data.access_token);
          setRefreshToken(data.refresh_token);
          setUser(userData);
          localStorage.setItem("refreshToken", data.refresh_token);
        } catch (error: any) {
          console.error("Auto-login failed:", error.message);
          localStorage.removeItem("refreshToken");
        }
      }
      setIsLoading(false);
    };
    loadToken();
  }, []);

  // --- Render Logic ---
  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-100 dark:bg-zinc-900">
        <Loader className="h-12 w-12 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ user, api, login, logout }}>
      <Toaster position="top-center" richColors />
      {/* FIX 2: Added <AuthPage /> to the else condition */}
      {user ? children : <AuthPage />}
    </AuthContext.Provider>
  );
}

// --- Custom Hook ---
export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
