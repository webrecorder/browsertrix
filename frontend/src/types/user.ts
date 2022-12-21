export type CurrentUser = {
  id: string;
  email: string;
  name: string;
  isVerified: boolean;
  isAdmin: boolean;
  defaultTeamId?: string;
};
