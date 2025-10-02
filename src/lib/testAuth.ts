/**
 * Test-only authentication bypass for Playwright testing
 * This allows tests to run without Google OAuth dependencies
 */
import { prisma } from "./prisma";
import { KrmaTokenomics } from "./krmaTokenomics";

export interface TestUser {
  id: string;
  email: string;
  name: string;
  role: "ADMIN" | "WATCHER" | "TRAILBLAZER" | "GODHEAD";
}

export const TEST_USERS = {
  ADMIN: {
    id: "test-admin-001",
    email: "test-admin@playwright.test",
    name: "Test Admin",
    role: "ADMIN" as const
  },
  WATCHER: {
    id: "test-watcher-001",
    email: "test-watcher@playwright.test",
    name: "Test Watcher",
    role: "WATCHER" as const
  },
  TRAILBLAZER: {
    id: "test-trailblazer-001",
    email: "test-trailblazer@playwright.test",
    name: "Test Trailblazer",
    role: "TRAILBLAZER" as const
  }
};

/**
 * Creates a test user in the database for Playwright testing
 * Only works in test environment (NODE_ENV=test)
 */
export async function createTestUser(userType: keyof typeof TEST_USERS): Promise<TestUser> {
  if (process.env.NODE_ENV !== "test" && !process.env.PLAYWRIGHT_TEST) {
    throw new Error("Test users can only be created in test environment");
  }

  const testUser = TEST_USERS[userType];

  try {
    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: testUser.email }
    });

    if (existingUser) {
      console.log(`Test user ${testUser.email} already exists, returning existing user`);
      return testUser;
    }

    // Create the user
    const user = await prisma.user.create({
      data: {
        id: testUser.id,
        email: testUser.email,
        username: testUser.email.split('@')[0], // Use email prefix as username
        password: 'test-password-bypass', // Playwright tests bypass login
        name: testUser.name,
        role: testUser.role
      }
    });

    // Create necessary profiles based on role
    if (testUser.role === "ADMIN") {
      // Admin gets 100k KRMA via GM signup
      await KrmaTokenomics.onGMSignup(user.id, 10);
    } else if (testUser.role === "WATCHER") {
      // WATCHER gets 10k KRMA via GM signup
      await KrmaTokenomics.onGMSignup(user.id, 1);
    } else if (testUser.role === "TRAILBLAZER") {
      // TRAILBLAZER just gets basic user setup (no KRMA for now since onPlayerSignup doesn't exist)
      // Create a GM profile for testing purposes (all users become GMs in current system)
      await KrmaTokenomics.onGMSignup(user.id, 1);
    }

    console.log(`Created test user: ${testUser.email} with role: ${testUser.role}`);
    return testUser;

  } catch (error) {
    console.error(`Failed to create test user ${testUser.email}:`, error);
    throw error;
  }
}

/**
 * Cleans up all test users from the database
 * Only works in test environment
 */
export async function cleanupTestUsers(): Promise<void> {
  if (process.env.NODE_ENV !== "test" && !process.env.PLAYWRIGHT_TEST) {
    throw new Error("Test cleanup can only be run in test environment");
  }

  try {
    const testEmails = Object.values(TEST_USERS).map(user => user.email);

    // Delete test users (cascading deletes will handle related records)
    await prisma.user.deleteMany({
      where: {
        email: {
          in: testEmails
        }
      }
    });

    console.log("Cleaned up test users");
  } catch (error) {
    console.error("Failed to cleanup test users:", error);
    throw error;
  }
}

/**
 * Generates a test session for bypassing authentication
 * Only works in test environment
 */
export function createTestSession(userType: keyof typeof TEST_USERS) {
  if (process.env.NODE_ENV !== "test" && !process.env.PLAYWRIGHT_TEST) {
    throw new Error("Test sessions can only be created in test environment");
  }

  const user = TEST_USERS[userType];

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      image: null
    },
    expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24 hours
  };
}