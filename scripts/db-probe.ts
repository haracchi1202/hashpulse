import { prisma } from "@/skills/prisma";

async function main() {
  const users = await prisma.user.findMany({ take: 5 });
  console.log(`Users: ${users.length}`);
  for (const u of users) console.log(`  - ${u.id} ${u.email} (plan=${u.plan})`);

  const searches = await prisma.search.findMany({
    orderBy: { createdAt: "desc" },
    take: 20,
    include: { _count: { select: { posts: true, snapshots: true } } },
  });
  console.log(`\nSearches: ${searches.length}`);
  for (const s of searches) {
    console.log(
      `  - ${s.id} "${s.name ?? s.query}" [${s.platforms.join(",")}] saved=${s.saved} cadence=${s.cadence} posts=${s._count.posts} snaps=${s._count.snapshots} lastRun=${s.lastRunAt?.toISOString() ?? "-"}`
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("PROBE ERROR:", e);
    process.exit(1);
  });
