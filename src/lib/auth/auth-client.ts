"use client";

import { createAuthClient } from "better-auth/react";

/** Browser auth client. Same-origin: requests go to /api/auth on the current host. */
export const authClient = createAuthClient();
