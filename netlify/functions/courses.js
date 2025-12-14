import { getStore } from "@netlify/blobs";

const store = getStore({ name: "course-map" });
const TOKEN = process.env.COURSE_API_TOKEN;

export default async function handler(event) {
  if (event.httpMethod === "OPTIONS") return ok();

  if (event.httpMethod === "GET") {
    const data = (await store.get("courses")) || {};
    return ok({ courses: data, updatedAt: new Date().toISOString() });
  }

  if (event.httpMethod === "PUT") {
    if (!TOKEN || event.headers.authorization !== TOKEN) {
      return json(401, { error: "Unauthorized" });
    }
    const body = JSON.parse(event.body || "{}");
    await store.set("courses", body.courses || {});
    return ok({ saved: true });
  }

  return json(405, { error: "Method not allowed" });
}

function ok(payload = {}) {
  return json(200, payload);
}

function json(status, body) {
  return {
    statusCode: status,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,PUT,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
    body: JSON.stringify(body),
  };
}