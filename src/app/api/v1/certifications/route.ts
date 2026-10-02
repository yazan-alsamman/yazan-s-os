import { getDb } from "@/lib/db/client";
import { collectionRoutes } from "@/lib/http/crud-routes";
import {
  listCertificationsQuerySchema,
  createCertificationSchema,
} from "@/modules/certifications/certification.schemas";
import { createCertificationService } from "@/modules/certifications/certification.service";

export const dynamic = "force-dynamic";

export const { GET, POST } = collectionRoutes(
  "certifications",
  () => createCertificationService(getDb()),
  {
    list: listCertificationsQuerySchema,
    create: createCertificationSchema,
  },
);
