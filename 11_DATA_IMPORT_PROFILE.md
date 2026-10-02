# Professional Profile Import Specification

## Purpose

The application must ingest the user's real professional profile without
coupling personal facts to source code.

## Supported Sources

1.  Personal website
2.  CV / Resume
3.  LinkedIn export
4.  JSON
5.  CSV
6.  Manual entry

## Import Pipeline

``` text
Source
 ↓
Parser
 ↓
Normalized Candidate Records
 ↓
Duplicate Detection
 ↓
User Review
 ↓
Approve / Edit / Reject
 ↓
Canonical Database
```

## Importable Categories

-   Identity
-   Headline
-   Summary
-   Education
-   Experience
-   Projects
-   Skills
-   Technologies
-   Certifications
-   Publications
-   Languages
-   Links

## Provenance

Every imported record should store:

-   source
-   source URL/file
-   importedAt
-   parser version
-   confidence
-   reviewedAt
-   reviewedBy

## Conflict Resolution

When two sources disagree:

``` text
Do not silently overwrite.
Show:
Source A
Source B
Difference
Recommended resolution
```

The user decides.

## Website Import

Because the personal website may change, imported content must never
become permanently assumed truth.

Use: - manual refresh - diff view - approve changes

## Seed Data

Create a documented seed JSON schema, but do not populate it with
unverified personal facts.
