export class APIError extends Error {
  statusCode: number;

  get isApiError() {
    return true;
  }

  constructor({ message, status }: { message: string; status: number }) {
    super(message);

    this.statusCode = status;
  }
}
