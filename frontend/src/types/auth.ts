export type Auth = {
  username: string;
  headers: {
    Authorization: string;
  };
};

export type AuthState = Auth | null;

export type CurrentUser = {
  email: string;
  isVerified: boolean;
};
