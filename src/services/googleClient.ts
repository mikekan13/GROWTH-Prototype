"use client";

import { getSession } from "next-auth/react";

// Client-side Google API helper functions
export async function fetchSpreadsheetData(spreadsheetId: string, range?: string) {
  const session = await getSession();
  
  if (!session?.user) {
    throw new Error("Not authenticated");
  }

  const response = await fetch(`/api/sheets/${spreadsheetId}${range ? `?range=${encodeURIComponent(range)}` : ''}`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch spreadsheet data: ${response.statusText}`);
  }

  return response.json();
}

export async function fetchNamedRanges(spreadsheetId: string) {
  const session = await getSession();
  
  if (!session?.user) {
    throw new Error("Not authenticated");
  }

  const response = await fetch(`/api/sheets/${spreadsheetId}/named-ranges`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch named ranges: ${response.statusText}`);
  }

  return response.json();
}

export async function copySpreadsheetForPlayer(
  spreadsheetId: string,
  playerName: string,
  playerEmail: string
) {
  const session = await getSession();
  
  if (!session?.user) {
    throw new Error("Not authenticated");
  }

  const response = await fetch("/api/sheets/copy", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      spreadsheetId,
      playerName,
      playerEmail,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to copy spreadsheet: ${response.statusText}`);
  }

  return response.json();
}