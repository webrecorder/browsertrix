export type Auth = any;

export type AuthState = {
  username: string;
  headers: {
    Authorization: string;
  };
};
