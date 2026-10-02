import type { FieldDescriptor } from "@/components/forms/entity-form";

import {
  CERTIFICATION_STATUS_OPTIONS,
  EVIDENCE_TYPE_OPTIONS,
  LEVEL_OPTIONS,
  PROJECT_HEALTH_OPTIONS,
  PROJECT_STATUS_OPTIONS,
} from "./options";

/** Form descriptors per Phase 1 entity. Limits mirror the server schemas. */
export const PROJECT_FIELDS: readonly FieldDescriptor[] = [
  { name: "name", label: "Name", kind: "text", required: true, maxLength: 200 },
  {
    name: "slug",
    label: "Slug",
    kind: "text",
    maxLength: 80,
    omitIfEmpty: true,
    description: "Lower-case and hyphens. Left empty, one is generated from the name.",
  },
  {
    name: "status",
    label: "Lifecycle status",
    kind: "select",
    options: PROJECT_STATUS_OPTIONS,
    defaultValue: "idea",
  },
  {
    name: "healthStatus",
    label: "Health",
    kind: "select",
    options: PROJECT_HEALTH_OPTIONS,
    defaultValue: "not_assessed",
  },
  { name: "startDate", label: "Start date", kind: "date" },
  { name: "targetDate", label: "Target date", kind: "date" },
  { name: "completedAt", label: "Completed", kind: "date" },
  { name: "repositoryUrl", label: "Repository URL", kind: "url" },
  { name: "demoUrl", label: "Demo URL", kind: "url" },
  { name: "productionUrl", label: "Production URL", kind: "url" },
  { name: "description", label: "Description", kind: "textarea", maxLength: 10_000 },
  { name: "problem", label: "Problem", kind: "textarea", maxLength: 10_000 },
  { name: "solution", label: "Solution", kind: "textarea", maxLength: 10_000 },
  { name: "impact", label: "Impact", kind: "textarea", maxLength: 10_000 },
];

export const SKILL_FIELDS: readonly FieldDescriptor[] = [
  { name: "name", label: "Name", kind: "text", required: true, maxLength: 120 },
  {
    name: "category",
    label: "Category",
    kind: "text",
    maxLength: 80,
    description: "Free text, e.g. Backend, AI, Leadership.",
  },
  {
    name: "targetLevel",
    label: "Target level",
    kind: "select",
    numeric: true,
    emptyOption: "No target",
    options: LEVEL_OPTIONS,
    description: "Your goal. The current level is derived from evidence, not self-assessed.",
  },
  { name: "active", label: "Active", kind: "checkbox", defaultValue: true },
  { name: "description", label: "Description", kind: "textarea", maxLength: 4_000 },
];

export const TECHNOLOGY_FIELDS: readonly FieldDescriptor[] = [
  { name: "name", label: "Name", kind: "text", required: true, maxLength: 120 },
  { name: "category", label: "Category", kind: "text", maxLength: 80 },
  { name: "version", label: "Version", kind: "text", maxLength: 40 },
  { name: "notes", label: "Notes", kind: "textarea", maxLength: 4_000 },
];

export const CERTIFICATION_FIELDS: readonly FieldDescriptor[] = [
  { name: "name", label: "Name", kind: "text", required: true, maxLength: 200 },
  { name: "issuer", label: "Issuer", kind: "text", required: true, maxLength: 200 },
  { name: "category", label: "Category", kind: "text", maxLength: 80 },
  {
    name: "status",
    label: "Status",
    kind: "select",
    options: CERTIFICATION_STATUS_OPTIONS,
    defaultValue: "earned",
  },
  { name: "issueDate", label: "Issue date", kind: "date" },
  { name: "expiryDate", label: "Expiry date", kind: "date" },
  { name: "credentialId", label: "Credential ID", kind: "text", maxLength: 200 },
  { name: "verificationUrl", label: "Verification URL", kind: "url" },
];

export const EVIDENCE_FIELDS: readonly FieldDescriptor[] = [
  { name: "title", label: "Title", kind: "text", required: true, maxLength: 300, wide: true },
  {
    name: "type",
    label: "Type",
    kind: "select",
    options: EVIDENCE_TYPE_OPTIONS,
    defaultValue: "document",
  },
  { name: "date", label: "Date", kind: "date" },
  { name: "sourceUrl", label: "Source URL", kind: "url" },
  {
    name: "fileUrl",
    label: "File URL",
    kind: "url",
    description: "Link to the file where it is stored. Uploads arrive with the Evidence Vault.",
  },
  {
    name: "verified",
    label: "Verified — I checked this against its source",
    kind: "checkbox",
    defaultValue: false,
    wide: true,
  },
  { name: "description", label: "Description", kind: "textarea", maxLength: 10_000 },
];

export const EXPERIENCE_FIELDS: readonly FieldDescriptor[] = [
  { name: "title", label: "Title", kind: "text", required: true, maxLength: 200 },
  { name: "organization", label: "Organization", kind: "text", required: true, maxLength: 200 },
  { name: "startDate", label: "Start date", kind: "date", required: true },
  {
    name: "endDate",
    label: "End date",
    kind: "date",
    description: "Leave empty for a current position.",
  },
  { name: "description", label: "Description", kind: "textarea", maxLength: 10_000 },
  { name: "achievements", label: "Achievements", kind: "lines", description: "One per line." },
];

export const EDUCATION_FIELDS: readonly FieldDescriptor[] = [
  {
    name: "institution",
    label: "Institution",
    kind: "text",
    required: true,
    maxLength: 200,
    wide: true,
  },
  { name: "degree", label: "Degree", kind: "text", maxLength: 200 },
  { name: "fieldOfStudy", label: "Field of study", kind: "text", maxLength: 200 },
  { name: "startDate", label: "Start date", kind: "date" },
  { name: "endDate", label: "End date", kind: "date" },
  { name: "description", label: "Description", kind: "textarea", maxLength: 10_000 },
  { name: "achievements", label: "Achievements", kind: "lines", description: "One per line." },
];
