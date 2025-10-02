/**
 * User Logout API
 * Destroys current session
 */

import { NextResponse } from 'next/server';
import { destroySession } from '@/lib/sessionManager';

export async function POST() {
  try {
    await destroySession();

    return NextResponse.json({
      success: true,
      message: 'Logged out successfully',
    });
  } catch (error) {
    console.error('Logout error:', error);
    return NextResponse.json(
      { error: 'Logout failed. Please try again.' },
      { status: 500 }
    );
  }
}
