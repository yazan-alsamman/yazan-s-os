/**
 * Passed to every domain service call. `userId` always comes from the server-validated session,
 * never from request input (ADR 0003).
 */
export interface ServiceContext {
  userId: string;
  requestId: string | null;
}
