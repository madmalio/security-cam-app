"use client";

import React, { useState, useEffect } from "react";
import { toast } from "sonner";
import { Loader, Monitor, Smartphone, LogOut, LucideIcon } from "lucide-react"; // <-- 1. IMPORT LucideIcon
import { User, UserSession } from "@/app/types";
import { formatDistanceToNow } from "date-fns";

// --- Constants ---
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

// --- 2. Define return type for parser ---
interface ParsedUserAgent {
  device: string;
  browser: string;
  os: string;
  icon: LucideIcon;
}

// --- 3. Fix the User-Agent Parser ---
function parseUserAgent(userAgent: string | null): ParsedUserAgent {
  // This was the bug. We must return a full object.
  if (!userAgent) {
    return {
      device: "Unknown Device",
      browser: "Unknown Browser",
      os: "Unknown OS",
      icon: Monitor, // Default to Monitor icon
    };
  }

  let browser = "Unknown Browser";
  let device = "Unknown Device";
  let os = "Unknown OS";

  // Check for Browser
  if (userAgent.includes("Firefox/")) browser = "Firefox";
  else if (userAgent.includes("Edg/")) browser = "Edge";
  else if (userAgent.includes("Chrome/")) browser = "Chrome";
  else if (userAgent.includes("Safari/")) browser = "Safari";

  // Check for OS
  if (userAgent.includes("Windows")) os = "Windows";
  else if (userAgent.includes("Macintosh")) os = "macOS";
  else if (userAgent.includes("Linux")) os = "Linux";
  else if (userAgent.includes("Android")) os = "Android";
  else if (userAgent.includes("iPhone")) os = "iOS";

  // Check for Device
  if (os === "Android" || os === "iOS") {
    device = "Mobile";
  } else if (os === "Windows" || os === "macOS" || os === "Linux") {
    device = "Desktop";
  }

  return {
    device,
    browser,
    os,
    icon: device === "Mobile" ? Smartphone : Monitor,
  };
}

interface ActiveSessionsProps {
  token: string;
  user: User;
}

export default function ActiveSessions({ token }: ActiveSessionsProps) {
  const [sessions, setSessions] = useState<UserSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const fetchSessions = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/sessions`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!response.ok) throw new Error("Failed to fetch sessions");
      const data = await response.json();
      setSessions(
        data.sort(
          (a: UserSession, b: UserSession) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        )
      );
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSessions();
  }, []);

  const handleRevokeSession = async (sessionId: number) => {
    setDeletingId(sessionId);
    try {
      const response = await fetch(`${API_URL}/api/sessions/${sessionId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error("Failed to revoke session");
      }

      toast.success("Session revoked successfully.");
      // Refresh the list
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <div className="p-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
          Active Sessions
        </h2>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
          This is a list of devices that have logged into your account. Revoke
          any sessions you do not recognize.
        </p>
      </div>

      <div className="flex flex-col">
        {isLoading ? (
          <div className="flex justify-center p-8">
            <Loader className="h-8 w-8 animate-spin text-gray-500" />
          </div>
        ) : (
          <ul className="divide-y divide-gray-200 dark:divide-gray-700">
            {sessions.map((session) => {
              const {
                icon: Icon,
                browser,
                os,
              } = parseUserAgent(session.user_agent);
              const isDeleting = deletingId === session.id;

              return (
                <li
                  key={session.id}
                  className="flex items-center justify-between gap-4 px-6 py-4"
                >
                  <div className="flex items-center gap-3">
                    <Icon className="h-8 w-8 text-gray-500" />
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">
                        {browser} on {os}
                      </p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {session.ip_address} &middot; Last active{" "}
                        {formatDistanceToNow(new Date(session.created_at))} ago
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleRevokeSession(session.id)}
                    disabled={isDeleting}
                    className="flex w-24 items-center justify-center rounded-lg bg-gray-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50 dark:bg-gray-500 dark:hover:bg-gray-600"
                  >
                    {isDeleting ? (
                      <Loader className="h-5 w-5 animate-spin" />
                    ) : (
                      <>
                        <LogOut className="mr-1.5 h-4 w-4" />
                        Revoke
                      </>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
