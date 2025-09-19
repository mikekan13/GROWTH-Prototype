import { prisma } from "./prisma";
import { randomBytes } from "crypto";
import { EmailService } from "./emailService";

export interface InvitePlayerRequest {
  gmId: string;
  playerEmail: string;
}

export interface AcceptInvitationRequest {
  inviteToken: string;
  userId: string;
}

export class PlayerInvitationService {
  static readonly MAX_PLAYERS_PER_GM = 6;
  static readonly INVITATION_EXPIRY_DAYS = 7;

  /**
   * GM invites a player
   */
  static async invitePlayer(request: InvitePlayerRequest): Promise<{ inviteToken: string; gmName: string; playerEmail: string }> {
    return prisma.$transaction(async (tx) => {
      // Check if GM exists
      const gmProfile = await tx.gMProfile.findUnique({
        where: { id: request.gmId },
        include: { players: { where: { isActive: true } } }
      });

      if (!gmProfile) {
        throw new Error("GM profile not found");
      }

      // Check player limit
      if (gmProfile.players.length >= this.MAX_PLAYERS_PER_GM) {
        throw new Error(`GM already has maximum of ${this.MAX_PLAYERS_PER_GM} players`);
      }

      // Check if player is already invited or is a member
      const existingInvitation = await tx.playerInvitation.findUnique({
        where: {
          gmId_playerEmail: {
            gmId: request.gmId,
            playerEmail: request.playerEmail
          }
        }
      });

      if (existingInvitation && existingInvitation.status === "PENDING") {
        throw new Error("Player already has a pending invitation from this GM");
      }

      // Check if player is already a member
      const existingUser = await tx.user.findUnique({
        where: { email: request.playerEmail },
        include: { playerProfile: true }
      });

      if (existingUser?.playerProfile?.gmId === request.gmId) {
        throw new Error("Player is already a member of this GM's group");
      }

      // Generate unique invite token
      const inviteToken = randomBytes(32).toString('hex');
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + this.INVITATION_EXPIRY_DAYS);

      // Create or update invitation
      await tx.playerInvitation.upsert({
        where: {
          gmId_playerEmail: {
            gmId: request.gmId,
            playerEmail: request.playerEmail
          }
        },
        create: {
          gmId: request.gmId,
          playerEmail: request.playerEmail,
          inviteToken,
          expiresAt,
          status: "PENDING"
        },
        update: {
          inviteToken,
          expiresAt,
          status: "PENDING",
          updatedAt: new Date()
        }
      });

      // Get GM information for email
      const gmWithUser = await tx.gMProfile.findUnique({
        where: { id: request.gmId },
        include: { user: true }
      });

      const gmName = gmWithUser?.user.name || 'Your GM';

      return { inviteToken, gmName, playerEmail: request.playerEmail };
    });
  }

  /**
   * Send invitation email after database transaction
   */
  private static async sendInvitationEmail(
    playerEmail: string, 
    gmName: string, 
    inviteToken: string
  ): Promise<boolean> {
    try {
      const result = await EmailService.sendPlayerInvitation(
        playerEmail,
        gmName,
        inviteToken
      );
      return result.success;
    } catch (error) {
      console.error('Failed to send invitation email:', error);
      return false;
    }
  }

  /**
   * Complete invitation process - create DB record and send email
   */
  static async invitePlayerComplete(request: InvitePlayerRequest): Promise<{ inviteToken: string; emailSent: boolean }> {
    // First create the invitation in the database
    const { inviteToken, gmName, playerEmail } = await this.invitePlayer(request);
    
    // Then send the email
    const emailSent = await this.sendInvitationEmail(playerEmail, gmName, inviteToken);
    
    return { inviteToken, emailSent };
  }

  /**
   * Player accepts invitation
   */
  static async acceptInvitation(request: AcceptInvitationRequest): Promise<void> {
    return prisma.$transaction(async (tx) => {
      // Find and validate invitation
      const invitation = await tx.playerInvitation.findUnique({
        where: { inviteToken: request.inviteToken },
        include: { gm: { include: { players: { where: { isActive: true } } } } }
      });

      if (!invitation) {
        throw new Error("Invalid invitation token");
      }

      if (invitation.status !== "PENDING") {
        throw new Error("Invitation is no longer valid");
      }

      if (invitation.expiresAt < new Date()) {
        throw new Error("Invitation has expired");
      }

      // Check if GM still has space
      if (invitation.gm.players.length >= this.MAX_PLAYERS_PER_GM) {
        throw new Error("GM group is now full");
      }

      // Get user info
      const user = await tx.user.findUnique({
        where: { id: request.userId }
      });

      if (!user) {
        throw new Error("User not found");
      }

      if (user.email !== invitation.playerEmail) {
        throw new Error("User email does not match invitation");
      }

      // Check if user is already a player of another GM
      const existingPlayerProfile = await tx.playerProfile.findUnique({
        where: { userId: request.userId }
      });

      if (existingPlayerProfile && existingPlayerProfile.isActive) {
        throw new Error("User is already a player of another GM");
      }

      // Create or reactivate player profile
      await tx.playerProfile.upsert({
        where: { userId: request.userId },
        create: {
          userId: request.userId,
          gmId: invitation.gmId,
          isActive: true
        },
        update: {
          gmId: invitation.gmId,
          isActive: true,
          joinedAt: new Date()
        }
      });

      // Update user role to PLAYER
      await tx.user.update({
        where: { id: request.userId },
        data: { role: "TRAILBLAZER" }
      });

      // Mark invitation as accepted
      await tx.playerInvitation.update({
        where: { inviteToken: request.inviteToken },
        data: { status: "ACCEPTED" }
      });
    });
  }

  /**
   * Get GM's players and pending invitations
   */
  static async getGMPlayers(gmId: string) {
    const gmProfile = await prisma.gMProfile.findUnique({
      where: { id: gmId },
      include: {
        players: {
          where: { isActive: true },
          include: { user: { select: { id: true, name: true, email: true } } },
          orderBy: { joinedAt: 'asc' }
        },
        playerInvitations: {
          where: { status: "PENDING", expiresAt: { gt: new Date() } },
          orderBy: { createdAt: 'desc' }
        }
      }
    });

    if (!gmProfile) {
      throw new Error("GM profile not found");
    }

    return {
      players: gmProfile.players,
      pendingInvitations: gmProfile.playerInvitations,
      availableSlots: this.MAX_PLAYERS_PER_GM - gmProfile.players.length
    };
  }

  /**
   * Remove a player from GM's group
   */
  static async removePlayer(gmId: string, playerId: string): Promise<void> {
    return prisma.$transaction(async (tx) => {
      const playerProfile = await tx.playerProfile.findFirst({
        where: {
          gmId,
          userId: playerId,
          isActive: true
        }
      });

      if (!playerProfile) {
        throw new Error("Player not found in this GM's group");
      }

      // Deactivate player profile
      await tx.playerProfile.update({
        where: { id: playerProfile.id },
        data: { isActive: false }
      });

      // Update user role back to WATCHER (they can become GM again if they want)
      await tx.user.update({
        where: { id: playerId },
        data: { role: "WATCHER" }
      });
    });
  }

  /**
   * Cancel a pending invitation
   */
  static async cancelInvitation(gmId: string, invitationId: string): Promise<void> {
    return prisma.$transaction(async (tx) => {
      // Find the invitation and verify it belongs to the GM
      const invitation = await tx.playerInvitation.findUnique({
        where: { id: invitationId }
      });

      if (!invitation) {
        throw new Error("Invitation not found");
      }

      if (invitation.gmId !== gmId) {
        throw new Error("You can only cancel your own invitations");
      }

      if (invitation.status !== "PENDING") {
        throw new Error("Can only cancel pending invitations");
      }

      // Update invitation status to CANCELLED
      await tx.playerInvitation.update({
        where: { id: invitationId },
        data: { 
          status: "CANCELLED",
          updatedAt: new Date()
        }
      });
    });
  }

  /**
   * Get invitation details by token
   */
  static async getInvitationByToken(inviteToken: string) {
    const invitation = await prisma.playerInvitation.findUnique({
      where: { inviteToken },
      include: {
        gm: {
          include: {
            user: { select: { name: true, email: true } }
          }
        }
      }
    });

    if (!invitation) {
      return null;
    }

    return {
      ...invitation,
      isValid: invitation.status === "PENDING" && invitation.expiresAt > new Date()
    };
  }
}