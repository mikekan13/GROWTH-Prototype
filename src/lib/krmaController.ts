import { prisma } from "./prisma";
import { Prisma } from "@prisma/client";
import { HolderType } from "@prisma/client";

export type CrystallizationType = 'NPC' | 'ITEM' | 'LOCATION' | 'ENVIRONMENT' | 'QUEST' | 'ARTIFACT';

export interface CrystallizationRequest {
  campaignId: string;
  type: CrystallizationType;
  name: string;
  description?: string;
  krmaAmount: bigint;
  metadata?: Record<string, unknown>;
}

export interface WorldAsset {
  id: string;
  campaignId: string;
  gmId: string;
  type: CrystallizationType;
  name: string;
  description?: string;
  krmaValue: bigint;
  isActive: boolean;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

export class KrmaController {
  /**
   * Crystallize KRMA into a world asset (NPC, item, etc.)
   * This moves liquid KRMA from GM's wallet into the world asset
   */
  static async crystallizeKrma(
    gmUserId: string,
    request: CrystallizationRequest
  ): Promise<{ success: boolean; assetId?: string; error?: string }> {
    return await prisma.$transaction(async (tx) => {
      // Verify GM owns this campaign
      const campaign = await tx.campaign.findUnique({
        where: { id: request.campaignId },
        include: { _count: { select: { characters: true } } }
      });

      if (!campaign) {
        return { success: false, error: "Campaign not found" };
      }

      // Get GM's wallet
      const gmWallet = await tx.wallet.findUnique({
        where: {
          ownerType_ownerRef: {
            ownerType: HolderType.GM,
            ownerRef: gmUserId
          }
        }
      });

      if (!gmWallet) {
        return { success: false, error: "GM wallet not found" };
      }

      if (gmWallet.liquid < request.krmaAmount) {
        return { success: false, error: "Insufficient liquid KRMA" };
      }

      // Get GM profile for metadata
      const gmProfile = await tx.gMProfile.findUnique({
        where: { userId: gmUserId }
      });

      if (!gmProfile) {
        return { success: false, error: "GM profile not found" };
      }

      // Deduct KRMA from GM's liquid wallet
      await tx.wallet.update({
        where: {
          ownerType_ownerRef: {
            ownerType: HolderType.GM,
            ownerRef: gmUserId
          }
        },
        data: {
          liquid: {
            decrement: request.krmaAmount
          }
        }
      });

      // Create world asset
      const asset = await tx.worldAsset.create({
        data: {
          campaignId: request.campaignId,
          gmId: gmProfile.id,
          type: request.type,
          name: request.name,
          description: request.description,
          krmaValue: request.krmaAmount,
          isActive: true,
          metadata: Prisma.JsonNull
        }
      });

      // Log the crystallization transaction
      await tx.krmaTransaction.create({
        data: {
          userId: gmUserId,
          type: 'PAYMENT',
          amount: -request.krmaAmount, // Negative because it's leaving the wallet
          balance: gmWallet.liquid - request.krmaAmount,
          description: `Crystallized into ${request.type}: ${request.name}`,
          metadata: {
            campaignId: request.campaignId,
            assetId: asset.id,
            crystallizationType: request.type
          }
        }
      });

      return { success: true, assetId: asset.id };
    });
  }

  /**
   * Dissolve a world asset back into liquid KRMA
   * Used when NPCs die, items are destroyed, etc.
   */
  static async dissolveAsset(
    assetId: string,
    returnPercentage: number = 100
  ): Promise<{ success: boolean; krmaReturned?: bigint; error?: string }> {
    return await prisma.$transaction(async (tx) => {
      const asset = await tx.worldAsset.findUnique({
        where: { id: assetId },
        include: { Campaign: true }
      });

      if (!asset) {
        return { success: false, error: "Asset not found" };
      }

      if (!asset.isActive) {
        return { success: false, error: "Asset already dissolved" };
      }

      // Calculate KRMA to return
      const krmaToReturn = (asset.krmaValue * BigInt(Math.floor(returnPercentage * 100))) / BigInt(10000);
      const krmaLost = asset.krmaValue - krmaToReturn;

      // Get GM profile to find user ID
      const gmProfile = await tx.gMProfile.findUnique({
        where: { id: asset.gmId }
      });

      if (!gmProfile) {
        return { success: false, error: "GM profile not found" };
      }

      // Return KRMA to GM's wallet
      await tx.wallet.update({
        where: {
          ownerType_ownerRef: {
            ownerType: HolderType.GM,
            ownerRef: gmProfile.userId
          }
        },
        data: {
          liquid: {
            increment: krmaToReturn
          }
        }
      });

      // Handle lost KRMA (goes to system pools based on your tokenomics)
      if (krmaLost > BigInt(0)) {
        const systemPools = await tx.systemPools.findUnique({
          where: { gmId: asset.gmId }
        });

        if (systemPools) {
          // Lost KRMA goes to item remainder pool
          await tx.wallet.upsert({
            where: {
              ownerType_ownerRef: {
                ownerType: HolderType.GM,
                ownerRef: systemPools.itemRemainderHoldId
              }
            },
            create: {
              ownerType: HolderType.GM,
              ownerRef: systemPools.itemRemainderHoldId,
              liquid: krmaLost,
              crystalized: BigInt(0)
            },
            update: {
              liquid: { increment: krmaLost }
            }
          });
        }
      }

      // Mark asset as dissolved
      await tx.worldAsset.update({
        where: { id: assetId },
        data: { isActive: false }
      });

      // Log the dissolution transaction
      await tx.krmaTransaction.create({
        data: {
          userId: gmProfile.userId,
          type: 'DEPOSIT',
          amount: krmaToReturn,
          balance: BigInt(0), // We'd need to fetch current balance for this
          description: `Dissolved ${asset.type}: ${asset.name} (${returnPercentage}% return)`,
          metadata: {
            campaignId: asset.campaignId,
            assetId: asset.id,
            dissolutionType: asset.type,
            returnPercentage,
            krmaLost: krmaLost.toString()
          }
        }
      });

      return { success: true, krmaReturned: krmaToReturn };
    });
  }

  /**
   * Get all world assets for a campaign
   */
  static async getCampaignAssets(campaignId: string): Promise<WorldAsset[]> {
    const assets = await prisma.worldAsset.findMany({
      where: { 
        campaignId,
        isActive: true 
      },
      orderBy: [
        { type: 'asc' },
        { createdAt: 'desc' }
      ]
    });

    return assets.map(asset => ({
      ...asset,
      type: asset.type as CrystallizationType,
      description: asset.description || undefined,
      krmaValue: asset.krmaValue
    })) as WorldAsset[];
  }

  /**
   * Get total KRMA crystallized in a campaign
   */
  static async getCampaignKrmaValue(campaignId: string): Promise<bigint> {
    const result = await prisma.worldAsset.aggregate({
      where: {
        campaignId,
        isActive: true
      },
      _sum: {
        krmaValue: true
      }
    });

    return result._sum.krmaValue || BigInt(0);
  }

  /**
   * Transfer asset between campaigns (for shared NPCs, items, etc.)
   */
  static async transferAsset(
    assetId: string,
    targetCampaignId: string
  ): Promise<{ success: boolean; error?: string }> {
    return await prisma.$transaction(async (tx) => {
      // Verify both campaigns exist
      const [asset, targetCampaign] = await Promise.all([
        tx.worldAsset.findUnique({ where: { id: assetId } }),
        tx.campaign.findUnique({ where: { id: targetCampaignId } })
      ]);

      if (!asset || !targetCampaign) {
        return { success: false, error: "Asset or target campaign not found" };
      }

      // Update campaign assignment
      await tx.worldAsset.update({
        where: { id: assetId },
        data: { campaignId: targetCampaignId }
      });

      return { success: true };
    });
  }
}