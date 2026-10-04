import type { RequirementImportance } from "@/generated/prisma/enums";

/**
 * Evidence-to-requirement matching (01 §11; ADR 0056). Transparent and decomposable — never an
 * opaque "fit score". A requirement is `supported` only when it has at least one *verified* evidence
 * item mapped to it; `partial` when it has mapped evidence but none verified; `unsupported` with no
 * mapped evidence. Nothing is ever inferred from free text — only explicit RequirementEvidence links
 * count. Strength mirrors the status so colour is never the only signal.
 */
export type RequirementStatus = "supported" | "partial" | "unsupported";
export type RequirementStrength = "strong" | "moderate" | "none";

export interface FitRequirementInput {
  id: string;
  importance: RequirementImportance;
  evidence: { verified: boolean }[];
}

export interface FitRequirementResult {
  id: string;
  status: RequirementStatus;
  strength: RequirementStrength;
  evidenceCount: number;
  verifiedCount: number;
}

export function requirementStatus(evidence: { verified: boolean }[]): RequirementStatus {
  if (evidence.length === 0) return "unsupported";
  return evidence.some((e) => e.verified) ? "supported" : "partial";
}

const STRENGTH: Record<RequirementStatus, RequirementStrength> = {
  supported: "strong",
  partial: "moderate",
  unsupported: "none",
};

export interface CoverageBucket {
  total: number;
  supported: number;
  partial: number;
  unsupported: number;
}

export interface FitSummary {
  requirements: FitRequirementResult[];
  required: CoverageBucket;
  preferred: CoverageBucket;
  /**
   * Supported required requirements ÷ total required, rounded to 3 dp, or null when there are no
   * required requirements. Always presented alongside the counts above — never as a lone number.
   */
  requiredCoverage: number | null;
}

function emptyBucket(): CoverageBucket {
  return { total: 0, supported: 0, partial: 0, unsupported: 0 };
}

export function computeFit(requirements: FitRequirementInput[]): FitSummary {
  const required = emptyBucket();
  const preferred = emptyBucket();
  const results: FitRequirementResult[] = requirements.map((r) => {
    const status = requirementStatus(r.evidence);
    const bucket = r.importance === "required" ? required : preferred;
    bucket.total += 1;
    bucket[status] += 1;
    return {
      id: r.id,
      status,
      strength: STRENGTH[status],
      evidenceCount: r.evidence.length,
      verifiedCount: r.evidence.filter((e) => e.verified).length,
    };
  });
  const requiredCoverage =
    required.total === 0 ? null : Math.round((required.supported / required.total) * 1000) / 1000;
  return { requirements: results, required, preferred, requiredCoverage };
}
