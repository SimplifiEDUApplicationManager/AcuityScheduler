import { getStore } from "@netlify/blobs";

const store = getStore({ name: "course-map" });
const TOKEN = process.env.COURSE_API_TOKEN;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,PUT,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function jsonResponse(status, obj) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

export default async function handler(request) {
  if (request.method === "OPTIONS") {
    return new Response("", { status: 200, headers: CORS_HEADERS });
  }

  if (request.method === "GET") {
    let data = {};
    try {
        data = (await store.get("courses", { type: "json" })) || {};
    } catch {
        // Old bad value ("[object Object]") — wipe it
        await store.setJSON("courses", {});
        data = {};
    }

    return jsonResponse(200, {
        courses: data,
        updatedAt: new Date().toISOString(),
    });
}

  if (request.method === "PUT") {
    const auth = request.headers.get("authorization") || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : auth;

    if (!TOKEN || token !== TOKEN) {
      return jsonResponse(401, { error: "Unauthorized" });
    }

    const body = await request.json().catch(() => ({}));
    const coursesToSave = body.courses ?? body ?? {};

    if (typeof coursesToSave !== "object" || coursesToSave === null) {
      return jsonResponse(400, { error: "Courses must be a JSON object" });
    }

    await store.setJSON("courses", coursesToSave);
    return jsonResponse(200, { saved: true });
  }

  return jsonResponse(405, { error: "Method not allowed" });
}
