"use client";

import { useSession, signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function Home() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "authenticated" && session?.user) {
      // Redirect based on user role
      const userRole = (session.user as { role?: string })?.role || "WATCHER";

      if (userRole === "WATCHER") {
        router.push("/campaigns");
      } else {
        router.push("/trailblazer");
      }
    }
  }, [status, session, router]);

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (status === "unauthenticated") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full space-y-8">
          <div className="text-center">
            <h1 className="mt-6 text-4xl font-extrabold text-gray-900">
              GROWTH Prototype
            </h1>
            <p className="mt-4 text-lg text-gray-600">
              Local GM web app for GROWTH tabletop RPG campaigns
            </p>
          </div>
          
          <div className="space-y-4">
            <button
              onClick={() => signIn("google")}
              className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              Sign in with Google
            </button>
            
            <div className="text-center text-xs text-gray-500">
              <p>This will request access to:</p>
              <ul className="mt-1 space-y-1">
                <li>• Google Drive (read/write spreadsheets)</li>
                <li>• Google Sheets (parse character data)</li>
              </ul>
            </div>
          </div>

          <div className="mt-8 text-center">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Features</h2>
            <div className="grid grid-cols-1 gap-4 text-sm text-gray-600">
              <div className="bg-white p-4 rounded-lg shadow">
                <h3 className="font-medium text-gray-900">Sheet Integration</h3>
                <p>Connect and parse Google Sheets character data</p>
              </div>
              <div className="bg-white p-4 rounded-lg shadow">
                <h3 className="font-medium text-gray-900">Character Management</h3>
                <p>View and manage PC/NPC characters across campaigns</p>
              </div>
              <div className="bg-white p-4 rounded-lg shadow">
                <h3 className="font-medium text-gray-900">Dice Rolling</h3>
                <p>Built-in dice roller with session logging</p>
              </div>
              <div className="bg-white p-4 rounded-lg shadow">
                <h3 className="font-medium text-gray-900">GM Dashboard</h3>
                <p>Campaign management and turn tracking</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Authenticated but still on home page
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
    </div>
  );
}