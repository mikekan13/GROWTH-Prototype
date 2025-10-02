"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";

export default function Home() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if user is already logged in
    fetch('/api/auth/session')
      .then(res => res.json())
      .then(data => {
        if (data.user) {
          // Redirect based on user role
          const userRole = data.user.role || "WATCHER";

          if (userRole === "ADMIN" || userRole === "WATCHER") {
            router.push("/campaigns");
          } else if (userRole === "TRAILBLAZER") {
            router.push("/trailblazer");
          }
        } else {
          setLoading(false);
        }
      })
      .catch(() => {
        setLoading(false);
      });
  }, [router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <h1 className="mt-6 text-4xl font-extrabold text-white">
            GROWTH Prototype
          </h1>
          <p className="mt-4 text-lg text-gray-300">
            Local GM web app for GROWTH tabletop RPG campaigns
          </p>
        </div>

        <div className="space-y-4">
          <Link
            href="/login"
            className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            Sign In
          </Link>

          <Link
            href="/register"
            className="w-full flex justify-center py-3 px-4 border border-gray-600 rounded-md shadow-sm text-sm font-medium text-gray-300 bg-gray-800 hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
          >
            Register
          </Link>
        </div>

        <div className="mt-8 text-center">
          <h2 className="text-lg font-semibold text-white mb-4">Features</h2>
          <div className="grid grid-cols-1 gap-4 text-sm text-gray-300">
            <div className="bg-gray-800 p-4 rounded-lg shadow">
              <h3 className="font-medium text-white">Campaign Management</h3>
              <p>Create and manage GROWTH campaigns with players</p>
            </div>
            <div className="bg-gray-800 p-4 rounded-lg shadow">
              <h3 className="font-medium text-white">Character Management</h3>
              <p>Track characters with GROWTH attributes and backstories</p>
            </div>
            <div className="bg-gray-800 p-4 rounded-lg shadow">
              <h3 className="font-medium text-white">KRMA System</h3>
              <p>Integrated KRMA wallet and tokenomics</p>
            </div>
            <div className="bg-gray-800 p-4 rounded-lg shadow">
              <h3 className="font-medium text-white">GM Dashboard</h3>
              <p>Full campaign management and player invitation system</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
