import { getDb } from "@/lib/db/client";
import { itemRoutes } from "@/lib/http/crud-routes";
import { updateCertificationSchema } from "@/modules/certifications/certification.schemas";
import { createCertificationService } from "@/modules/certifications/certification.service";

export const dynamic = "force-dynamic";

export const { GET, PATCH, DELETE } = itemRoutes(
  "certifications",
  () => createCertificationService(getDb()),
  {
    update: updateCertificationSchema,
  },
);
