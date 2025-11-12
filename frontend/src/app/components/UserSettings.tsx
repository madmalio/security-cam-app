"use client";

import React, { useState, FormEvent, useEffect } from "react";
import { toast } from "sonner";
import ConfirmDeleteModal from "./ConfirmDeleteModal";
import { Loader, ShieldCheck } from "lucide-react";
import { User } from "@/app/types";
import ActiveSessions from "./ActiveSessions"; // <-- 1. IMPORT NEW COMPONENT

// --- Constants ---
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

interface UserSettingsProps {
  token: string;
  user: User;
  onLogout: () => void;
  onUserUpdate: (user: User) => void;
}

export default function UserSettings({
  token,
  user,
  onLogout,
  onUserUpdate,
}: UserSettingsProps) {
  const [displayName, setDisplayName] = useState(user.display_name || "");
  const [isSavingName, setIsSavingName] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [isChangingPass, setIsChangingPass] = useState(false);

  const [isLoggingOutAll, setIsLoggingOutAll] = useState(false);

  const [isConfirmDeleteOpen, setIsConfirmDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Update local state if user prop changes (e.g., after save)
  useEffect(() => {
    setDisplayName(user.display_name || "");
  }, [user.display_name]);

  const userName = user.display_name || user.email.split("@")[0];
  const gravatarUrl = `https://www.gravatar.com/avatar/${user.gravatar_hash}?s=96&d=mp`;

  const handleSaveProfile = async (e: FormEvent) => {
    e.preventDefault();
    setIsSavingName(true);
    try {
      const response = await fetch(`${API_URL}/api/users/me`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          display_name: displayName,
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || "Failed to update profile");
      }

      const updatedUser = await response.json();
      onUserUpdate(updatedUser);
      toast.success("Profile updated successfully!");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsSavingName(false);
    }
  };

  const handleChangePassword = async (e: FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      toast.error("New password must be at least 8 characters long.");
      return;
    }
    setIsChangingPass(true);
    try {
      const response = await fetch(`${API_URL}/api/users/change-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || "Failed to change password");
      }

      toast.success("Password changed! You will be logged out to re-validate.");
      // Force logout after password change for security
      setTimeout(() => {
        onLogout();
      }, 2000);
    } catch (err: any) {
      toast.error(err.message);
      setIsChangingPass(false); // Only set to false on error
    }
  };

  const handleLogoutAll = async () => {
    setIsLoggingOutAll(true);
    try {
      const response = await fetch(`${API_URL}/api/users/logout-all`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || "Failed to log out all sessions");
      }

      toast.success(
        "All other sessions have been logged out. Logging this device out."
      );
      setTimeout(() => {
        onLogout();
      }, 2000);
    } catch (err: any) {
      toast.error(err.message);
      setIsLoggingOutAll(false);
    }
  };

  const handleDeleteAccount = async () => {
    setIsDeleting(true);
    try {
      const response = await fetch(`${API_URL}/api/users/delete-account`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || "Failed to delete account");
      }

      toast.success("Account deleted successfully. Logging you out.");
      setTimeout(() => {
        onLogout();
      }, 2000);
    } catch (err: any) {
      toast.error(err.message);
      setIsDeleting(false);
      setIsConfirmDeleteOpen(false);
    }
  };

  return (
    <div className="space-y-8 max-w-2xl pb-16">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold capitalize text-gray-900 dark:text-white">
          Hello, {userName}
        </h1>
        <p className="mt-1 text-gray-500 dark:text-gray-400">
          Manage your account settings and preferences.
        </p>
      </div>

      {/* Profile Card */}
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
          Profile
        </h2>
        <form onSubmit={handleSaveProfile} className="mt-4 space-y-4">
          <div className="flex items-center gap-4">
            <img
              src={gravatarUrl}
              alt="Profile"
              className="h-24 w-24 rounded-full bg-gray-200 dark:bg-gray-700"
            />
            <div className="flex-1">
              <label
                htmlFor="display-name"
                className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                Display Name
              </label>
              <input
                type="text"
                id="display-name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="e.g., Mark"
                className="w-full rounded-md border border-gray-300 p-2.5 focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
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

      {/* Change Password Card */}
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
          Change Password
        </h2>
        <form onSubmit={handleChangePassword} className="mt-4 space-y-4">
          <div>
            <label
              htmlFor="current-pass"
              className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              Current Password
            </label>
            <input
              type="password"
              id="current-pass"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              className="w-full rounded-md border border-gray-300 p-2.5 focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            />
          </div>
          <div>
            <label
              htmlFor="new-pass"
              className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              New Password
            </label>
            <input
              type="password"
              id="new-pass"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={8}
              className="w-full rounded-md border border-gray-300 p-2.5 focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            />
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={isChangingPass}
              className="flex w-32 items-center justify-center rounded-lg bg-blue-600 px-5 py-2.5 text-center text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {isChangingPass ? (
                <Loader className="h-5 w-5 animate-spin" />
              ) : (
                "Save Password"
              )}
            </button>
          </div>
        </form>
      </div>

      {/* --- 4. RENDER NEW COMPONENT --- */}
      <ActiveSessions token={token} user={user} />

      {/* Security Card (Logout All) */}
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
          Sign out all other sessions
        </h2>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
          This will invalidate all sessions, including your current one, and you
          will need to log in again.
        </p>
        <div className="flex justify-end mt-4">
          <button
            onClick={handleLogoutAll}
            disabled={isLoggingOutAll}
            className="flex w-52 items-center justify-center rounded-lg bg-gray-600 px-5 py-2.5 text-center text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50 dark:bg-gray-500 dark:hover:bg-gray-600"
          >
            {isLoggingOutAll ? (
              <Loader className="h-5 w-5 animate-spin" />
            ) : (
              "Log out all other devices"
            )}
          </button>
        </div>
      </div>

      {/* Delete Account Card */}
      <div className="rounded-lg border border-red-300 bg-white p-6 shadow-sm dark:border-red-700 dark:bg-gray-800">
        <h2 className="text-xl font-semibold text-red-700 dark:text-red-400">
          Delete Account
        </h2>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
          Once you delete your account, all of your cameras will be permanently
          deleted. This action cannot be undone.
        </p>
        <div className="flex justify-end mt-4">
          <button
            onClick={() => setIsConfirmDeleteOpen(true)}
            disabled={isDeleting}
            className="flex w-36 items-center justify-center rounded-lg bg-red-600 px-5 py-2.5 text-center text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            {isDeleting ? (
              <Loader className="h-5 w-5 animate-spin" />
            ) : (
              "Delete My Account"
            )}
          </button>
        </div>
      </div>

      {/* Confirmation Modal */}
      <ConfirmDeleteModal
        isOpen={isConfirmDeleteOpen}
        onClose={() => setIsConfirmDeleteOpen(false)}
        onConfirm={handleDeleteAccount}
        cameraName="your account and all associated data"
        isDeleting={isDeleting}
      />
    </div>
  );
}
