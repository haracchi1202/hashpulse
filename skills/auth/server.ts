import { auth, currentUser } from "@clerk/nextjs/server";
import { prisma } from "@/skills/prisma";

export async function requireUser() {
  const { userId } = await auth();
  if (!userId) {
    throw new Response("Unauthorized", { status: 401 });
  }
  // DB User を upsert で同期 (webhook を待たずに)
  const clerkUser = await currentUser();
  const email = clerkUser?.emailAddresses[0]?.emailAddress ?? `${userId}@unknown`;
  const name = [clerkUser?.firstName, clerkUser?.lastName].filter(Boolean).join(" ") || null;

  const user = await prisma.user.upsert({
    where: { clerkId: userId },
    create: { clerkId: userId, email, name },
    update: { email, name },
  });
  return user;
}

export async function getOptionalUser() {
  const { userId } = await auth();
  if (!userId) return null;
  return prisma.user.findUnique({ where: { clerkId: userId } });
}
