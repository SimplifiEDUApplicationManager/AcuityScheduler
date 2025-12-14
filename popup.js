document.addEventListener("DOMContentLoaded", async () => {
  const resultsDiv = document.getElementById("results");
  const filterButton = document.getElementById("filterAvailability");
  const appointmentSelect = document.getElementById("appointmentType");
  const dateTimeContainer = document.getElementById("dateTimeContainer");
  const addDateTimeBtn = document.getElementById("addDateTime");
  const timeZoneSelect = document.getElementById("timeZone");
  const MAX_GROUPS = 4;
  const $courseSelect = $("#courseSelect");

  resultsDiv.innerHTML = "Loading tutors...";

  let courseTutorMap = hydrateCourseMap();
  let tutorSubjectsById = buildTutorSubjectMap(courseTutorMap);

  try {
    const { COURSE_TUTOR_MAP } = await chrome.storage.local.get([
      "COURSE_TUTOR_MAP",
    ]);
    if (COURSE_TUTOR_MAP) {
      courseTutorMap = hydrateCourseMap(COURSE_TUTOR_MAP);
      tutorSubjectsById = buildTutorSubjectMap(courseTutorMap);
    }
  } catch (err) {
    console.warn("Unable to load saved course assignments", err);
  }

  populateCourseDropdown($courseSelect, courseTutorMap);
  $courseSelect.select2({
    placeholder: "Search for courses...",
    multiple: true,
    width: "95%",
    dropdownParent: $("#courseSelect").parent(),
  });

  let calendars = [];

  chrome.runtime.sendMessage({ action: "fetchCalendars" }, (response) => {
    console.log("📨 fetchCalendars response:", response);
    if (!response || !response.success) {
      resultsDiv.innerHTML =
        "Error fetching tutors. Check credentials on the Options page.";
      console.error(response?.error);
      return;
    }

    calendars = Array.isArray(response.data) ? response.data : [];
    displayCalendars(calendars);
    registerEventHandlers(calendars);
  });

  function registerEventHandlers(currentCalendars) {
    addDateTimeBtn.addEventListener("click", addDateTimeGroup);

    dateTimeContainer.addEventListener("click", (e) => {
      if (e.target.classList.contains("remove-btn")) {
        const group = e.target.closest(".dateTimeGroup");
        if (group) {
          group.remove();
          refreshAddButtonState();
        }
      }
    });

    filterButton.addEventListener("click", async () => {
      const appointmentTypeID = appointmentSelect.value;
      const timeZone = timeZoneSelect.value;
      const selectedSubjects = $courseSelect.val() || [];
      const groups = Array.from(
        document.querySelectorAll(".dateTimeGroup")
      );

      if (!groups.length) {
        const filteredCalendars = filterCalendarsBySubjects(
          currentCalendars,
          selectedSubjects
        );
        displayCalendars(filteredCalendars);
        return;
      }

      resultsDiv.innerHTML = "Checking availability...";
      let filteredCalendars = filterCalendarsBySubjects(
        currentCalendars,
        selectedSubjects
      );
      const availableTutors = [];

      for (const cal of filteredCalendars) {
        let tutorHasMatch = false;

        for (const group of groups) {
          const date = group.querySelector(".availabilityDate").value;
          const startTime = group.querySelector(".startTime").value;
          const endTime = group.querySelector(".endTime").value;

          if (!date || !startTime || !endTime) {
            alert(
              "Please select a date, start time, and end time for each time block before filtering."
            );
            resultsDiv.innerHTML = "";
            return;
          }

          const res = await new Promise((resolve) => {
            chrome.runtime.sendMessage(
              {
                action: "fetchAvailability",
                calendarId: cal.id,
                date,
                appointmentTypeID,
                timeZone,
              },
              (resp) => resolve(resp)
            );
          });

          if (
            res?.success &&
            Array.isArray(res.data) &&
            res.data.some(
              (slot) =>
                slot.slotsAvailable > 0 &&
                isWithinRange(
                  slot,
                  startTime,
                  endTime,
                  timeZone,
                  appointmentTypeIDs[appointmentTypeID]
                )
            )
          ) {
            tutorHasMatch = true;
            break;
          }
        }

        if (tutorHasMatch) {
          availableTutors.push(cal);
        }
      }

      displayCalendars(availableTutors);
    });
  }

  function createDateTimeGroup() {
    const div = document.createElement("div");
    div.className = "dateTimeGroup";
    div.innerHTML = `
      <label>Start Date:</label>
      <button type="button" class="remove-btn" title="Remove">&times;</button>
      <input type="date" class="availabilityDate" />
      <label>Start:</label>
      <input type="time" class="startTime" />
      <label>End:</label>
      <input type="time" class="endTime" />
    `;
    return div;
  }

  function addDateTimeGroup() {
    const count = dateTimeContainer.querySelectorAll(".dateTimeGroup").length;
    if (count >= MAX_GROUPS) return;
    dateTimeContainer.appendChild(createDateTimeGroup());
    refreshAddButtonState();
  }

  function refreshAddButtonState() {
    const count = dateTimeContainer.querySelectorAll(".dateTimeGroup").length;
    addDateTimeBtn.style.display = count >= MAX_GROUPS ? "none" : "block";
  }

  function filterCalendarsBySubjects(list, subjects) {
    if (!subjects || !subjects.length) return list;
    const tutorPool = getCommonTutors(subjects);
    if (!tutorPool.length) return [];
    return list.filter((cal) => tutorPool.includes(cal.id));
  }

  function getCommonTutors(subjects) {
    if (!subjects?.length) return [];
    let intersection = null;

    subjects.forEach((subject) => {
      const tutorIds = getTutorIdsForCourse(subject);
      if (intersection === null) {
        intersection = tutorIds;
      } else {
        intersection = intersection.filter((id) => tutorIds.includes(id));
      }
    });

    return intersection || [];
  }

  function getTutorIdsForCourse(courseName) {
    const ids = courseTutorMap[courseName];
    if (!Array.isArray(ids)) return [];
    return ids.filter((id) => typeof id === "number");
  }

  function displayCalendars(cals) {
    if (!cals.length) {
      resultsDiv.innerHTML = "No tutors found.";
      return;
    }

    resultsDiv.innerHTML = cals
      .map((cal) => {
        const subjects = tutorSubjectsById[cal.id] || [];
        const subjectsText = subjects.length
          ? subjects.join(", ")
          : "No subjects assigned yet.";
        return `
          <div class="tutor-card" data-id="${cal.id}">
            <strong>${cal.name}</strong><br>
            <small>${subjectsText}</small>
            <div class="calendar-embed" id="embed-${cal.id}" style="display:none;"></div>
          </div>`;
      })
      .join("");

    document.querySelectorAll(".tutor-card").forEach((card) => {
      card.addEventListener("click", () => {
        const calId = card.getAttribute("data-id");
        const embedDiv = document.getElementById(`embed-${calId}`);

        if (embedDiv.style.display === "none") {
          embedDiv.innerHTML = `
            <iframe
              src="https://app.acuityscheduling.com/schedule.php?owner=${ACUITY_USER_ID}&calendarID=${calId}"
              width="100%"
              height="400"
              frameborder="0">
            </iframe>`;
          embedDiv.style.display = "block";
        } else {
          embedDiv.innerHTML = "";
          embedDiv.style.display = "none";
        }
      });
    });
  }

  function populateCourseDropdown($select, courseMap) {
    $select.empty();
    Object.keys(courseMap)
      .sort((a, b) => a.localeCompare(b))
      .forEach((course) => {
        $select.append(new Option(course, course));
      });
  }
});

function hydrateCourseMap(storedValue) {
  const normalized = {};

  if (storedValue && typeof storedValue === "object") {
    Object.entries(storedValue).forEach(([course, tutorIds]) => {
      normalized[course] = normalizeTutorList(tutorIds);
    });
  }

  Object.entries(DEFAULT_COURSE_TUTOR_MAP).forEach(([course, tutorIds]) => {
    if (!Object.prototype.hasOwnProperty.call(normalized, course)) {
      normalized[course] = normalizeTutorList(tutorIds);
    }
  });

  return normalized;
}

function buildTutorSubjectMap(courseMap) {
  const lookup = {};
  Object.entries(courseMap).forEach(([course, ids]) => {
    (ids || []).forEach((id) => {
      if (typeof id !== "number") return;
      if (!lookup[id]) {
        lookup[id] = [];
      }
      lookup[id].push(course);
    });
  });
  return lookup;
}

function normalizeTutorList(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));
}

function isWithinRange(
  slotTime,
  startTime,
  endTime,
  timeZone = "UTC",
  duration = 60
) {
  if (!startTime && !endTime) return true;

  const slot = new Date(slotTime.time);
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const [{ value: hour }, , { value: minute }] = fmt.formatToParts(slot);
  const slotMinutes = parseInt(hour, 10) * 60 + parseInt(minute, 10);

  const [sH, sM] = startTime ? startTime.split(":").map(Number) : [0, 0];
  const [eH, eM] = endTime ? endTime.split(":").map(Number) : [23, 59];
  const startMinutes = sH * 60 + sM;
  const endMinutes = eH * 60 + eM;

  return slotMinutes >= startMinutes && slotMinutes + duration <= endMinutes;
}
