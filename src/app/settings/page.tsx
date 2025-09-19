"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface AppConfig {
  rootFolderId?: string;
}

export default function SettingsPage() {
  const [config, setConfig] = useState<AppConfig>({});
  const [rootFolderId, setRootFolderId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [folders, setFolders] = useState<Array<{ id: string; name: string }>>([]);

  useEffect(() => {
    fetchConfig();
    fetchFolders();
  }, []);

  const fetchConfig = async () => {
    try {
      const response = await fetch('/api/admin/config');
      if (response.ok) {
        const data = await response.json();
        setConfig(data.config);
        setRootFolderId(data.config.rootFolderId || "");
      }
    } catch (error) {
      console.error("Failed to fetch config:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchFolders = async () => {
    try {
      const response = await fetch("/api/folders");
      if (response.ok) {
        const data = await response.json();
        setFolders(data.folders || []);
      }
    } catch (error) {
      console.error("Failed to fetch folders:", error);
    }
  };

  const saveConfig = async () => {
    setSaving(true);
    try {
      const response = await fetch('/api/admin/config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          rootFolderId: rootFolderId || undefined,
        }),
      });

      if (response.ok) {
        const result = await response.json();
        const newConfig = {
          ...config,
          rootFolderId: rootFolderId || undefined,
        };
        setConfig(newConfig);
        alert(result.message || "Settings saved successfully!");
      } else {
        const error = await response.json();
        throw new Error(error.error || 'Failed to save settings');
      }
    } catch (error) {
      console.error("Failed to save settings:", error);
      alert(`Failed to save settings: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setSaving(false);
    }
  };

  const handleRootFolderChange = (value: string) => {
    const urlMatch = value.match(/\/folders\/([a-zA-Z0-9-_]+)/);
    const folderId = urlMatch ? urlMatch[1] : value.trim();
    setRootFolderId(folderId);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
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
                <span className="text-gray-900">Settings</span>
              </nav>
              <h1 className="text-2xl font-bold text-gray-900">App Settings</h1>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-medium text-gray-900 mb-6">Google Drive Configuration</h2>

          {/* Root Folder Configuration */}
          <div className="mb-8">
            <h3 className="text-md font-medium text-gray-900 mb-4">Google Drive Root Folder</h3>
            <p className="text-sm text-gray-600 mb-4">
              Set the main Google Drive folder where all campaign subfolders will be created.
              This folder must be shared with the service account: <code className="bg-gray-100 px-1 py-0.5 rounded">growth-rpg-bot@grow-system.iam.gserviceaccount.com</code>
            </p>

            <div className="mb-4">
              <label htmlFor="root-folder" className="block text-sm font-medium text-gray-700 mb-2">
                Root Folder ID or URL
              </label>
              <input
                id="root-folder"
                type="text"
                value={rootFolderId}
                onChange={(e) => handleRootFolderChange(e.target.value)}
                placeholder="https://drive.google.com/drive/folders/... or folder ID"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 text-gray-900"
              />
            </div>

            {folders.length > 0 && (
              <div className="mb-4">
                <label htmlFor="folder-select" className="block text-sm font-medium text-gray-700 mb-2">
                  Or select from accessible folders:
                </label>
                <select
                  id="folder-select"
                  value={rootFolderId}
                  onChange={(e) => setRootFolderId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 text-gray-900"
                >
                  <option value="">Select a folder...</option>
                  {folders.map((folder) => (
                    <option key={folder.id} value={folder.id}>
                      {folder.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {config.rootFolderId && (
              <div className="mt-4 p-3 bg-green-50 rounded-md">
                <div className="text-sm text-green-800">
                  <strong>Current Root Folder:</strong> {config.rootFolderId}
                </div>
                <a
                  href={`https://drive.google.com/drive/folders/${config.rootFolderId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-green-600 hover:text-green-700"
                >
                  View in Google Drive →
                </a>
              </div>
            )}
          </div>

          {/* Save Button */}
          <div className="flex justify-end">
            <button
              onClick={saveConfig}
              disabled={saving}
              className="px-6 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save Settings"}
            </button>
          </div>
        </div>

        {/* Instructions */}
        <div className="mt-8 bg-yellow-50 border-l-4 border-yellow-400 p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-yellow-800">Setup Instructions</h3>
              <div className="mt-2 text-sm text-yellow-700">
                <ol className="list-decimal list-inside space-y-1">
                  <li>Create a folder in Google Drive for your campaigns</li>
                  <li>Share it with: <code className="bg-yellow-100 px-1 py-0.5 rounded">growth-rpg-bot@grow-system.iam.gserviceaccount.com</code> (Editor access)</li>
                  <li>Copy the folder URL or ID and paste it above</li>
                  <li>Save the settings</li>
                  <li>Campaign subfolders will be automatically created as needed</li>
                </ol>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}