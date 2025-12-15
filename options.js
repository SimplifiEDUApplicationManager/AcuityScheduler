const uid = document.getElementById("uid");
const key = document.getElementById("key");
const msg = document.getElementById("msg");
const remoteUrlInput = document.getElementById("remoteUrl");
const remoteTokenInput = document.getElementById("remoteToken");
const saveRemoteConfigBtn = document.getElementById("saveRemoteConfig");
const newCourseInput = document.getElementById("newCourseName");
const addCourseBtn = document.getElementById("addCourseBtn");
const courseSelect = document.getElementById("courseSelector");
const tutorSelect = document.getElementById("courseTutors");
const courseMsg = document.getElementById("courseMsg");
const saveCourseTutorsBtn = document.getElementById("saveCourseTutors");
const removeCourseBtn = document.getElementById("removeCourseBtn");

let courseTutorMap = cloneCourseMap(DEFAULT_COURSE_TUTOR_MAP);
const tutorOptions = buildTutorOptions();
let remoteConfig = { url: DEFAULT_REMOTE_COURSE_URL, token: "" };

document.getElementById("save").addEventListener("click", async () => {
  const ACUITY_USER_ID = uid.value.trim();
  const ACUITY_API_KEY = key.value.trim();

  if (!ACUITY_USER_ID || !ACUITY_API_KEY) {
    msg.textContent = "Please fill both fields.";
    msg.className = "error";
    return;
  }

  await chrome.storage.local.set({ ACUITY_USER_ID, ACUITY_API_KEY });

  msg.textContent = "Saved!";
  msg.className = "ok";
});

saveRemoteConfigBtn.addEventListener("click", async () => {
  remoteConfig = {
    url: remoteUrlInput.value.trim(),
    token: remoteTokenInput.value.trim(),
  };

  await chrome.storage.local.set({
    COURSE_REMOTE_URL: remoteConfig.url,
    COURSE_REMOTE_TOKEN: remoteConfig.token,
  });

  if (!remoteConfig.url) {
    setCourseMessage("Remote sync disabled. Using local data only.");
    return;
  }

  const loaded = await pullRemoteCourses(true);
  if (loaded) {
    populateCourseOptions();
  }
});

saveCourseTutorsBtn.addEventListener("click", async () => {
  const course = courseSelect.value;
  if (!course) {
    setCourseMessage("Select a course to update.", true);
    return;
  }

  const selectedIds = Array.from(tutorSelect.selectedOptions).map((opt) =>
    Number(opt.value)
  );
  courseTutorMap[course] = selectedIds;
  const synced = await syncCourseMapWithRemote();
  if (synced) {
    setCourseMessage(`Updated ${course} with ${selectedIds.length} tutor(s).`);
  }
});

addCourseBtn.addEventListener("click", async () => {
  const rawName = newCourseInput.value;
  const courseName = normalizeCourseName(rawName);

  if (!courseName) {
    setCourseMessage("Enter a course name to add.", true);
    return;
  }

  const existing = findCourseKey(courseName);
  if (existing) {
    setCourseMessage(`"${existing}" already exists.`, true);
    return;
  }

  courseTutorMap[courseName] = [];
  const synced = await syncCourseMapWithRemote();
  if (synced) {
    newCourseInput.value = "";
    populateCourseOptions(courseName);
    setCourseMessage(`Added ${courseName}. Assign tutors below.`);
  }
});

removeCourseBtn.addEventListener("click", async () => {
  const course = courseSelect.value;
  if (!course) {
    setCourseMessage("Select a course to remove.", true);
    return;
  }

  const confirmed = window.confirm(
    `Remove "${course}" from the course list?`
  );
  if (!confirmed) return;

  delete courseTutorMap[course];
  const synced = await syncCourseMapWithRemote();
  if (synced) {
    populateCourseOptions();
    setCourseMessage(`Removed ${course}.`);
  }
});

courseSelect.addEventListener("change", () => {
  renderTutorSelections();
  setCourseMessage("");
});

(async () => {
  const stored = await chrome.storage.local.get([
    "ACUITY_USER_ID",
    "ACUITY_API_KEY",
    "COURSE_TUTOR_MAP",
    "COURSE_REMOTE_URL",
    "COURSE_REMOTE_TOKEN",
  ]);

  if (stored.ACUITY_USER_ID) uid.value = stored.ACUITY_USER_ID;
  if (stored.ACUITY_API_KEY) key.value = stored.ACUITY_API_KEY;

  remoteConfig = getRemoteConfigFromStorage(stored);
  remoteUrlInput.value = remoteConfig.url;
  remoteTokenInput.value = remoteConfig.token;

  let loaded = false;
  if (remoteConfig.url) {
    loaded = await pullRemoteCourses(false);
  }

  if (!loaded && stored.COURSE_TUTOR_MAP) {
    courseTutorMap = hydrateCourseMap(stored.COURSE_TUTOR_MAP);
    loaded = true;
  }

  if (!loaded) {
    courseTutorMap = cloneCourseMap(DEFAULT_COURSE_TUTOR_MAP);
  }

  populateCourseOptions();
})();

function populateCourseOptions(preferredCourse) {
  const courses = Object.keys(courseTutorMap).sort((a, b) =>
    a.localeCompare(b)
  );

  courseSelect.innerHTML = "";
  courses.forEach((course) => {
    const option = document.createElement("option");
    option.value = course;
    option.textContent = course;
    courseSelect.appendChild(option);
  });

  let selection = preferredCourse || courseSelect.value;
  if (!selection || !courses.includes(selection)) {
    selection = courses[0] || "";
  }

  courseSelect.value = selection;
  renderTutorSelections();
}

function renderTutorSelections() {
  tutorSelect.innerHTML = "";
  const hasCourses = Object.keys(courseTutorMap).length > 0;

  courseSelect.disabled = !hasCourses;
  tutorSelect.disabled = !hasCourses;
  saveCourseTutorsBtn.disabled = !hasCourses;
  removeCourseBtn.disabled = !hasCourses;

  if (!hasCourses) {
    const placeholder = document.createElement("option");
    placeholder.textContent = "Add a course to begin.";
    placeholder.disabled = true;
    placeholder.selected = true;
    tutorSelect.appendChild(placeholder);
    return;
  }

  const course = courseSelect.value;
  const assigned = new Set(courseTutorMap[course] || []);

  tutorOptions.forEach(({ id, label }) => {
    const option = document.createElement("option");
    option.value = id;
    option.textContent = label;
    if (assigned.has(id)) {
      option.selected = true;
    }
    tutorSelect.appendChild(option);
  });
}

function buildTutorOptions() {
  if (!Tutors || typeof Tutors !== "object") return [];
  return Object.entries(Tutors)
    .map(([name, id]) => ({
      id,
      label: formatTutorName(name),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

function formatTutorName(key) {
  return key
    .split("_")
    .map((chunk) => chunk.charAt(0) + chunk.slice(1).toLowerCase())
    .join(" ");
}

function setCourseMessage(text, isError = false) {
  courseMsg.textContent = text;
  if (!text) {
    courseMsg.className = "status";
    return;
  }
  courseMsg.className = `status ${isError ? "error" : "ok"}`;
}

function hydrateCourseMap(storedValue) {
  if (storedValue && typeof storedValue === "object") {
    const normalized = {};
    Object.entries(storedValue).forEach(([course, tutorIds]) => {
      const name = normalizeCourseName(course);
      if (!name) return;
      normalized[name] = normalizeTutorList(tutorIds);
    });
    return normalized;
  }

  return cloneCourseMap(DEFAULT_COURSE_TUTOR_MAP);
}

function normalizeTutorList(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));
}

function normalizeCourseName(name) {
  return typeof name === "string"
    ? name.replace(/\s+/g, " ").trim()
    : "";
}

function findCourseKey(name) {
  if (!name) return null;
  const target = name.toLowerCase();
  return (
    Object.keys(courseTutorMap).find(
      (course) => course.toLowerCase() === target
    ) || null
  );
}

function cloneCourseMap(sourceMap) {
  const copy = {};
  Object.entries(sourceMap || {}).forEach(([course, ids]) => {
    const name = normalizeCourseName(course);
    if (!name) return;
    copy[name] = normalizeTutorList(ids);
  });
  return copy;
}

async function persistCourseMapLocal() {
  await chrome.storage.local.set({ COURSE_TUTOR_MAP: courseTutorMap });
}

async function syncCourseMapWithRemote() {
  await persistCourseMapLocal();
  if (!remoteConfig.url) return true;
  try {
    await pushCourseMapToRemote(courseTutorMap, remoteConfig);
    return true;
  } catch (err) {
    console.error("Remote sync failed:", err);
    setCourseMessage(
      `Saved locally, but remote sync failed: ${err.message}`,
      true
    );
    return false;
  }
}

async function pullRemoteCourses(showMessages) {
  if (!remoteConfig.url) return false;
  try {
    const remoteMap = await fetchCourseMapFromRemote(remoteConfig);
    if (remoteMap && Object.keys(remoteMap).length) {
      courseTutorMap = hydrateCourseMap(remoteMap);
      await persistCourseMapLocal();
      if (showMessages) {
        setCourseMessage("Loaded shared courses from remote.");
      }
      return true;
    }
    if (showMessages) {
      setCourseMessage("Remote source returned no courses.", true);
    }
  } catch (err) {
    console.error("Remote fetch failed:", err);
    if (showMessages) {
      setCourseMessage(`Couldn't load remote data: ${err.message}`, true);
    }
  }
  return false;
}
