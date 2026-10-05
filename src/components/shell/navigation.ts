import {
  Activity,
  BarChart3,
  Bot,
  BookOpen,
  Boxes,
  BriefcaseBusiness,
  CalendarDays,
  FlaskConical,
  FolderKanban,
  Gauge,
  GitBranch,
  HardDrive,
  type LucideIcon,
  Mail,
  Medal,
  Network,
  Settings,
  ShieldCheck,
  Sparkles,
  Target,
} from "lucide-react";

/**
 * Navigation registry — the single source of truth for primary navigation, the command
 * palette and the section routes. Order and labels follow 00_MASTER_SPEC.md §3.
 *
 * `availability` must be honest: a section is `available` only when it has real
 * functionality. Planned sections render an explicit "Not available yet" state.
 */
export type SectionAvailability = "available" | "planned";

export interface NavSection {
  id: string;
  label: string;
  href: `/${string}`;
  icon: LucideIcon;
  /** One-sentence purpose, paraphrased from the specification. */
  summary: string;
  availability: SectionAvailability;
  /** Where the section is scheduled in 08_IMPLEMENTATION_PHASES.md. */
  plannedIn: string;
  /** Rendered in the sidebar footer instead of the main list. */
  placement: "main" | "footer";
  /** Shown in the mobile bottom bar (max 4). */
  mobilePrimary?: boolean;
}

export const NAV_SECTIONS: readonly NavSection[] = [
  {
    id: "command-center",
    label: "Command Center",
    href: "/command-center",
    icon: Gauge,
    summary: "What is important, blocked, changed and needs a decision — at a glance.",
    availability: "available",
    plannedIn: "Phase 2 (available). Derived health and intelligence: later phases.",
    placement: "main",
    mobilePrimary: true,
  },
  {
    id: "career",
    label: "Career Intelligence",
    href: "/career",
    icon: BriefcaseBusiness,
    summary: "Profile, experience and education records. Career analysis arrives in Phase 4.",
    availability: "available",
    plannedIn: "Records: Phase 1 (available). Career analysis: Phase 4.",
    placement: "main",
  },
  {
    id: "projects",
    label: "Projects",
    href: "/projects",
    icon: FolderKanban,
    summary:
      "Engineering dossiers: lifecycle, milestones, health, technologies, evidence and portfolio analytics.",
    availability: "available",
    plannedIn: "Records: Phase 1. Project intelligence: Phase 3 (available).",
    placement: "main",
    mobilePrimary: true,
  },
  {
    id: "engineering",
    label: "Engineering",
    href: "/engineering",
    icon: Activity,
    summary: "Deployments, incidents, quality, technical debt and delivery metrics.",
    availability: "planned",
    // Phase 9 delivered cross-domain Engineering Analytics under “Analytics”; these DORA/integration
    // metrics need a GitHub/CI/CD/issue-tracker integration PEOS does not have (05: never fabricated).
    plannedIn:
      "Future — requires engineering integrations (GitHub/CI/CD, issue tracker, deployments)",
    placement: "main",
  },
  {
    id: "github",
    label: "GitHub",
    href: "/github",
    icon: GitBranch,
    summary: "Repository intelligence: repositories, commits, activity, languages and analytics.",
    availability: "available",
    plannedIn: "Phase 9.6 — GitHub Repository Intelligence",
    placement: "main",
  },
  {
    id: "email",
    label: "Email",
    href: "/email",
    icon: Mail,
    summary: "Gmail inbox, threads and search; reply, compose and send with explicit confirmation.",
    availability: "available",
    plannedIn: "Phase 9.5 — Integration platform (Google)",
    placement: "main",
  },
  {
    id: "drive",
    label: "Drive",
    href: "/drive",
    icon: HardDrive,
    summary:
      "Browse Google Drive files and folders; open in Google. Drive stays the source of truth.",
    availability: "available",
    plannedIn: "Phase 9.5 — Integration platform (Google)",
    placement: "main",
  },
  {
    id: "calendar",
    label: "Calendar",
    href: "/calendar",
    icon: CalendarDays,
    summary: "Google Calendar agenda across day/week/month; create, update and cancel events.",
    availability: "available",
    plannedIn: "Phase 9.5 — Integration platform (Google)",
    placement: "main",
  },
  {
    id: "ai-lab",
    label: "AI Lab",
    href: "/ai-lab",
    icon: FlaskConical,
    summary: "Experiment registry, evaluation metrics and run comparison.",
    availability: "available",
    plannedIn: "Phase 6 — AI Lab (available)",
    placement: "main",
  },
  {
    id: "skills",
    label: "Skills",
    href: "/skills",
    icon: Target,
    summary: "Skills, technologies, targets and evidence links.",
    availability: "available",
    plannedIn: "Records: Phase 1. Skill intelligence: Phase 4 (available).",
    placement: "main",
    mobilePrimary: true,
  },
  {
    id: "knowledge",
    label: "Knowledge",
    href: "/knowledge",
    icon: BookOpen,
    summary: "Notes, articles, courses, papers and lessons learned.",
    availability: "planned",
    plannedIn: "Not yet scheduled in 08_IMPLEMENTATION_PHASES.md",
    placement: "main",
  },
  {
    id: "certifications",
    label: "Certifications",
    href: "/certifications",
    icon: Medal,
    summary: "Credentials, verification links, expiry tracking and related skills.",
    availability: "available",
    plannedIn: "Phase 1 (available).",
    placement: "main",
  },
  {
    id: "architecture",
    label: "Architecture",
    href: "/architecture",
    icon: Network,
    summary: "Architecture decision records and the interactive architecture map.",
    availability: "available",
    plannedIn: "Phase 7 — Architecture Intelligence (available)",
    placement: "main",
  },
  {
    id: "goals",
    label: "Goals & Roadmap",
    href: "/goals",
    icon: GitBranch,
    summary: "Goal hierarchy, milestones, dependencies and roadmap views.",
    availability: "available",
    plannedIn: "Phase 5 — Goals & Roadmap (available)",
    placement: "main",
  },
  {
    id: "analytics",
    label: "Analytics",
    href: "/analytics",
    icon: BarChart3,
    summary: "Career, engineering, AI and portfolio analytics with defined metrics.",
    availability: "available",
    plannedIn: "Phases 2–9 (incrementally, per domain)",
    placement: "main",
  },
  {
    id: "evidence",
    label: "Evidence Vault",
    href: "/evidence",
    icon: ShieldCheck,
    summary: "Professional evidence with provenance, linked to skills, projects and more.",
    availability: "available",
    plannedIn: "Records: Phase 1 (available). Uploads and portfolio export: Phase 10.",
    placement: "main",
  },
  {
    id: "opportunities",
    label: "Opportunities",
    href: "/opportunities",
    icon: Boxes,
    summary: "Professional opportunities with transparent requirement-to-evidence fit.",
    availability: "available",
    plannedIn: "Phase 10 — Evidence Vault & Opportunities (available)",
    placement: "main",
  },
  {
    id: "intelligence",
    label: "Intelligence",
    href: "/intelligence",
    icon: Sparkles,
    summary:
      "Continuous, grounded signals: evidence candidates, skill freshness, opportunity gaps, weekly review.",
    availability: "available",
    plannedIn: "Phase 13 — Continuous Intelligence (available)",
    placement: "main",
  },
  {
    id: "settings",
    label: "Settings / Integrations",
    href: "/settings",
    icon: Settings,
    summary: "Account, appearance, data import and export. Integrations arrive in Phase 9.",
    availability: "available",
    plannedIn: "Account, appearance, import and export: Phases 0–1. Integrations: Phase 9.",
    placement: "footer",
  },
  {
    id: "copilot",
    label: "AI Copilot",
    href: "/copilot",
    icon: Bot,
    summary: "Evidence-grounded assistant over your structured data, with citations.",
    availability: "available",
    plannedIn: "Phase 8 — AI Copilot",
    placement: "footer",
    mobilePrimary: true,
  },
];

export function findSection(id: string): NavSection | undefined {
  return NAV_SECTIONS.find((section) => section.id === id);
}

export function findSectionByPath(pathname: string): NavSection | undefined {
  return NAV_SECTIONS.find(
    (section) => pathname === section.href || pathname.startsWith(`${section.href}/`),
  );
}
