"use client";

import React, { useState, FormEvent } from "react";
import { toast } from "sonner";
import ConfirmDeleteModal from "./ConfirmDeleteModal";
import { Loader } from "lucide-react";
import { useAuth } from "@/app/contexts/AuthContext"; // <-- 1. IMPORT
import ActiveSessions from "./ActiveSessions";

// 2. No more props!
export default function SecuritySettings() {
  // 3. Get user, api, and logout from context
  const { user, api, logout } = useAuth();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [isChangingPass, setIsChangingPass] = useState(false);

  const [isLoggingOutAll, setIsLoggingOutAll] = useState(false);

  const [isConfirmDeleteOpen, setIsConfirmDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  if (!user) return null; // Loading state

  // 4. Update to use 'api' hook
  const handleChangePassword = async (e: FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      toast.error("New password must be at least 8 characters long.");
      return;
    }
    setIsChangingPass(true);
    try {
      const response = await api("/api/users/change-password", {
        method: "POST",
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
        }),
      });
      if (!response) return;

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || "Failed to change password");
      }

      toast.success("Password changed! You will be logged out to re-validate.");
      setTimeout(() => {
        logout(); // <-- Use context logout
      }, 2000);
    } catch (err: any) {
      toast.error(err.message);
      setIsChangingPass(false);
    }
  };

  // 5. Update to use 'api' hook
  const handleLogoutAll = async () => {
    setIsLoggingOutAll(true);
    try {
      const response = await api("/api/users/logout-all", {
        method: "POST",
      });
      if (!response) return;

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || "Failed to log out all sessions");
      }

      toast.success(
        "All other sessions have been logged out. Logging this device out."
      );
      setTimeout(() => {
        logout(); // <-- Use context logout
      }, 2000);
    } catch (err: any) {
      toast.error(err.message);
      setIsLoggingOutAll(false);
    }
  };

  // 6. Update to use 'api' hook
  const handleDeleteAccount = async () => {
    setIsDeleting(true);
    try {
      const response = await api("/api/users/delete-account", {
        method: "DELETE",
      });
      if (!response) return;

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || "Failed to delete account");
      }

      toast.success("Account deleted successfully. Logging you out.");
      setTimeout(() => {
        logout(); // <-- Use context logout
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
        <h1 className="text-3xl font-semibold text-gray-900 dark:text-white">
          Security
        </h1>
        <p className="mt-1 text-gray-500 dark:text-zinc-400">
          Manage your password, active sessions, and account deletion.
        </p>
      </div>

      {/* Change Password Card */}
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-zinc-700 dark:bg-zinc-800">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
          Change Password
        </h2>
        <form onSubmit={handleChangePassword} className="mt-4 space-y-4">
          <div>
            <label
              htmlFor="current-pass"
              className="mb-2 block text-sm font-medium text-gray-700 dark:text-zinc-300"
            >
              Current Password
            </label>
            <input
              type="password"
              id="current-pass"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              placeholder="••••••••"
              className="w-full rounded-md border border-gray-300 p-2.5 text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:ring-blue-500 dark:border-zinc-600 dark:bg-zinc-700 dark:text-white dark:placeholder:text-zinc-500"
            />
          </div>
          <div>
            <label
              htmlFor="new-pass"
              className="mb-2 block text-sm font-medium text-gray-700 dark:text-zinc-300"
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
              placeholder="Minimum 8 characters"
              className="w-full rounded-md border border-gray-300 p-2.5 text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:ring-blue-500 dark:border-zinc-600 dark:bg-zinc-700 dark:text-white dark:placeholder:text-zinc-500"
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

      {/* Active Sessions */}
      <ActiveSessions />
      {/* 7. No more props needed */}

      {/* Security Card (Logout All) */}
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-zinc-700 dark:bg-zinc-800">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
          Sign out all other sessions
        </h2>
        <p className="mt-2 text-sm text-gray-600 dark:text-zinc-400">
          This will invalidate all sessions, including your current one, and you
          will need to log in again.
        </p>
        <div className="flex justify-end mt-4">
          <button
            onClick={handleLogoutAll}
            disabled={isLoggingOutAll}
            className="flex w-52 items-center justify-center rounded-lg bg-gray-600 px-5 py-2.5 text-center text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50 dark:bg-zinc-600 dark:hover:bg-zinc-500"
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
      <div className="rounded-lg border border-red-300 bg-white p-6 shadow-sm dark:border-red-700 dark:bg-zinc-800">
        <h2 className="text-xl font-semibold text-red-700 dark:text-red-400">
          Delete Account
        </h2>
        <p className="mt-2 text-sm text-gray-600 dark:text-zinc-400">
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
