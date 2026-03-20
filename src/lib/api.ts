type ApiMethod = "DELETE" | "GET" | "PATCH" | "POST";

export class ApiError extends Error {
  body: unknown;
  status: number;

  constructor(status: number, message: string, body: unknown) {
    super(message);
    this.name = "ApiError";
    this.body = body;
    this.status = status;
  }
}

function getApiUrl(path: string) {
  return new URL(path, window.location.origin).toString();
}

async function parseResponseBody(response: Response) {
  if (response.status === 204) {
    return null;
  }

  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    return (await response.json()) as unknown;
  }

  const text = await response.text();
  return text.length > 0 ? text : null;
}

function getErrorMessage(status: number, body: unknown) {
  if (
    body &&
    typeof body === "object" &&
    "error" in body &&
    typeof body.error === "string"
  ) {
    return body.error;
  }

  if (typeof body === "string" && body.trim().length > 0) {
    return body;
  }

  return `Request failed with status ${status}.`;
}

async function apiRequest<T>(
  method: ApiMethod,
  path: string,
  body?: unknown,
): Promise<T | null> {
  const headers = new Headers({
    Accept: "application/json",
  });

  const init: RequestInit = {
    headers,
    method,
  };

  if (body !== undefined) {
    headers.set("Content-Type", "application/json");
    init.body = JSON.stringify(body);
  }

  const response = await fetch(getApiUrl(path), init);
  const responseBody = await parseResponseBody(response);

  if (!response.ok) {
    throw new ApiError(
      response.status,
      getErrorMessage(response.status, responseBody),
      responseBody,
    );
  }

  return responseBody as T | null;
}

export function apiGet<T>(path: string) {
  return apiRequest<T>("GET", path);
}

export function apiPost<T>(path: string, body: unknown) {
  return apiRequest<T>("POST", path, body);
}

export function apiPatch<T>(path: string, body: unknown) {
  return apiRequest<T>("PATCH", path, body);
}

export function apiDelete<T>(path: string) {
  return apiRequest<T>("DELETE", path);
}
