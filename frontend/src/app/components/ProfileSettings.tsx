"use client";

import React, { useState, FormEvent, useEffect } from "react";
import { toast } from "sonner";
import { Loader } from "lucide-react";
import { User } from "@/app/types";
import { useAuth } from "@/app/contexts/AuthContext"; // <-- 1. IMPORT

// 2. No more props!
export default function ProfileSettings() {
  // 3. Get user and api from context
  const { user: initialUser, api, login } = useAuth();

  const [user, setUser] = useState<User | null>(initialUser);
  const [displayName, setDisplayName] = useState(
    initialUser?.display_name || ""
  );
  const [isSavingName, setIsSavingName] = useState(false);

  useEffect(() => {
    if (initialUser) {
      setUser(initialUser);
      setDisplayName(initialUser.display_name || "");
    }
  }, [initialUser]);

  if (!user) {
    return (
      <div className="flex justify-center p-8">
        <Loader className="h-8 w-8 animate-spin text-zinc-500" />
      </div>
    );
  }

  const userName = user.display_name || user.email.split("@")[0];
  const gravatarUrl = `https://www.gravatar.com/avatar/${user.gravatar_hash}?s=96&d=mp`;

  // 4. Update to use 'api' hook
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

      // 5. Update user in local state and global context
      setUser(updatedUser);
      // We call 'login' to update the user object in the parent context
      // This is a bit of a hack, we could add a dedicated 'setUser' to the context
      // But this works for now.
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
    </div>
  );
}
