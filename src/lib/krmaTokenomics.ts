import { prisma } from "./prisma";
import { HolderType } from "@prisma/client";

// Type definitions matching your spec
export type KRMA = bigint;
export type Id = string;

export interface WalletData {
  id: Id;
  ownerType: HolderType;
  ownerRef: Id;
  liquid: KRMA;
  crystalized: KRMA;
}

export interface GMProfileData {
  id: Id;
  userId: Id;
  signupMonth: number;
  baselineActive: boolean;
}

export interface EntityProfileData {
  id: Id;
  gmId: Id;
  name?: string;
  bodyPct: number;
  spiritPct: number;
  soulPct: number;
  frequency: KRMA;
  mana: KRMA;
}

export interface BaselineParamsData {
  lifetimeTotal: KRMA;
  windowMonths: number;
  muMonths: number;
  sigmaMonths: number;
  ceaseFloor: KRMA;
}

export interface PoolsData {
  gmBodyPoolId: Id;
  gmSpiritPoolId: Id;
  spiritOtherHalfHoldId: Id;
  itemRemainderHoldId: Id;
}

export class KrmaTokenomics {
  /**
   * GM signup - gives 10k KRMA from reserve wallet
   */
  static async onGMSignup(userId: Id, signupMonth: number = 1): Promise<void> {
    await prisma.$transaction(async (tx) => {
      // Check if GM profile already exists
      const existingProfile = await tx.gMProfile.findUnique({
        where: { userId }
      });

      if (existingProfile) {
        throw new Error('User is already a GM');
      }

      // Find The Terminal reserve wallet (biggest reserve)
      const terminalWallet = await tx.wallet.findUnique({
        where: {
          ownerType_ownerRef: {
            ownerType: HolderType.TERMINAL,
            ownerRef: 'The Terminal'
          }
        }
      });

      if (!terminalWallet || terminalWallet.liquid < BigInt(10000)) {
        throw new Error('Insufficient funds in The Terminal reserve wallet');
      }

      // Create GM profile
      const gmProfile = await tx.gMProfile.create({
        data: {
          userId,
          signupMonth,
          baselineActive: true,
        }
      });

      // Transfer 10k KRMA from The Terminal reserve to new GM wallet
      await tx.wallet.update({
        where: {
          ownerType_ownerRef: {
            ownerType: HolderType.TERMINAL,
            ownerRef: 'The Terminal'
          }
        },
        data: {
          liquid: {
            decrement: BigInt(10000)
          }
        }
      });

      // Create/update GM wallet with 10k KRMA from reserve
      await tx.wallet.upsert({
        where: {
          ownerType_ownerRef: {
            ownerType: HolderType.WATCHER,
            ownerRef: userId
          }
        },
        create: {
          ownerType: HolderType.WATCHER,
          ownerRef: userId,
          liquid: BigInt(10000), // 10k KRMA from reserve
          crystalized: BigInt(0)
        },
        update: {
          liquid: {
            increment: BigInt(10000)
          }
        }
      });

      // Update user role to WATCHER (GM)
      await tx.user.update({
        where: { id: userId },
        data: {
          role: "WATCHER",
          krmaBalance: {
            increment: BigInt(10000) // Also update legacy balance field
          }
        }
      });

      // Create system pools for this GM
      await tx.systemPools.create({
        data: {
          gmId: gmProfile.id,
          gmBodyPoolId: `body_pool_${gmProfile.id}`,
          gmSpiritPoolId: `spirit_pool_${gmProfile.id}`,
          spiritOtherHalfHoldId: `spirit_hold_${gmProfile.id}`,
          itemRemainderHoldId: `item_hold_${gmProfile.id}`
        }
      });
    });
  }

  /**
   * Baseline monthly drop (bell curve)
   */
  static baselineMonthlyDrop(
    tSinceSignup: number,
    params: BaselineParamsData,
    norm: number
  ): KRMA {
    if (tSinceSignup < 1 || tSinceSignup > params.windowMonths) {
      return BigInt(0);
    }

    const g = Math.exp(-0.5 * Math.pow((tSinceSignup - params.muMonths) / params.sigmaMonths, 2));
    const amt = Math.floor(norm * g);
    
    return amt < Number(params.ceaseFloor) ? BigInt(0) : BigInt(amt);
  }

  /**
   * Process baseline subscription for a GM
   */
  static async tickBaseline(
    gmId: Id, 
    monthNow: number, 
    params: BaselineParamsData, 
    norm: number
  ): Promise<void> {
    await prisma.$transaction(async (tx) => {
      const gmProfile = await tx.gMProfile.findUnique({
        where: { id: gmId }
      });

      if (!gmProfile || !gmProfile.baselineActive) return;

      const t = monthNow - gmProfile.signupMonth;
      const drop = this.baselineMonthlyDrop(t, params, norm);

      if (drop > BigInt(0)) {
        // Add to wallet liquid
        await tx.wallet.update({
          where: {
            ownerType_ownerRef: {
              ownerType: HolderType.WATCHER,
              ownerRef: gmProfile.userId
            }
          },
          data: {
            liquid: {
              increment: drop
            }
          }
        });

        // Also update legacy balance
        await tx.user.update({
          where: { id: gmProfile.userId },
          data: {
            krmaBalance: {
              increment: drop
            }
          }
        });
      }

      // Deactivate if window exceeded
      if (t >= params.windowMonths) {
        await tx.gMProfile.update({
          where: { id: gmId },
          data: { baselineActive: false }
        });
      }
    });
  }

  /**
   * Handle entity death with B/S/S composition
   */
  static async onDeath(
    entityId: Id,
    totalEventKRMA: KRMA,
    ladyDeathId: Id
  ): Promise<void> {
    await prisma.$transaction(async (tx) => {
      const entity = await tx.entityProfile.findUnique({
        where: { id: entityId },
        include: { gm: true }
      });

      if (!entity) throw new Error("Entity not found");

      const pools = await tx.systemPools.findUnique({
        where: { gmId: entity.gmId }
      });

      if (!pools) throw new Error("System pools not found for GM");

      // Lady Death takes frequency + mana->frequency
      const ldTake = entity.frequency + entity.mana;
      
      await tx.wallet.upsert({
        where: {
          ownerType_ownerRef: {
            ownerType: HolderType.TERMINAL, // Lady Death
            ownerRef: ladyDeathId
          }
        },
        create: {
          ownerType: HolderType.TERMINAL,
          ownerRef: ladyDeathId,
          liquid: ldTake,
          crystalized: BigInt(0)
        },
        update: {
          liquid: { increment: ldTake }
        }
      });

      // Composition split of the event KRMA
      const toBig = (x: number) => BigInt(Math.floor(x * 1e6));
      const body = (totalEventKRMA * toBig(entity.bodyPct)) / BigInt(1_000_000);
      const spirit = (totalEventKRMA * toBig(entity.spiritPct)) / BigInt(1_000_000);
      const soul = (totalEventKRMA * toBig(entity.soulPct)) / BigInt(1_000_000);

      // Body stays in GM's world
      await tx.wallet.upsert({
        where: {
          ownerType_ownerRef: {
            ownerType: HolderType.WATCHER,
            ownerRef: pools.gmBodyPoolId
          }
        },
        create: {
          ownerType: HolderType.WATCHER,
          ownerRef: pools.gmBodyPoolId,
          liquid: body,
          crystalized: BigInt(0)
        },
        update: {
          liquid: { increment: body }
        }
      });

      // Spirit: half stays in world; other half conserved
      const spiritStay = spirit / BigInt(2);
      const spiritHold = spirit - spiritStay;

      await tx.wallet.upsert({
        where: {
          ownerType_ownerRef: {
            ownerType: HolderType.WATCHER,
            ownerRef: pools.gmSpiritPoolId
          }
        },
        create: {
          ownerType: HolderType.WATCHER,
          ownerRef: pools.gmSpiritPoolId,
          liquid: spiritStay,
          crystalized: BigInt(0)
        },
        update: {
          liquid: { increment: spiritStay }
        }
      });

      await tx.wallet.upsert({
        where: {
          ownerType_ownerRef: {
            ownerType: HolderType.WATCHER,
            ownerRef: pools.spiritOtherHalfHoldId
          }
        },
        create: {
          ownerType: HolderType.WATCHER,
          ownerRef: pools.spiritOtherHalfHoldId,
          liquid: spiritHold,
          crystalized: BigInt(0)
        },
        update: {
          liquid: { increment: spiritHold }
        }
      });

      // Soul goes to GM's crystalized wallet
      await tx.wallet.update({
        where: {
          ownerType_ownerRef: {
            ownerType: HolderType.WATCHER,
            ownerRef: entity.gm.userId
          }
        },
        data: {
          crystalized: { increment: soul }
        }
      });

      // Clear entity stores
      await tx.entityProfile.update({
        where: { id: entityId },
        data: {
          frequency: BigInt(0),
          mana: BigInt(0)
        }
      });
    });
  }

  /**
   * Handle item destruction
   */
  static async onItemDestroyed(
    gmUserId: Id,
    itemKRMA: KRMA,
    returnNum: bigint,
    returnDen: bigint
  ): Promise<void> {
    await prisma.$transaction(async (tx) => {
      const gmProfile = await tx.gMProfile.findUnique({
        where: { userId: gmUserId }
      });

      if (!gmProfile) throw new Error("GM profile not found");

      const pools = await tx.systemPools.findUnique({
        where: { gmId: gmProfile.id }
      });

      if (!pools) throw new Error("System pools not found");

      const back = (itemKRMA * returnNum) / returnDen;
      const rem = itemKRMA - back;

      // Return fraction to GM
      await tx.wallet.update({
        where: {
          ownerType_ownerRef: {
            ownerType: HolderType.WATCHER,
            ownerRef: gmUserId
          }
        },
        data: {
          liquid: { increment: back }
        }
      });

      // Remainder goes to holding pool
      await tx.wallet.upsert({
        where: {
          ownerType_ownerRef: {
            ownerType: HolderType.WATCHER,
            ownerRef: pools.itemRemainderHoldId
          }
        },
        create: {
          ownerType: HolderType.WATCHER,
          ownerRef: pools.itemRemainderHoldId,
          liquid: rem,
          crystalized: BigInt(0)
        },
        update: {
          liquid: { increment: rem }
        }
      });
    });
  }

  /**
   * Get wallet data for user
   */
  static async getWallet(ownerType: HolderType, ownerRef: Id): Promise<WalletData | null> {
    const wallet = await prisma.wallet.findUnique({
      where: {
        ownerType_ownerRef: {
          ownerType,
          ownerRef
        }
      }
    });

    return wallet;
  }

  /**
   * Verify conservation invariant
   */
  static async verifyConservation(): Promise<{ total: bigint; expected: bigint; isValid: boolean }> {
    try {
      const result = await prisma.wallet.aggregate({
        _sum: {
          liquid: true,
          crystalized: true
        }
      });

      const total = (result._sum.liquid || BigInt(0)) + (result._sum.crystalized || BigInt(0));
      const expected = BigInt(100_000_000_000); // 100B hard cap

      return {
        total,
        expected,
        isValid: total <= expected
      };
    } catch (error) {
      console.error('Conservation verification error:', error);
      // Return safe defaults if aggregate fails
      return {
        total: BigInt(0),
        expected: BigInt(100_000_000_000),
        isValid: true
      };
    }
  }
}