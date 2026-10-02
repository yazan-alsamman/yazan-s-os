import { toNextJsHandler } from "better-auth/next-js";

import { getAuth } from "@/lib/auth/auth";

// Better Auth owns /api/auth/* (sign-in, sign-up, sign-out, session, OAuth callbacks).
export async function GET(request: Request) {
  return toNextJsHandler(getAuth()).GET(request);
}

export async function POST(request: Request) {
  return toNextJsHandler(getAuth()).POST(request);
}
