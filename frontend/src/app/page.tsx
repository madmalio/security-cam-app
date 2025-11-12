"use client";

// This component is now protected by the AuthProvider
// It will only render if the user is logged in.
import DashboardPage from "./components/DashboardPage";

export default function Page() {
  return <DashboardPage />;
}
