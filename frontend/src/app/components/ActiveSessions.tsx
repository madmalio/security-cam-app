"use client";

import React, { useState, useEffect } from "react";
import { toast } from "sonner";
import { Loader, Monitor, Smartphone, LogOut, LucideIcon } from "lucide-react";
import { UserSession } from "@/app/types";
import { formatDistanceToNow } from "date-fns";
import { useAuth } from "@/app/contexts/AuthContext"; // <-- 1. IMPORT

interface ParsedUserAgent {
  device: string;
  browser: string;
  os: string;
  icon: LucideIcon;
}

function parseUserAgent(userAgent: string | null): ParsedUserAgent {
  if (!userAgent) {
    return {
      device: "Unknown Device",
      browser: "Unknown Browser",
      os: "Unknown OS",
      icon: Monitor,
    };
  }
  let browser = "Unknown Browser";
  let device = "Unknown Device";
  let os = "Unknown OS";
  if (userAgent.includes("Firefox/")) browser = "Firefox";
  else if (userAgent.includes("Edg/")) browser = "Edge";
  else if (userAgent.includes("Chrome/")) browser = "Chrome";
  else if (userAgent.includes("Safari/")) browser = "Safari";
  if (userAgent.includes("Windows")) os = "Windows";
  else if (userAgent.includes("Macintosh")) os = "macOS";
  else if (userAgent.includes("Linux")) os = "Linux";
  else if (userAgent.includes("Android")) os = "Android";
  else if (userAgent.includes("iPhone")) os = "iOS";
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

// 2. No more props
export default function ActiveSessions() {
  const { api } = useAuth(); // <-- 3. Get api from context
  const [sessions, setSessions] = useState<UserSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  useEffect(() => {
    const fetchSessions = async () => {
      setIsLoading(true);
      try {
        const response = await api("/api/sessions"); // <-- 4. Use api
        if (!response) return;
        if (!response.ok) throw new Error("Failed to fetch sessions");
        const data = await response.json();
        setSessions(
          data.sort(
            (a: UserSession, b: UserSession) =>
              new Date(b.created_at).getTime() -
              new Date(a.created_at).getTime()
          )
        );
      } catch (err: any) {
        toast.error(err.message);
      } finally {
        setIsLoading(false);
      }
    };
    fetchSessions();
  }, [api]);

  const handleRevokeSession = async (sessionId: number) => {
    setDeletingId(sessionId);
    try {
      const response = await api(`/api/sessions/${sessionId}`, {
        method: "DELETE",
      }); // <-- 5. Use api
      if (!response) return;

      if (!response.ok) {
        throw new Error("Failed to revoke session");
      }

      toast.success("Session revoked successfully.");
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-800">
      <div className="p-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
          Active Sessions
        </h2>
        <p className="mt-2 text-sm text-gray-600 dark:text-zinc-400">
          This is a list of devices that have logged into your account. Revoke
          any sessions you do not recognize.
        </p>
      </div>

      <div className="flex flex-col">
        {isLoading ? (
          <div className="flex justify-center p-8">
            <Loader className="h-8 w-8 animate-spin text-zinc-500" />
          </div>
        ) : (
          <ul className="divide-y divide-gray-200 dark:divide-zinc-700">
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
                    <Icon className="h-8 w-8 text-zinc-500" />
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">
                        {browser} on {os}
                      </p>
                      <p className="text-sm text-gray-500 dark:text-zinc-400">
                        {session.ip_address} &middot; Last active{" "}
                        {formatDistanceToNow(new Date(session.created_at))} ago
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleRevokeSession(session.id)}
                    disabled={isDeleting}
                    className="flex w-24 items-center justify-center rounded-lg bg-gray-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50 dark:bg-zinc-600 dark:hover:bg-zinc-500"
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
