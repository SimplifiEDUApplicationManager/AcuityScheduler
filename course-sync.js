(() => {
  const defaultUrl =
    typeof DEFAULT_REMOTE_COURSE_URL === "string"
      ? DEFAULT_REMOTE_COURSE_URL
      : "";

  function getRemoteConfigFromStorage(values = {}) {
    return {
      url: ((values.COURSE_REMOTE_URL ?? defaultUrl) || "").trim(),
      token: (values.COURSE_REMOTE_TOKEN || "").trim(),
    };
  }

  async function fetchCourseMapFromRemote(remoteConfig = {}) {
    const url = remoteConfig.url;
    if (!url) return null;
    const headers = { Accept: "application/json" };
    if (remoteConfig.token) {
      headers.Authorization = remoteConfig.token;
    }
    const res = await fetch(url, {
      method: "GET",
      headers,
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error(`Remote fetch failed (${res.status})`);
    }
    const payload = await res.json();
    return extractCourseMapPayload(payload);
  }

  async function pushCourseMapToRemote(courseMap, remoteConfig = {}) {
    const url = remoteConfig.url;
    if (!url) return null;
    const headers = { "Content-Type": "application/json" };
    if (remoteConfig.token) {
      headers.Authorization = remoteConfig.token;
    }
    const res = await fetch(url, {
      method: "PUT",
      headers,
      body: JSON.stringify({
        updatedAt: new Date().toISOString(),
        courses: courseMap,
      }),
    });
    if (!res.ok) {
      throw new Error(`Remote save failed (${res.status})`);
    }
    return res.json().catch(() => ({}));
  }

  function extractCourseMapPayload(payload) {
    if (!payload || typeof payload !== "object") return null;
    if (payload.courses && typeof payload.courses === "object") {
      return payload.courses;
    }
    return payload;
  }

  const api = {
    getRemoteConfigFromStorage,
    fetchCourseMapFromRemote,
    pushCourseMapToRemote,
    extractCourseMapPayload,
  };

  const target =
    (typeof globalThis !== "undefined" && globalThis) ||
    (typeof window !== "undefined" && window) ||
    this;
  if (target) {
    Object.assign(target, api);
  }
})();
