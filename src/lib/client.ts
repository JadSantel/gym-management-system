export async function identityRequest(action: string, body?: object) {
  const response = await fetch(`/api/identity/${action}`, body ? {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  } : { cache: "no-store" });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "Request could not be completed.");
  return result;
}
