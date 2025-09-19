import { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { prisma } from "./prisma";
import { KrmaTokenomics } from "./krmaTokenomics";

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: "openid email profile https://www.googleapis.com/auth/drive.file",
          access_type: "offline",
          prompt: "consent",
        },
      },
    }),
  ],
  callbacks: {
    async session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
        session.user.role = (user as { role?: string }).role; // Include user role in session
      }
      return session;
    },
  },
  events: {
    async createUser({ user }) {
      try {
        // Check if this user should be a GM or Player
        const shouldBeGM = user.email === "mikekan13@gmail.com";

        if (shouldBeGM) {
          console.log("New GM user created:", user.email);
          await KrmaTokenomics.onGMSignup(user.id, 1);
          console.log("Successfully promoted user to GM with 10k KRMA");
        } else {
          console.log("New player user created:", user.email);
          // Players remain with default role WATCHER until properly invited
        }
      } catch (error) {
        console.error("Failed to setup new user:", error);
      }
    },
  },
  session: {
    strategy: "database",
  },
  pages: {
    signIn: "/auth/signin",
  },
  debug: process.env.NODE_ENV === "development",
};