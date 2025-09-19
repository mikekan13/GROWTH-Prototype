"use client";

import { signIn, getSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, Suspense } from "react";

function SignInContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const authError = searchParams.get("error");

  useEffect(() => {
    if (authError) {
      setError("Authentication failed. Please try again.");
    }
  }, [authError]);

  useEffect(() => {
    getSession().then((session) => {
      if (session) {
        router.push("/");
      }
    });
  }, [router]);

  const handleSignIn = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const result = await signIn("google", { 
        callbackUrl: "/",
        redirect: false
      });
      
      if (result?.error) {
        setError("Authentication failed. Please try again.");
        setLoading(false);
      } else if (result?.url) {
        router.push(result.url);
      }
    } catch (error) {
      console.error("Sign-in error:", error);
      setError("An unexpected error occurred. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            GROWTH Prototype
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Sign in with your Google account to manage campaigns
          </p>
        </div>
        {error && (
          <div className="rounded-md bg-red-50 p-4">
            <div className="text-sm text-red-700">{error}</div>
          </div>
        )}
        <div>
          <button
            onClick={handleSignIn}
            disabled={loading}
            className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
          >
            {loading ? "Signing in..." : "Sign in with Google"}
          </button>
        </div>
        <div className="text-center">
          <p className="text-xs text-gray-500">
            This will request access to Google Drive and Sheets
          </p>
        </div>
      </div>
    </div>
  );
}

export default function SignIn() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-600">Loading...</div>
      </div>
    }>
      <SignInContent />
    </Suspense>
  );
}