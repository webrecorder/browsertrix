import { APIErrorDetailEnum, type APIErrorDetail } from "@/types/api";

type StatusCode = number;
export type Detail = {
  loc: string[];
  msg: string;
  type: string;
};

export class APIError extends Error {
  statusCode: StatusCode;
  // TODO Refactor so that details is always the array returned from API
  // https://github.com/webrecorder/browsertrix/issues/2512
  details: Detail[] | string | null;
  errorCode: APIErrorDetail | string | null;

  get isApiError(): true {
    return true;
  }

  constructor({
    message,
    status,
    details,
    errorCode,
  }: {
    message: string;
    status: StatusCode;
    details?: APIError["details"];
    errorCode?: APIError["errorCode"];
  }) {
    super(message);

    this.statusCode = status;
    this.details = details || null;
    this.errorCode = errorCode || null;
  }
}

export function isApiError(error: unknown): error is APIError {
  return Boolean((error as APIError | undefined)?.isApiError);
}

export function isApiErrorDetail(detail: unknown): detail is APIErrorDetail {
  if (!detail || typeof detail !== "string") return false;

  return APIErrorDetailEnum.safeParse(detail).success;
}
