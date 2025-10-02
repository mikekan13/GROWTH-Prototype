/**
 * User Registration API
 * Handles both GM (with invite code) and Player (with player invite) registration
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { hashPassword, validateEmail, validatePassword, validateUsername } from '@/lib/passwordUtils';
import { isValidGMInviteCodeFormat } from '@/lib/inviteCodeGenerator';
import { createSession } from '@/lib/sessionManager';
import { KrmaTokenomics } from '@/lib/krmaTokenomics';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { username, email, password, name, gmInviteCode, playerInviteToken } = body;

    // Validate required fields
    const usernameValidation = validateUsername(username);
    if (!usernameValidation.valid) {
      return NextResponse.json({ error: usernameValidation.error }, { status: 400 });
    }

    const emailValidation = validateEmail(email);
    if (!emailValidation.valid) {
      return NextResponse.json({ error: emailValidation.error }, { status: 400 });
    }

    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
      return NextResponse.json({ error: passwordValidation.error }, { status: 400 });
    }

    // Check if username or email already exists
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          { username },
          { email },
        ],
      },
    });

    if (existingUser) {
      if (existingUser.username === username) {
        return NextResponse.json({ error: 'Username already taken' }, { status: 400 });
      }
      return NextResponse.json({ error: 'Email already registered' }, { status: 400 });
    }

    // Determine registration type: GM or Player
    let role: 'WATCHER' | 'TRAILBLAZER' = 'WATCHER';
    let gmId: string | undefined;

    if (gmInviteCode) {
      // GM Registration
      if (!isValidGMInviteCodeFormat(gmInviteCode)) {
        return NextResponse.json({ error: 'Invalid GM invite code format' }, { status: 400 });
      }

      const inviteCode = await prisma.gMInviteCode.findUnique({
        where: { code: gmInviteCode },
      });

      if (!inviteCode) {
        return NextResponse.json({ error: 'Invalid GM invite code' }, { status: 400 });
      }

      if (!inviteCode.isActive) {
        return NextResponse.json({ error: 'GM invite code is no longer active' }, { status: 400 });
      }

      if (inviteCode.usedBy) {
        return NextResponse.json({ error: 'GM invite code has already been used' }, { status: 400 });
      }

      if (inviteCode.expiresAt && inviteCode.expiresAt < new Date()) {
        return NextResponse.json({ error: 'GM invite code has expired' }, { status: 400 });
      }

      role = 'WATCHER';
    } else if (playerInviteToken) {
      // Player Registration
      const playerInvite = await prisma.playerInvitation.findUnique({
        where: { inviteToken: playerInviteToken },
        include: { gm: true },
      });

      if (!playerInvite) {
        return NextResponse.json({ error: 'Invalid player invite' }, { status: 400 });
      }

      if (playerInvite.status !== 'PENDING') {
        return NextResponse.json({ error: 'Player invite is no longer valid' }, { status: 400 });
      }

      if (playerInvite.expiresAt < new Date()) {
        return NextResponse.json({ error: 'Player invite has expired' }, { status: 400 });
      }

      // Check if GM has available seats
      const currentPlayers = await prisma.playerProfile.count({
        where: {
          gmId: playerInvite.gmId,
          isActive: true,
        },
      });

      if (currentPlayers >= playerInvite.gm.maxPlayerSeats) {
        return NextResponse.json({ error: 'GM has no available player seats' }, { status: 400 });
      }

      role = 'TRAILBLAZER';
      gmId = playerInvite.gmId;
    } else {
      return NextResponse.json(
        { error: 'Either gmInviteCode or playerInviteToken is required' },
        { status: 400 }
      );
    }

    // Hash password
    const hashedPassword = await hashPassword(password);

    // Create user
    const user = await prisma.user.create({
      data: {
        username,
        email,
        password: hashedPassword,
        name: name || username,
        role,
      },
    });

    // Handle role-specific setup
    if (role === 'WATCHER') {
      // Create GM Profile and wallet
      await KrmaTokenomics.onGMSignup(user.id, 1);

      // Mark GM invite code as used
      if (gmInviteCode) {
        await prisma.gMInviteCode.update({
          where: { code: gmInviteCode },
          data: {
            usedBy: user.id,
            usedAt: new Date(),
          },
        });
      }
    } else if (role === 'TRAILBLAZER' && gmId) {
      // Create Player Profile
      await prisma.playerProfile.create({
        data: {
          userId: user.id,
          gmId,
        },
      });

      // Mark player invitation as accepted
      if (playerInviteToken) {
        await prisma.playerInvitation.update({
          where: { inviteToken: playerInviteToken },
          data: {
            status: 'ACCEPTED',
          },
        });
      }
    }

    // Create session
    await createSession(user.id);

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    });
  } catch (error) {
    console.error('Registration error:', error);
    return NextResponse.json(
      { error: 'Registration failed. Please try again.' },
      { status: 500 }
    );
  }
}
