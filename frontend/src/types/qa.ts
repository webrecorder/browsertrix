export type QARun = {
  id: string;
  userName: string;
  started: string;
  finished: string;
  state: string;
  crawlExecSeconds: number;
  stats: {
    found: number;
    done: number;
    size: number;
  };
};
