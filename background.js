chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const apiFetch = async (path, params = "") => {
    const { ACUITY_USER_ID, ACUITY_API_KEY } = await chrome.storage.local.get(["ACUITY_USER_ID","ACUITY_API_KEY"]);
    if (!ACUITY_USER_ID || !ACUITY_API_KEY) {
      return { ok:false, data:{ message:"Missing credentials. Open the extension’s Options to set them." } };
    }
    const headers = new Headers({ Authorization: "Basic " + btoa(`${ACUITY_USER_ID}:${ACUITY_API_KEY}`) });
    const res = await fetch(`https://acuityscheduling.com/api/v1${path}${params}`, { headers });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, data };
  };
  
  // -------- FETCH CALENDARS --------
  if (request.action === "fetchCalendars") {
    (async () => {
      try {
        const { ACUITY_USER_ID, ACUITY_API_KEY } = await chrome.storage.local.get([
          "ACUITY_USER_ID",
          "ACUITY_API_KEY",
        ]);

        if (!ACUITY_USER_ID || !ACUITY_API_KEY) {
          console.warn("⚠️ Missing credentials");
          sendResponse({ success: false, error: "Missing credentials." });
          return;
        }

        const headers = new Headers({
          Authorization: "Basic " + btoa(`${ACUITY_USER_ID}:${ACUITY_API_KEY}`),
        });

      
        const res = await fetch("https://acuityscheduling.com/api/v1/calendars", { headers });
        const data = await res.json();

        const res2 = await fetch("https://acuityscheduling.com/api/v1/appointment-types", { headers});
        const data2 = await res2.json();
        

      
        sendResponse({ success: res.ok, data, error: res.ok ? null : data });
      } catch (err) {
        console.error("❌ Error fetching calendars:", err);
        sendResponse({ success: false, error: err.message });
      }
    })();

    return true; // keep message channel open
  }

  // -------- FETCH AVAILABILITY --------
  if (request.action === "fetchAvailability") {

    (async () => {
      try {
        const { ACUITY_USER_ID, ACUITY_API_KEY } = await chrome.storage.local.get([
          "ACUITY_USER_ID",
          "ACUITY_API_KEY",
        ]);

        const { calendarId, date, appointmentTypeID } = request;

        if (!ACUITY_USER_ID || !ACUITY_API_KEY) {
          sendResponse({ success: false, error: "Missing credentials." });
          return;
        }

        if (!appointmentTypeID) {
          sendResponse({ success: false, error: "Missing appointmentTypeID." });
          return;
        }

        const headers = new Headers({
          Authorization: "Basic " + btoa(`${ACUITY_USER_ID}:${ACUITY_API_KEY}`),
        });
        const response = await fetch("https://acuityscheduling.com/api/v1/appointment-types", {headers});
        const data2 = await response.json();
        console.log("Appointment Types Response:", data2);

        const url = `https://acuityscheduling.com/api/v1/availability/times?calendarID=${calendarId}&appointmentTypeID=${appointmentTypeID}&date=${date}`;

        

        const res = await fetch(url, { headers });
        const data = await res.json();

        console.log(data);
        
        sendResponse({ success: res.ok, data, error: res.ok ? null : data });
      } catch (err) {
        console.error("❌ Error fetching availability:", err);
        sendResponse({ success: false, error: err.message });
      }
    })();

    return true; // keep message channel open
  }
});
