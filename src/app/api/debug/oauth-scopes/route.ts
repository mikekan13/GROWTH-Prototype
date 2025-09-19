import { NextResponse } from "next/server";
import { withAuth } from "@/lib/apiHelpers";
import { prisma } from "@/lib/prisma";

export const GET = withAuth(async (session) => {
  try {
    // Get the user's OAuth account info
    const account = await prisma.account.findFirst({
      where: {
        userId: (session as { user: { id: string } }).user.id,
        provider: "google",
      },
    });

    if (!account) {
      return NextResponse.json({ error: "No Google account found" }, { status: 404 });
    }

    const accountScopes = account.scope ? account.scope.split(' ') : [];
    const hasGmailScope = accountScopes.includes("https://www.googleapis.com/auth/gmail.send");

    return NextResponse.json({
      account: {
        id: account.id,
        provider: account.provider,
        scope: account.scope,
        expires_at: account.expires_at,
        created_at: (account as { createdAt?: Date }).createdAt,
        updated_at: (account as { updatedAt?: Date }).updatedAt,
      },
      analysis: {
        scopesArray: accountScopes,
        hasGmailScope: hasGmailScope,
        requiredScope: "https://www.googleapis.com/auth/gmail.send",
        scopeCount: accountScopes.length,
      }
    });
  } catch (error: unknown) {
    console.error("Failed to get OAuth debug info:", error);
    return NextResponse.json(
      { error: (error instanceof Error ? error.message : null) || "Failed to get OAuth info" },
      { status: 500 }
    );
  }
});