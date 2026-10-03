import type { ToolCall } from "./copilot.tools";

/**
 * Deterministic intent router (03 §7 "Intent Router"; ADR 0046). Server code — not the model —
 * decides which tools run, with which arguments. The question text can only select among the
 * twelve tools and a few explicit filters; it can never name a user, an owner or a raw query.
 */
export type CopilotTask = "answer" | "recommend" | "portfolio";
export type PortfolioKind =
  "case_study" | "project_summary" | "cv_bullets" | "architecture_narrative";
export interface Focus {
  type: "project" | "skill";
  id: string;
}

export interface RoutePlan {
  task: CopilotTask;
  intents: string[];
  calls: ToolCall[];
}

export const MAX_TOOL_CALLS = 4;

const has = (text: string, ...patterns: RegExp[]) => patterns.some((p) => p.test(text));
const w = (words: string) => new RegExp(`\\b(${words})\\b`, "i");

const INTENTS = {
  projects: w("projects?|portfolio|delivery|delivered|shipped|ship|milestones?|project health"),
  skills: w("skills?|skill gaps?|gaps?|levels?|expertise|strengthen|competenc(y|ies)"),
  career: w("career|coverage|cv|resume"),
  evidence: w("evidence|proof|proven|achievements?|demonstrat(e|ed|ion)"),
  goals: w("goals?|roadmap|objectives?|okrs?|north star|targets?"),
  experiments: w("experiments?|ai lab|models?|evaluations?|evals?|prompts?|latency|tokens?"),
  certifications: w("certifications?|certificates?|certs?|certified"),
  technologies: w("technolog(y|ies)|tech stack|stack|frameworks?|languages?|librar(y|ies)|tools?"),
  architecture: w("architecture|architectural|adrs?|design decisions?|decisions?|components?"),
} as const;

const ANALYTICS = w(
  "how many|count|number of|metrics?|rate|trend|coverage|distribution|percentage|ratio|kpis?",
);
const RECOMMEND = w(
  "should i|next|recommend(ation)?s?|suggest(ion)?s?|focus on|improve|strengthen|prioriti[sz]e",
);

/** First quoted phrase, if any — the only free text passed to a search tool. */
export function quotedTerm(question: string): string | undefined {
  const m = /["“'‘]([^"”'’]{2,100})["”'’]/.exec(question);
  return m?.[1]?.trim() || undefined;
}

export function rangeOf(question: string): "30d" | "90d" | "365d" | "all" {
  if (has(question, /\b30 days?\b|\blast month\b/i)) return "30d";
  if (has(question, /\b90 days?\b|\bquarter\b/i)) return "90d";
  if (has(question, /\ball[- ]time\b|\bever\b/i)) return "all";
  return "365d";
}

export function routeQuestion(
  question: string,
  options: { task?: CopilotTask; focus?: Focus } = {},
): RoutePlan {
  const q = quotedTerm(question);
  const calls: ToolCall[] = [];
  const intents: string[] = [];
  const add = (intent: string, call: ToolCall) => {
    if (calls.length >= MAX_TOOL_CALLS) return;
    if (!intents.includes(intent)) intents.push(intent);
    calls.push(call);
  };

  if (options.task === "portfolio") {
    if (options.focus?.type === "project") {
      const id = options.focus.id;
      add("portfolio", { tool: "getProject", input: { id } });
      add("portfolio", { tool: "searchEvidence", input: { projectId: id } });
      add("portfolio", { tool: "getArchitectureDecisions", input: { projectId: id } });
    }
    return { task: "portfolio", intents, calls };
  }

  if (options.focus?.type === "project")
    add("project", { tool: "getProject", input: { id: options.focus.id } });
  if (options.focus?.type === "skill")
    add("skill", { tool: "getSkill", input: { id: options.focus.id } });

  const recommend = options.task === "recommend" || has(question, RECOMMEND);
  if (recommend) {
    add("recommend", { tool: "searchSkills", input: {} });
    add("recommend", { tool: "getGoals", input: { open: true } });
    add("recommend", { tool: "searchProjects", input: {} });
    return { task: "recommend", intents, calls };
  }

  const analytics = has(question, ANALYTICS);
  const range = rangeOf(question);

  if (has(question, INTENTS.projects)) {
    if (analytics) add("projects", { tool: "getProjectMetrics", input: { range } });
    else add("projects", { tool: "searchProjects", input: { q } });
  }
  if (has(question, INTENTS.skills)) {
    add("skills", {
      tool: "searchSkills",
      input: {
        critical: /\bcritical\b/i.test(question) ? true : undefined,
        freshness: /\bstale\b/i.test(question) ? "stale" : undefined,
      },
    });
  }
  if (
    has(question, INTENTS.career) ||
    (analytics && has(question, INTENTS.skills, INTENTS.evidence))
  ) {
    add("career", { tool: "getCareerMetrics", input: { range } });
  }
  if (has(question, INTENTS.evidence)) {
    add("evidence", {
      tool: "searchEvidence",
      input: { q, verified: /\bverified\b/i.test(question) ? true : undefined },
    });
  }
  if (has(question, INTENTS.goals)) {
    add("goals", {
      tool: "getGoals",
      input: { q, risk: /\bat risk\b/i.test(question) ? "at_risk" : undefined },
    });
  }
  if (has(question, INTENTS.experiments)) {
    add("experiments", {
      tool: "getAIExperiments",
      input: { q, decision: /\badopt(ed)?\b/i.test(question) ? "adopt" : undefined },
    });
  }
  if (has(question, INTENTS.certifications)) {
    add("certifications", {
      tool: "getCertifications",
      input: { q, expiry: /\bexpir(ing|e|es)\b/i.test(question) ? "expiring" : undefined },
    });
  }
  if (has(question, INTENTS.technologies))
    add("technologies", { tool: "searchTechnologies", input: { q } });
  if (has(question, INTENTS.architecture)) {
    add("architecture", {
      tool: "getArchitectureDecisions",
      input: { q, revisitDue: /\brevisit|stale\b/i.test(question) ? true : undefined },
    });
  }
  // Strip undefined so strict schemas see only real arguments.
  for (const c of calls) {
    c.input = Object.fromEntries(Object.entries(c.input).filter(([, v]) => v !== undefined));
  }
  return { task: "answer", intents, calls };
}
