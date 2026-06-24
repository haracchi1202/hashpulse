import { NextRequest, NextResponse } from "next/server";
import { Webhook } from "svix";
import { prisma } from "@/skills/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ClerkUserEvent {
  type: "user.created" | "user.updated" | "user.deleted";
  data: {
    id: string;
    email_addresses?: { email_address: string; id: string }[];
    primary_email_address_id?: string;
    first_name?: string;
    last_name?: string;
  };
}

export async function POST(req: NextRequest) {
  const secret = process.env.CLERK_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json(
      { ok: false, error: { code: "MISCONFIG", message: "CLERK_WEBHOOK_SECRET missing" } },
      { status: 500 }
    );
  }

  const svixId = req.headers.get("svix-id");
  const svixTs = req.headers.get("svix-timestamp");
  const svixSig = req.headers.get("svix-signature");
  if (!svixId || !svixTs || !svixSig) {
    return NextResponse.json(
      { ok: false, error: { code: "BAD_REQUEST", message: "Missing svix headers" } },
      { status: 400 }
    );
  }

  const payload = await req.text();
  let event: ClerkUserEvent;
  try {
    event = new Webhook(secret).verify(payload, {
      "svix-id": svixId,
      "svix-timestamp": svixTs,
      "svix-signature": svixSig,
    }) as ClerkUserEvent;
  } catch {
    return NextResponse.json(
      { ok: false, error: { code: "INVALID_SIG", message: "Signature verification failed" } },
      { status: 400 }
    );
  }

  const { type, data } = event;
  if (type === "user.created" || type === "user.updated") {
    const primary = data.email_addresses?.find((e) => e.id === data.primary_email_address_id);
    const email = primary?.email_address ?? data.email_addresses?.[0]?.email_address;
    if (!email) {
      return NextResponse.json({ ok: true, data: { skipped: "no email" } });
    }
    const name = [data.first_name, data.last_name].filter(Boolean).join(" ") || null;
    await prisma.user.upsert({
      where: { clerkId: data.id },
      create: { clerkId: data.id, email, name },
      update: { email, name },
    });
  } else if (type === "user.deleted") {
    await prisma.user.deleteMany({ where: { clerkId: data.id } });
  }

  return NextResponse.json({ ok: true, data: { type } });
}
