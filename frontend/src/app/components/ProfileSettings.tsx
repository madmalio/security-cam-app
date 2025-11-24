"use client";

import React, { useState, FormEvent, useEffect } from "react";
import { toast } from "sonner";
import { Loader, Bell, BellOff, CheckCircle2, XCircle } from "lucide-react";
import { User } from "@/app/types";
import { useAuth } from "@/app/contexts/AuthContext";
import { urlBase64ToUint8Array } from "@/app/utils/push";

export default function ProfileSettings() {
  const { user: initialUser, api, login } = useAuth();

  const [user, setUser] = useState<User | null>(initialUser);
  const [displayName, setDisplayName] = useState(
    initialUser?.display_name || ""
  );
  const [isSavingName, setIsSavingName] = useState(false);

  // --- Notification State ---
  const [isSubscribing, setIsSubscribing] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoadingStatus, setIsLoadingStatus] = useState(true);

  useEffect(() => {
    if (initialUser) {
      setUser(initialUser);
      setDisplayName(initialUser.display_name || "");
    }
  }, [initialUser]);

  // --- Check Subscription Status on Mount ---
  useEffect(() => {
    const checkStatus = async () => {
      if (!("serviceWorker" in navigator)) {
        setIsLoadingStatus(false);
        return;
      }

      try {
        const registration = await navigator.serviceWorker.getRegistration();
        if (registration) {
          const subscription = await registration.pushManager.getSubscription();
          setIsSubscribed(!!subscription);
        }
      } catch (error) {
        console.error("Error checking subscription:", error);
      } finally {
        setIsLoadingStatus(false);
      }
    };

    checkStatus();
  }, []);

  if (!user) {
    return (
      <div className="flex justify-center p-8">
        <Loader className="h-8 w-8 animate-spin text-zinc-500" />
      </div>
    );
  }

  const userName = user.display_name || user.email.split("@")[0];
  const gravatarUrl = `https://www.gravatar.com/avatar/${user.gravatar_hash}?s=96&d=mp`;

  const handleSaveProfile = async (e: FormEvent) => {
    e.preventDefault();
    setIsSavingName(true);
    try {
      const response = await api("/api/users/me", {
        method: "PUT",
        body: JSON.stringify({
          display_name: displayName,
        }),
      });
      if (!response) return;

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || "Failed to update profile");
      }

      const updatedUser = await response.json();

      const rt = localStorage.getItem("refreshToken");
      const at =
        (await api("/api/webrtc-creds"))?.headers
          .get("Authorization")
          ?.split(" ")[1] || "";
      if (rt && at) {
        login(at, rt, updatedUser);
      }

      toast.success("Profile updated successfully!");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsSavingName(false);
    }
  };

  const handleSubscribe = async () => {
    setIsSubscribing(true);
    try {
      if (!("serviceWorker" in navigator)) {
        throw new Error("Service Workers not supported in this browser.");
      }

      // 1. Register Service Worker
      const registration = await navigator.serviceWorker.register("/sw.js", {
        scope: "/",
      });

      // 2. Fetch VAPID Key
      const keyRes = await api("/api/notifications/vapid-key");
      if (!keyRes || !keyRes.ok) throw new Error("Failed to get VAPID key");
      const { publicKey } = await keyRes.json();

      // 3. Subscribe locally
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      // 4. Send to Backend
      await api("/api/notifications/subscribe", {
        method: "POST",
        body: JSON.stringify(subscription),
      });

      setIsSubscribed(true);
      toast.success("Notifications enabled for this device!");
    } catch (err: any) {
      console.error(err);
      toast.error("Failed to subscribe: " + err.message);
    } finally {
      setIsSubscribing(false);
    }
  };

  const handleUnsubscribe = async () => {
    setIsSubscribing(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        await subscription.unsubscribe();
        // Note: We rely on the backend's lazy cleanup (410 Gone)
        // to remove the record from the DB eventually.
      }

      setIsSubscribed(false);
      toast.info("Notifications disabled for this device.");
    } catch (err: any) {
      toast.error("Failed to unsubscribe");
    } finally {
      setIsSubscribing(false);
    }
  };

  return (
    <div className="space-y-8 max-w-2xl pb-16">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold capitalize text-gray-900 dark:text-white">
          Hello, {userName}
        </h1>
        <p className="mt-1 text-gray-500 dark:text-zinc-400">
          Manage your account profile and preferences.
        </p>
      </div>

      {/* Profile Card */}
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-zinc-700 dark:bg-zinc-800">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
          Profile
        </h2>
        <form onSubmit={handleSaveProfile} className="mt-4 space-y-4">
          <div className="flex items-center gap-4">
            <img
              src={gravatarUrl}
              alt="Profile"
              className="h-24 w-24 rounded-full bg-gray-200 dark:bg-zinc-700"
            />
            <div className="flex-1">
              <label
                htmlFor="display-name"
                className="mb-2 block text-sm font-medium text-gray-700 dark:text-zinc-300"
              >
                Display Name
              </label>
              <input
                type="text"
                id="display-name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="e.g., Mark"
                className="w-full rounded-md border border-gray-300 p-2.5 text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:ring-blue-500 dark:border-zinc-600 dark:bg-zinc-700 dark:text-white dark:placeholder:text-zinc-500"
              />
            </div>
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={isSavingName}
              className="flex w-32 items-center justify-center rounded-lg bg-blue-600 px-5 py-2.5 text-center text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {isSavingName ? (
                <Loader className="h-5 w-5 animate-spin" />
              ) : (
                "Save Profile"
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Notifications Card */}
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-zinc-700 dark:bg-zinc-800">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4 mb-4">
            <div
              className={`p-3 rounded-full ${
                isSubscribed
                  ? "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400"
                  : "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400"
              }`}
            >
              {isSubscribed ? (
                <Bell className="h-6 w-6" />
              ) : (
                <BellOff className="h-6 w-6" />
              )}
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                Push Notifications
              </h2>
              <p className="text-sm text-gray-500 dark:text-zinc-400">
                Receive alerts on this device when motion is detected.
              </p>

              {/* Status Badge */}
              <div className="mt-2 flex items-center gap-2">
                {isLoadingStatus ? (
                  <span className="text-xs text-gray-400">
                    Checking status...
                  </span>
                ) : isSubscribed ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
                    <CheckCircle2 className="h-3 w-3" /> Active
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 dark:bg-zinc-700 dark:text-zinc-400">
                    <XCircle className="h-3 w-3" /> Inactive
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end border-t border-gray-100 dark:border-zinc-700 pt-4 mt-2">
          {isSubscribed ? (
            <button
              onClick={handleUnsubscribe}
              disabled={isSubscribing || isLoadingStatus}
              className="flex items-center gap-2 rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:border-red-900/30 dark:bg-transparent dark:text-red-400 dark:hover:bg-red-900/20 disabled:opacity-50"
            >
              {isSubscribing ? (
                <Loader className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <BellOff className="h-4 w-4" /> Disable Notifications
                </>
              )}
            </button>
          ) : (
            <button
              onClick={handleSubscribe}
              disabled={isSubscribing || isLoadingStatus}
              className="flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-200 disabled:opacity-50"
            >
              {isSubscribing ? (
                <Loader className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Bell className="h-4 w-4" /> Enable Notifications
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
