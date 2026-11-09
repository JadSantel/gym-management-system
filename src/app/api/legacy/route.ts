const retired = () => Response.json({ error: "Legacy evidence entry and review are retired. Existing records remain read-only." }, { status: 410 });

export const GET = retired;
export const POST = retired;
export const PUT = retired;
export const PATCH = retired;
export const DELETE = retired;
