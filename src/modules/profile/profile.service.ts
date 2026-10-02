import type { PrismaClient, Profile, User } from "@/generated/prisma/client";
import { auditInTx, type Tx } from "@/modules/shared/audit";
import { requireFound } from "@/modules/shared/ownership-checks";
import { provenanceInclude, toProvenance } from "@/modules/shared/provenance";
import type { ServiceContext } from "@/modules/shared/service-context";

import type { UpdateProfileInput } from "./profile.schemas";

type Db = PrismaClient | Tx;

const USER_FIELDS = ["name", "timezone", "locale"] as const;

async function load(db: Db, userId: string) {
  return requireFound(
    await db.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        timezone: true,
        locale: true,
        profile: { include: provenanceInclude },
      },
    }),
  );
}

type Loaded = Awaited<ReturnType<typeof load>>;

function snapshot(user: Pick<User, "name" | "timezone" | "locale">, profile: Profile | null) {
  return {
    name: user.name,
    timezone: user.timezone,
    locale: user.locale,
    headline: profile?.headline ?? null,
    summary: profile?.summary ?? null,
    location: profile?.location ?? null,
    website: profile?.website ?? null,
    professionalObjective: profile?.professionalObjective ?? null,
  };
}

export function toProfileDto(loaded: Loaded) {
  return {
    ...snapshot(loaded, loaded.profile),
    email: loaded.email,
    exists: loaded.profile !== null,
    updatedAt: loaded.profile?.updatedAt.toISOString() ?? null,
    provenance: loaded.profile ? toProvenance(loaded.profile) : null,
  };
}

export type ProfileDto = ReturnType<typeof toProfileDto>;

/** The caller's own profile only — there is no way to address another user's profile. */
export function createProfileService(db: PrismaClient) {
  return {
    async get(ctx: ServiceContext): Promise<ProfileDto> {
      return toProfileDto(await load(db, ctx.userId));
    },

    /** Upsert: the profile row is created on first save (no empty profile is pre-seeded). */
    update(ctx: ServiceContext, input: UpdateProfileInput): Promise<ProfileDto> {
      return db.$transaction(async (tx) => {
        const before = await load(tx, ctx.userId);
        const userData: Partial<Record<(typeof USER_FIELDS)[number], string>> = {};
        const profileData: Omit<UpdateProfileInput, (typeof USER_FIELDS)[number]> = {};
        for (const [key, value] of Object.entries(input)) {
          if ((USER_FIELDS as readonly string[]).includes(key)) {
            (userData as Record<string, unknown>)[key] = value;
          } else {
            (profileData as Record<string, unknown>)[key] = value;
          }
        }

        if (Object.keys(userData).length) {
          await tx.user.update({ where: { id: ctx.userId }, data: userData });
        }
        if (Object.keys(profileData).length || !before.profile) {
          await tx.profile.upsert({
            where: { userId: ctx.userId },
            create: { ...profileData, userId: ctx.userId, origin: "manual" },
            update: profileData,
          });
        }

        const after = await load(tx, ctx.userId);
        await auditInTx(tx, ctx, {
          entity: "profile",
          verb: before.profile ? "updated" : "created",
          entityId: after.profile?.id ?? null,
          before: before.profile ? snapshot(before, before.profile) : undefined,
          after: snapshot(after, after.profile),
        });
        return toProfileDto(after);
      });
    },
  };
}
