export type Auth = {
  username: string;
  headers: {
    Authorization: string;
  };
};

export type AuthState = Auth | null;
