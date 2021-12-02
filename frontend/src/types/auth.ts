export type Auth = {
  username: string;
  headers: {
    Authorization: string;
  };
};

export type AuthState = Auth | null;

export type CurrentUser = {
  id: string;
  email: string;
  name: string;
  isVerified: boolean;
};
