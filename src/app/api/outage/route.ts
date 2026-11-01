const retired = () => Response.json({ error: "Outage receipt and custody workflows are retired. Historical records remain read-only." }, { status: 410 });

export const GET = retired;
export const POST = retired;
export const PUT = retired;
export const PATCH = retired;
export const DELETE = retired;
