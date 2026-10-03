import { z } from "zod";

import type { PrismaClient } from "@/generated/prisma/client";
import { AppError } from "@/lib/errors/app-error";
import type { ServiceContext } from "@/modules/shared/service-context";

/**
 * Career graph (Phase 4, ADR 0030). Nodes are real records; edges are real rows of the eight
 * owner-scoped join tables — nothing is inferred. The graph is bounded (≤ MAX_NODES nodes) and
 * built with a fixed number of queries regardless of data size:
 *
 *   project–skill (project_skills)          project–technology (technology_usages)
 *   project–evidence (project_evidence)     skill–evidence (skill_evidence)
 *   technology–skill (technology_skills)    certification–skill (certification_skills)
 *   certification–evidence                  experience–evidence (experience_evidence)
 *
 * Overview mode seeds the graph with the most-connected active skills; focus mode seeds it with
 * one record and its direct neighbours.
 */
export const NODE_TYPES = [
  "skill",
  "project",
  "technology",
  "certification",
  "experience",
  "evidence",
] as const;
export type NodeType = (typeof NODE_TYPES)[number];
export const MAX_NODES = 150;
export const OVERVIEW_SKILLS = 20;

const DEFAULT_TYPES: NodeType[] = ["skill", "project", "technology", "certification"];

export const careerGraphQuerySchema = z.object({
  focusType: z.enum(NODE_TYPES).optional(),
  focusId: z.uuid("Invalid identifier").optional(),
  types: z
    .string()
    .max(100)
    .optional()
    .transform((v, ctx) => {
      if (!v) return DEFAULT_TYPES;
      const parts = [
        ...new Set(
          v
            .split(",")
            .map((p) => p.trim())
            .filter(Boolean),
        ),
      ];
      for (const p of parts) {
        if (!(NODE_TYPES as readonly string[]).includes(p)) {
          ctx.addIssue({ code: "custom", message: `Unknown node type: ${p}` });
          return z.NEVER;
        }
      }
      return parts as NodeType[];
    }),
  category: z.string().trim().min(1).max(80).optional(),
  limit: z.coerce.number().int().min(10).max(MAX_NODES).default(80),
});

export type CareerGraphQuery = z.infer<typeof careerGraphQuerySchema>;

export interface GraphNode {
  id: string;
  type: NodeType;
  entityId: string;
  label: string;
  href: string;
  degree: number;
  focus: boolean;
}

export interface GraphEdge {
  source: string;
  target: string;
  kind: string;
}

const HREF: Record<NodeType, (id: string) => string> = {
  skill: (id) => `/skills/${id}`,
  project: (id) => `/projects/${id}`,
  technology: (id) => `/skills/technologies/${id}`,
  certification: (id) => `/certifications/${id}`,
  experience: (id) => `/career/experience/${id}`,
  evidence: (id) => `/evidence/${id}`,
};

type Ids = Record<NodeType, Set<string>>;
const emptyIds = (): Ids => ({
  skill: new Set(),
  project: new Set(),
  technology: new Set(),
  certification: new Set(),
  experience: new Set(),
  evidence: new Set(),
});

interface Relation {
  kind: string;
  a: NodeType;
  b: NodeType;
}

const RELATIONS: Relation[] = [
  { kind: "demonstrates", a: "project", b: "skill" },
  { kind: "uses", a: "project", b: "technology" },
  { kind: "documents", a: "project", b: "evidence" },
  { kind: "evidences", a: "skill", b: "evidence" },
  { kind: "related", a: "technology", b: "skill" },
  { kind: "certifies", a: "certification", b: "skill" },
  { kind: "documents", a: "certification", b: "evidence" },
  { kind: "documents", a: "experience", b: "evidence" },
];

export function createCareerGraphService(db: PrismaClient) {
  /** All rows of one relation where `side` ∈ ids (owner-scoped, bounded by the id set). */
  async function rows(
    userId: string,
    rel: Relation,
    filter: { a?: string[]; b?: string[] },
    take = 2000,
  ): Promise<[string, string][]> {
    const inA = filter.a ? { in: filter.a } : undefined;
    const inB = filter.b ? { in: filter.b } : undefined;
    const pick = <T>(list: T[], f: (t: T) => [string, string]) => list.map(f);
    const key = `${rel.a}-${rel.b}`;
    switch (key) {
      case "project-skill":
        return pick(
          await db.projectSkill.findMany({
            where: { userId, projectId: inA, skillId: inB },
            select: { projectId: true, skillId: true },
            take,
          }),
          (r) => [r.projectId, r.skillId],
        );
      case "project-technology":
        return pick(
          await db.technologyUsage.findMany({
            where: { userId, projectId: inA, technologyId: inB },
            select: { projectId: true, technologyId: true },
            take,
          }),
          (r) => [r.projectId, r.technologyId],
        );
      case "project-evidence":
        return pick(
          await db.projectEvidence.findMany({
            where: { userId, projectId: inA, evidenceId: inB },
            select: { projectId: true, evidenceId: true },
            take,
          }),
          (r) => [r.projectId, r.evidenceId],
        );
      case "skill-evidence":
        return pick(
          await db.skillEvidence.findMany({
            where: { userId, skillId: inA, evidenceId: inB },
            select: { skillId: true, evidenceId: true },
            take,
          }),
          (r) => [r.skillId, r.evidenceId],
        );
      case "technology-skill":
        return pick(
          await db.technologySkill.findMany({
            where: { userId, technologyId: inA, skillId: inB },
            select: { technologyId: true, skillId: true },
            take,
          }),
          (r) => [r.technologyId, r.skillId],
        );
      case "certification-skill":
        return pick(
          await db.certificationSkill.findMany({
            where: { userId, certificationId: inA, skillId: inB },
            select: { certificationId: true, skillId: true },
            take,
          }),
          (r) => [r.certificationId, r.skillId],
        );
      case "certification-evidence":
        return pick(
          await db.certificationEvidence.findMany({
            where: { userId, certificationId: inA, evidenceId: inB },
            select: { certificationId: true, evidenceId: true },
            take,
          }),
          (r) => [r.certificationId, r.evidenceId],
        );
      case "experience-evidence":
        return pick(
          await db.experienceEvidence.findMany({
            where: { userId, experienceId: inA, evidenceId: inB },
            select: { experienceId: true, evidenceId: true },
            take,
          }),
          (r) => [r.experienceId, r.evidenceId],
        );
      default:
        throw new Error(`Unknown relation ${key}`);
    }
  }

  async function labels(userId: string, ids: Ids) {
    const list = (t: NodeType) => [...ids[t]];
    const [skills, projects, techs, certs, exps, evidence] = await Promise.all([
      db.skill.findMany({
        where: { userId, id: { in: list("skill") } },
        select: { id: true, name: true },
      }),
      db.project.findMany({
        where: { userId, id: { in: list("project") } },
        select: { id: true, name: true },
      }),
      db.technology.findMany({
        where: { userId, id: { in: list("technology") } },
        select: { id: true, name: true },
      }),
      db.certification.findMany({
        where: { userId, id: { in: list("certification") } },
        select: { id: true, name: true },
      }),
      db.experience.findMany({
        where: { userId, id: { in: list("experience") } },
        select: { id: true, title: true, organization: true },
      }),
      db.evidence.findMany({
        where: { userId, id: { in: list("evidence") } },
        select: { id: true, title: true },
      }),
    ]);
    const map = new Map<string, string>();
    for (const r of skills) map.set(`skill:${r.id}`, r.name);
    for (const r of projects) map.set(`project:${r.id}`, r.name);
    for (const r of techs) map.set(`technology:${r.id}`, r.name);
    for (const r of certs) map.set(`certification:${r.id}`, r.name);
    for (const r of exps) map.set(`experience:${r.id}`, `${r.title} · ${r.organization}`);
    for (const r of evidence) map.set(`evidence:${r.id}`, r.title);
    return map;
  }

  return {
    async graph(ctx: ServiceContext, q: CareerGraphQuery) {
      const userId = ctx.userId;
      const types = new Set<NodeType>(q.types);
      if (q.focusType) types.add(q.focusType);
      const relations = RELATIONS.filter((r) => types.has(r.a) && types.has(r.b));
      const seed = emptyIds();
      let focusKey: string | null = null;

      if (q.focusType && q.focusId) {
        // The focus record must be the caller's; foreign and missing ids are both 404.
        const exists = await (async () => {
          const where = { id: q.focusId, userId };
          switch (q.focusType) {
            case "skill":
              return db.skill.count({ where });
            case "project":
              return db.project.count({ where });
            case "technology":
              return db.technology.count({ where });
            case "certification":
              return db.certification.count({ where });
            case "experience":
              return db.experience.count({ where });
            case "evidence":
              return db.evidence.count({ where });
          }
        })();
        if (!exists) throw new AppError("NOT_FOUND");
        seed[q.focusType].add(q.focusId);
        focusKey = `${q.focusType}:${q.focusId}`;
      } else if (q.focusType || q.focusId) {
        throw new AppError("VALIDATION_FAILED", {
          details: [{ path: "focusId", message: "focusType and focusId go together" }],
        });
      } else {
        // Overview: the most-connected active skills (deterministic: degree, then name, then id).
        const skills = await db.skill.findMany({
          where: {
            userId,
            active: true,
            ...(q.category ? { category: { equals: q.category, mode: "insensitive" } } : {}),
          },
          select: {
            id: true,
            name: true,
            _count: {
              select: { projects: true, evidence: true, technologies: true, certifications: true },
            },
          },
        });
        skills
          .map((s) => ({
            id: s.id,
            name: s.name,
            degree:
              s._count.projects +
              s._count.evidence +
              s._count.technologies +
              s._count.certifications,
          }))
          .filter((s) => s.degree > 0)
          .sort(
            (a, b) =>
              b.degree - a.degree || a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
          )
          .slice(0, OVERVIEW_SKILLS)
          .forEach((s) => seed.skill.add(s.id));
      }

      // Neighbours of the seed (one hop), through every enabled relation.
      const neighbours: { key: string; type: NodeType; id: string }[] = [];
      await Promise.all(
        relations.map(async (rel) => {
          const fromA = [...seed[rel.a]];
          const fromB = [...seed[rel.b]];
          if (fromA.length) {
            for (const [, b] of await rows(userId, rel, { a: fromA })) {
              neighbours.push({ key: `${rel.b}:${b}`, type: rel.b, id: b });
            }
          }
          if (fromB.length) {
            for (const [a] of await rows(userId, rel, { b: fromB })) {
              neighbours.push({ key: `${rel.a}:${a}`, type: rel.a, id: a });
            }
          }
        }),
      );
      // Rank neighbours by how many seed links they have; keep within the node limit.
      const seedCount = NODE_TYPES.reduce((n, t) => n + seed[t].size, 0);
      const tally = new Map<string, { type: NodeType; id: string; links: number }>();
      for (const nb of neighbours) {
        if (seed[nb.type].has(nb.id)) continue;
        const t = tally.get(nb.key) ?? { type: nb.type, id: nb.id, links: 0 };
        t.links += 1;
        tally.set(nb.key, t);
      }
      const ranked = [...tally.entries()].sort(
        (a, b) => b[1].links - a[1].links || a[0].localeCompare(b[0]),
      );
      const room = Math.max(0, q.limit - seedCount);
      const ids = emptyIds();
      for (const t of NODE_TYPES) for (const id of seed[t]) ids[t].add(id);
      for (const [, n] of ranked.slice(0, room)) ids[n.type].add(n.id);
      const truncated = ranked.length > room;

      // Every edge among the selected nodes (both ends selected), one query per relation.
      const edges: GraphEdge[] = [];
      await Promise.all(
        relations.map(async (rel) => {
          const a = [...ids[rel.a]];
          const b = [...ids[rel.b]];
          if (!a.length || !b.length) return;
          for (const [x, y] of await rows(userId, rel, { a, b }, 5000)) {
            edges.push({ source: `${rel.a}:${x}`, target: `${rel.b}:${y}`, kind: rel.kind });
          }
        }),
      );
      edges.sort(
        (e1, e2) => e1.source.localeCompare(e2.source) || e1.target.localeCompare(e2.target),
      );

      const names = await labels(userId, ids);
      const degree = new Map<string, number>();
      for (const e of edges) {
        degree.set(e.source, (degree.get(e.source) ?? 0) + 1);
        degree.set(e.target, (degree.get(e.target) ?? 0) + 1);
      }
      const nodes: GraphNode[] = NODE_TYPES.flatMap((type) =>
        [...ids[type]].map((entityId) => {
          const id = `${type}:${entityId}`;
          return {
            id,
            type,
            entityId,
            label: names.get(id) ?? "",
            href: HREF[type](entityId),
            degree: degree.get(id) ?? 0,
            focus: id === focusKey,
          };
        }),
      ).sort(
        (a, b) =>
          Number(b.focus) - Number(a.focus) ||
          b.degree - a.degree ||
          a.label.localeCompare(b.label) ||
          a.id.localeCompare(b.id),
      );

      return {
        data: {
          mode: focusKey ? ("focus" as const) : ("overview" as const),
          focus: focusKey,
          types: [...types],
          nodes,
          edges,
          truncated,
          limit: q.limit,
        },
      };
    },
  };
}

export type CareerGraphDto = Awaited<
  ReturnType<ReturnType<typeof createCareerGraphService>["graph"]>
>["data"];
