const retired = () => Response.json({ error: "Daily closing is retired. Historical records remain read-only." }, { status: 410 });

export const GET = retired;
export const POST = retired;
export const PUT = retired;
export const PATCH = retired;
export const DELETE = retired;
