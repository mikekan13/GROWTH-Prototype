"use client";

import { useSession, signIn, signOut } from "next-auth/react";
import { useState } from "react";

export default function GmailSetupPage() {
  const { data: session, status } = useSession();
  const [diagnostics, setDiagnostics] = useState<{
    success: boolean;
    message: string;
    steps?: { message: string; success: boolean; status: string; step: number; name: string; details: string | Record<string, unknown> }[];
    summary?: { overall: string; recommendation: string };
  } | null>(null);
  const [testing, setTesting] = useState(false);

  const runDiagnostics = async () => {
    setTesting(true);
    try {
      const response = await fetch('/api/debug/gmail-setup');
      const data = await response.json();
      setDiagnostics(data);
    } catch (error) {
      console.error('Diagnostics failed:', error);
    } finally {
      setTesting(false);
    }
  };

  const forceReAuth = async () => {
    await signOut({ redirect: false });
    setTimeout(() => {
      signIn('google', { redirect: false });
    }, 1000);
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">Gmail API Setup Diagnostics</h1>

        {status === "loading" && (
          <div className="bg-blue-900 p-4 rounded">Loading...</div>
        )}

        {!session && status !== "loading" && (
          <div className="bg-red-900 p-4 rounded mb-6">
            <h2 className="text-xl font-bold mb-2">❌ Not Authenticated</h2>
            <p className="mb-4">You need to sign in to test Gmail API functionality.</p>
            <button
              onClick={() => signIn('google')}
              className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded font-medium"
            >
              Sign In with Google
            </button>
          </div>
        )}

        {session && (
          <div className="space-y-6">
            <div className="bg-green-900 p-4 rounded">
              <h2 className="text-xl font-bold mb-2">✅ Authenticated</h2>
              <p>Signed in as: <strong>{session.user?.email}</strong></p>
              <div className="mt-4 space-x-4">
                <button
                  onClick={runDiagnostics}
                  disabled={testing}
                  className="bg-green-600 hover:bg-green-700 px-4 py-2 rounded font-medium disabled:opacity-50"
                >
                  {testing ? "Testing..." : "Run Gmail API Test"}
                </button>
                <button
                  onClick={forceReAuth}
                  className="bg-yellow-600 hover:bg-yellow-700 px-4 py-2 rounded font-medium"
                >
                  Re-authenticate (Force Fresh Tokens)
                </button>
                <button
                  onClick={() => signOut()}
                  className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded font-medium"
                >
                  Sign Out
                </button>
              </div>
            </div>

            {diagnostics && (
              <div className="bg-gray-800 p-6 rounded">
                <h2 className="text-xl font-bold mb-4">📊 Diagnostic Results</h2>
                <div className="space-y-4">
                  {diagnostics.steps?.map((step: { message: string; success: boolean; status: string; step: number; name: string; details: string | Record<string, unknown> }, index: number) => (
                    <div
                      key={index}
                      className={`p-4 rounded ${
                        step.status === 'success' ? 'bg-green-900' :
                        step.status === 'error' ? 'bg-red-900' : 'bg-yellow-900'
                      }`}
                    >
                      <h3 className="font-bold">
                        Step {step.step}: {step.name}
                        <span className="ml-2">
                          {step.status === 'success' ? '✅' :
                           step.status === 'error' ? '❌' : '🔄'}
                        </span>
                      </h3>
                      <div className="mt-2">
                        {typeof step.details === 'string' ? (
                          <p>{step.details}</p>
                        ) : (
                          <pre className="text-sm bg-gray-700 p-2 rounded mt-2 overflow-x-auto">
                            {JSON.stringify(step.details, null, 2)}
                          </pre>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {diagnostics.summary && (
                  <div className={`mt-6 p-4 rounded ${
                    diagnostics.summary.overall.includes('✅') ? 'bg-green-900' : 'bg-red-900'
                  }`}>
                    <h3 className="font-bold text-lg">{diagnostics.summary.overall}</h3>
                    <p className="mt-2">{diagnostics.summary.recommendation}</p>
                  </div>
                )}
              </div>
            )}

            <div className="bg-blue-900 p-4 rounded">
              <h3 className="font-bold mb-2">📋 Instructions:</h3>
              <ol className="list-decimal list-inside space-y-2">
                <li>If you just signed in, click &quot;Run Gmail API Test&quot; to verify functionality</li>
                <li>If the test fails with scope errors, click &quot;Re-authenticate&quot; to get fresh tokens</li>
                <li>Make sure to grant ALL permissions during re-authentication, especially Gmail</li>
                <li>The test will send a real email to your account ({session.user?.email}) if successful</li>
                <li>Check your inbox for the test email to confirm Gmail sending works</li>
              </ol>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}