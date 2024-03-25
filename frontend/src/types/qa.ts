export type QARun = {
  id: string;
  userName: string;
  started: string; // date
  finished: string; // date
  state: string;
  crawlExecSeconds: number;
  stats: {
    found: number;
    done: number;
    size: number;
  };
};
