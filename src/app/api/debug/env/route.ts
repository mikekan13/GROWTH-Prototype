/**
 * Debug endpoint to check environment variables
 */
import { NextRequest, NextResponse } from "next/server";

export async function GET(_request: NextRequest) {
  return NextResponse.json({
    NODE_ENV: process.env.NODE_ENV,
    allEnvKeys: Object.keys(process.env).filter(key =>
      key.includes('NODE') || key.includes('TEST') || key.includes('DEV')
    ),
    timestamp: new Date().toISOString()
  });
}