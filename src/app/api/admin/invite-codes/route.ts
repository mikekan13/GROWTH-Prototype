/**
 * Admin GM Invite Code Management API
 * Allows admin to generate and manage GM invite codes
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/sessionManager';
import { generateGMInviteCodes } from '@/lib/inviteCodeGenerator';

/**
 * GET /api/admin/invite-codes
 * List all GM invite codes
 */
export async function GET() {
  try {
    await requireAdmin();

    const inviteCodes = await prisma.gMInviteCode.findMany({
      orderBy: { createdAt: 'desc' },
    });

    // Fetch user details for used codes
    const codesWithUsers = await Promise.all(
      inviteCodes.map(async (code) => {
        if (code.usedBy) {
          const user = await prisma.user.findUnique({
            where: { id: code.usedBy },
            select: { username: true, email: true, name: true },
          });
          return { ...code, user };
        }
        return { ...code, user: null };
      })
    );

    return NextResponse.json({ inviteCodes: codesWithUsers });
  } catch (error) {
    if (error instanceof Error && error.message.includes('Forbidden')) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }
    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    console.error('Error fetching invite codes:', error);
    return NextResponse.json({ error: 'Failed to fetch invite codes' }, { status: 500 });
  }
}

/**
 * POST /api/admin/invite-codes
 * Generate new GM invite codes
 */
export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdmin();
    const body = await request.json();
    const { count = 1, expiresInDays } = body;

    if (count < 1 || count > 100) {
      return NextResponse.json(
        { error: 'Count must be between 1 and 100' },
        { status: 400 }
      );
    }

    // Generate unique codes
    const codes = generateGMInviteCodes(count);

    // Calculate expiration date if specified
    let expiresAt: Date | null = null;
    if (expiresInDays && expiresInDays > 0) {
      expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + expiresInDays);
    }

    // Create codes in database
    const createdCodes = await Promise.all(
      codes.map((code) =>
        prisma.gMInviteCode.create({
          data: {
            code,
            createdBy: admin.id,
            expiresAt,
          },
        })
      )
    );

    return NextResponse.json({
      success: true,
      inviteCodes: createdCodes,
      message: `Generated ${count} GM invite code(s)`,
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('Forbidden')) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }
    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    console.error('Error generating invite codes:', error);
    return NextResponse.json({ error: 'Failed to generate invite codes' }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/invite-codes
 * Deactivate a GM invite code
 */
export async function DELETE(request: NextRequest) {
  try {
    await requireAdmin();
    const body = await request.json();
    const { codeId } = body;

    if (!codeId) {
      return NextResponse.json({ error: 'Code ID is required' }, { status: 400 });
    }

    const updatedCode = await prisma.gMInviteCode.update({
      where: { id: codeId },
      data: { isActive: false },
    });

    return NextResponse.json({
      success: true,
      inviteCode: updatedCode,
      message: 'Invite code deactivated',
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('Forbidden')) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }
    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    console.error('Error deactivating invite code:', error);
    return NextResponse.json({ error: 'Failed to deactivate invite code' }, { status: 500 });
  }
}
