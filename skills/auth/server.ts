import { auth, currentUser } from "@clerk/nextjs/server";
import { prisma } from "@/skills/prisma";

/**
 * Clerk ユーザーを DB User に同期する。clerkId も email も @unique のため、
 * 素朴な「clerkId で upsert」だと、同じ email が別 clerkId で既存の場合に
 * unique 制約(P2002)で落ちる（dev と本番の Clerk が DB を共有していると発生）。
 * そこで clerkId または email のどちらか一致で既存行を探し、見つかれば
 * clerkId を張り替えて更新、無ければ作成する。
 */
export async function syncUser(clerkId: string, email: string, name: string | null) {
  const existing = await prisma.user.findFirst({
    where: { OR: [{ clerkId }, { email }] },
  });
  if (existing) {
    return prisma.user.update({
      where: { id: existing.id },
      data: { clerkId, email, name },
    });
  }
  return prisma.user.create({ data: { clerkId, email, name } });
}

export async function requireUser() {
  const { userId } = await auth();
  if (!userId) {
    throw new Response("Unauthorized", { status: 401 });
  }
  // DB User を同期 (webhook を待たずに)
  const clerkUser = await currentUser();
  const email = clerkUser?.emailAddresses[0]?.emailAddress ?? `${userId}@unknown`;
  const name = [clerkUser?.firstName, clerkUser?.lastName].filter(Boolean).join(" ") || null;

  return syncUser(userId, email, name);
}

export async function getOptionalUser() {
  const { userId } = await auth();
  if (!userId) return null;
  return prisma.user.findUnique({ where: { clerkId: userId } });
}
