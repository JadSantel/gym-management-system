import type { IdentityFieldErrors } from "./identity-schema";

export class IdentityRequestError extends Error {
  constructor(message: string, public status: number, public fieldErrors: IdentityFieldErrors = {}) { super(message); }
}

export async function identityRequest(action: string, body?: object) {
  const response = await fetch(`/api/identity/${action}`, body ? {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  } : { cache: "no-store" });
  const result = await response.json();
  if (!response.ok) throw new IdentityRequestError(result.error ?? "Request could not be completed.", response.status, result.fieldErrors);
  return result;
}
