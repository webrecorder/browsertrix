type StatusCode = number;
type Detail = {
  loc: any[];
  msg: string;
};

export class APIError extends Error {
  statusCode: StatusCode;
  details: Detail[] | null;

  get isApiError() {
    return true;
  }

  constructor({
    message,
    status,
    details,
  }: {
    message: string;
    status: StatusCode;
    details?: Detail[];
  }) {
    super(message);

    this.statusCode = status;
    this.details = details || null;
  }
}
