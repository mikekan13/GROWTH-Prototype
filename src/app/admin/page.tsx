"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

export default function AdminPage() {
  const [loading, setLoading] = useState(true);
  const [unauthorized, setUnauthorized] = useState(false);

  useEffect(() => {
    checkAdminAccess();
  }, []);

  const checkAdminAccess = async () => {
    try {
      const response = await fetch('/api/admin/krma/wallets');
      if (response.status === 403) {
        setUnauthorized(true);
      }
    } catch (error) {
      console.error("Failed to check admin access:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (unauthorized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full space-y-8">
          <div className="text-center">
            <h1 className="mt-6 text-3xl font-extrabold text-gray-900">
              Access Denied
            </h1>
            <p className="mt-2 text-sm text-gray-600">
              Admin access is restricted to authorized users only.
            </p>
            <div className="mt-6">
              <Link
                href="/campaigns"
                className="text-indigo-600 hover:text-indigo-500"
              >
                ← Return to Campaigns
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <div>
              <nav className="flex items-center space-x-2 text-sm text-gray-600 mb-2">
                <Link href="/campaigns" className="hover:text-indigo-600">
                  Campaigns
                </Link>
                <span>/</span>
                <span className="text-gray-900">Admin</span>
              </nav>
              <h1 className="text-2xl font-bold text-gray-900">Admin Panel</h1>
              <p className="text-sm text-gray-600">System administration and user management</p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Admin Navigation */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <Link href="/admin/invite-codes" className="block">
            <div className="bg-white rounded-lg shadow p-6 hover:shadow-md transition-shadow">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="w-8 h-8 bg-red-100 rounded-lg flex items-center justify-center">
                    <span className="text-red-600 font-bold text-lg">🎫</span>
                  </div>
                </div>
                <div className="ml-4">
                  <h3 className="text-lg font-medium text-gray-900">GM Invite Codes</h3>
                  <p className="text-sm text-gray-500">Generate and manage GM invitation codes</p>
                </div>
              </div>
            </div>
          </Link>

          <Link href="/admin/krma" className="block">
            <div className="bg-white rounded-lg shadow p-6 hover:shadow-md transition-shadow">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
                    <span className="text-green-600 font-bold text-lg">₭</span>
                  </div>
                </div>
                <div className="ml-4">
                  <h3 className="text-lg font-medium text-gray-900">KRMA Administration</h3>
                  <p className="text-sm text-gray-500">View wallet distributions and token flows</p>
                </div>
              </div>
            </div>
          </Link>

          <Link href="/admin/users" className="block">
            <div className="bg-white rounded-lg shadow p-6 hover:shadow-md transition-shadow">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center">
                    <span className="text-purple-600 font-bold text-lg">👥</span>
                  </div>
                </div>
                <div className="ml-4">
                  <h3 className="text-lg font-medium text-gray-900">User Management</h3>
                  <p className="text-sm text-gray-500">Manage user accounts and permissions</p>
                </div>
              </div>
            </div>
          </Link>
        </div>

        {/* Quick Stats */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-medium text-gray-900 mb-4">System Overview</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <div className="text-2xl font-bold text-gray-900">🎯</div>
              <div className="text-sm text-gray-600 mt-1">Admin Panel</div>
              <div className="text-xs text-gray-500">Full system access</div>
            </div>
            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <div className="text-2xl font-bold text-gray-900">₭</div>
              <div className="text-sm text-gray-600 mt-1">KRMA System</div>
              <div className="text-xs text-gray-500">Token economics</div>
            </div>
            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <div className="text-2xl font-bold text-gray-900">👥</div>
              <div className="text-sm text-gray-600 mt-1">User Management</div>
              <div className="text-xs text-gray-500">Account administration</div>
            </div>
          </div>
        </div>

        {/* Info */}
        <div className="mt-8 bg-blue-50 border-l-4 border-blue-400 p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-blue-800">Admin Features</h3>
              <div className="mt-2 text-sm text-blue-700">
                <ul className="list-disc list-inside space-y-1">
                  <li><strong>GM Invite Codes:</strong> Generate and manage invite codes for new Game Masters</li>
                  <li><strong>KRMA Administration:</strong> Monitor token distribution, wallet balances, and conservation laws</li>
                  <li><strong>User Management:</strong> View and manage user accounts, roles, and permissions</li>
                  <li><strong>App Settings:</strong> Regular app settings are available in the <Link href="/settings" className="underline">Settings page</Link></li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}