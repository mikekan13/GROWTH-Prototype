"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";

interface NamedRange {
  name: string;
  sheetName: string;
  sheetId: number;
  a1Notation: string;
  range: {
    startRow?: number;
    endRow?: number;
    startColumn?: number;
    endColumn?: number;
    startColumnLetter?: string;
    endColumnLetter?: string;
  };
  rawRange: unknown;
}

interface NamedRangesResponse {
  success: boolean;
  templateId: string;
  templateName: string;
  totalNamedRanges: number;
  categorizedRanges: {
    attributes: NamedRange[];
    skills: NamedRange[];
    inventory: NamedRange[];
    character: NamedRange[];
    combat: NamedRange[];
    other: NamedRange[];
  };
  allNamedRanges: NamedRange[];
  sheets: Array<{ name: string; sheetId: number }>;
  url: string;
  error?: string;
}

export default function TestNamedRangesPage() {
  const { data: session, status } = useSession();
  const [namedRanges, setNamedRanges] = useState<NamedRangesResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchNamedRanges = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/sheets/template-named-ranges");
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to fetch named ranges");
      }

      setNamedRanges(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  if (status === "loading") {
    return <div className="p-8">Loading session...</div>;
  }

  if (!session) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold mb-4">Test Named Ranges</h1>
        <p>Please sign in to test the named ranges API.</p>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">Character Template Named Ranges</h1>

      <div className="mb-6">
        <button
          onClick={fetchNamedRanges}
          disabled={loading}
          className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50"
        >
          {loading ? "Loading..." : "Fetch Named Ranges"}
        </button>
      </div>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-6">
          <strong>Error:</strong> {error}
        </div>
      )}

      {namedRanges && (
        <div className="space-y-6">
          {/* Summary */}
          <div className="bg-gray-100 p-4 rounded">
            <h2 className="text-xl font-semibold mb-2">Template Summary</h2>
            <p><strong>Template:</strong> {namedRanges.templateName}</p>
            <p><strong>Template ID:</strong> {namedRanges.templateId}</p>
            <p><strong>Total Named Ranges:</strong> {namedRanges.totalNamedRanges}</p>
            <p><strong>URL:</strong> <a href={namedRanges.url} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">{namedRanges.url}</a></p>
          </div>

          {/* Sheets */}
          <div className="bg-gray-100 p-4 rounded">
            <h2 className="text-xl font-semibold mb-2">Sheets in Template</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {namedRanges.sheets.map((sheet) => (
                <div key={sheet.sheetId} className="bg-white p-2 rounded border">
                  <strong>{sheet.name}</strong> (ID: {sheet.sheetId})
                </div>
              ))}
            </div>
          </div>

          {/* Categorized Named Ranges */}
          <div>
            <h2 className="text-xl font-semibold mb-4">Categorized Named Ranges</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {Object.entries(namedRanges.categorizedRanges).map(([category, ranges]) => (
                <div key={category} className="bg-white border rounded-lg p-4">
                  <h3 className="text-lg font-semibold mb-3 capitalize text-blue-600">{category}</h3>
                  {ranges.length > 0 ? (
                    <div className="space-y-2">
                      {ranges.map((range, index) => (
                        <div key={index} className="border-l-4 border-blue-200 pl-3">
                          <div className="font-medium text-sm">{range.name}</div>
                          <div className="text-xs text-gray-600">{range.a1Notation}</div>
                          <div className="text-xs text-gray-500">Sheet: {range.sheetName}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-gray-500 text-sm">No named ranges found in this category</p>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* All Named Ranges Table */}
          <div>
            <h2 className="text-xl font-semibold mb-4">All Named Ranges</h2>
            <div className="overflow-x-auto">
              <table className="min-w-full bg-white border border-gray-300">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 border-b text-left">Name</th>
                    <th className="px-4 py-2 border-b text-left">Sheet</th>
                    <th className="px-4 py-2 border-b text-left">A1 Notation</th>
                    <th className="px-4 py-2 border-b text-left">Range Details</th>
                  </tr>
                </thead>
                <tbody>
                  {namedRanges.allNamedRanges.map((range, index) => (
                    <tr key={index} className={index % 2 === 0 ? "bg-gray-50" : "bg-white"}>
                      <td className="px-4 py-2 border-b font-medium">{range.name}</td>
                      <td className="px-4 py-2 border-b">{range.sheetName}</td>
                      <td className="px-4 py-2 border-b font-mono text-sm">{range.a1Notation}</td>
                      <td className="px-4 py-2 border-b text-sm text-gray-600">
                        {range.range.startColumnLetter}{range.range.startRow}
                        {range.range.endColumnLetter && range.range.endRow &&
                          ` to ${range.range.endColumnLetter}${range.range.endRow}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Raw Data for Development */}
          <details className="bg-gray-100 p-4 rounded">
            <summary className="cursor-pointer font-semibold">Raw Data (for Development)</summary>
            <pre className="mt-4 bg-gray-800 text-green-400 p-4 rounded overflow-x-auto text-xs">
              {JSON.stringify(namedRanges, null, 2)}
            </pre>
          </details>
        </div>
      )}
    </div>
  );
}