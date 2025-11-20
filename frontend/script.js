// Backend base URL
const BASE_URL = "http://127.0.0.1:5000";

// Grab elements
const userInputEl = document.getElementById("userInput");
const targetRoleEl = document.getElementById("targetRole");
const profileOutputEl = document.getElementById("profileOutput");
const cvOutputEl = document.getElementById("cvOutput");
const btnCreateProfile = document.getElementById("btnCreateProfile");
const btnGenerateCV = document.getElementById("btnGenerateCV");

// Stored from backend
let currentProfileId = null;
let currentProfile = null;

// -------------------------------------------------------------
// 1) CREATE PROFILE (calls /build_profile)
// -------------------------------------------------------------
btnCreateProfile.addEventListener("click", async () => {
  const rawText = userInputEl.value.trim();
  if (!rawText) {
    alert("Please tell SpaniSami a bit about yourself first.");
    return;
  }

  btnCreateProfile.disabled = true;
  btnCreateProfile.textContent = "Creating profile...";
  profileOutputEl.textContent = "Talking to SpaniSami...";

  try {
    const res = await fetch(`${BASE_URL}/build_profile`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ raw_text: rawText })
    });

    if (!res.ok) throw new Error(`Backend error ${res.status}`);

    const data = await res.json();

    // Backend returns:
    // { profile_id: "...", profile: "<JSON string>" }
    currentProfileId = data.profile_id;
    currentProfile = JSON.parse(data.profile);

    profileOutputEl.textContent = JSON.stringify(
      { profile_id: currentProfileId, profile: currentProfile },
      null,
      2
    );

    btnGenerateCV.disabled = false;
  } catch (err) {
    console.error(err);
    profileOutputEl.textContent = "Error talking to backend.";
  } finally {
    btnCreateProfile.disabled = false;
    btnCreateProfile.textContent = "Create Profile";
  }
});

// -------------------------------------------------------------
// 2) GENERATE CV (calls /generate_cv)
// -------------------------------------------------------------
btnGenerateCV.addEventListener("click", async () => {
  if (!currentProfileId && !currentProfile) {
    alert("First create a profile.");
    return;
  }

  const targetRole = targetRoleEl.value.trim();

  btnGenerateCV.disabled = true;
  btnGenerateCV.textContent = "Generating CV...";
  cvOutputEl.textContent = "SpaniSami is building your CV...";

  try {
    const res = await fetch(`${BASE_URL}/generate_cv`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        profile_id: currentProfileId,
        profile: currentProfile
      })
    });

    if (!res.ok) throw new Error(`Backend error ${res.status}`);

    const data = await res.json();
    cvOutputEl.textContent = data.cv || "No CV returned.";
  } catch (err) {
    console.error(err);
    cvOutputEl.textContent = "Error generating CV.";
  } finally {
    btnGenerateCV.disabled = false;
    btnGenerateCV.textContent = "Generate CV";
  }
});
