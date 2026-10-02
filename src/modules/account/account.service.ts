import type { AuthenticatedUser } from "@/lib/auth/ownership";
import { AppError } from "@/lib/errors/app-error";

import type { AccountRepository } from "./account.repository";

export interface AccountView {
  id: string;
  email: string;
  name: string;
  image: string | null;
  timezone: string;
  locale: string;
  createdAt: string;
}

export function createAccountService(deps: { repository: AccountRepository }) {
  return {
    /** The caller's own account. There is no way to request another user's account. */
    async getOwnAccount(user: AuthenticatedUser): Promise<AccountView> {
      const account = await deps.repository.findById(user.id);
      if (!account) throw new AppError("NOT_FOUND");
      return { ...account, createdAt: account.createdAt.toISOString() };
    },
  };
}

export type AccountService = ReturnType<typeof createAccountService>;
