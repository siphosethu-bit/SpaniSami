// =======================
// CONFIG
// =======================
const BASE_URL = "http://127.0.0.1:5000"; // Flask backend

// =======================
// DOM ELEMENTS (TEXT CV FLOW)
// =======================
const userInputEl = document.getElementById("userInput");
const targetRoleEl = document.getElementById("targetRole");
const profileOutputEl = document.getElementById("profileOutput");
const cvOutputEl = document.getElementById("cvOutput");
const btnCreateProfile = document.getElementById("btnCreateProfile");
const btnGenerateCV = document.getElementById("btnGenerateCV");
const btnDownloadPdf = document.getElementById("btnDownloadPdf");

// =======================
// DOM ELEMENTS (VOICE ASSISTANT)
// =======================
const voiceLanguageEl = document.getElementById("voiceLanguage");
const btnToggleRecording = document.getElementById("btnToggleRecording");
const micStatusEl = document.getElementById("micStatus");
const voiceChatLogEl = document.getElementById("voiceChatLog");
const voiceOrbWrapper = document.querySelector(".voice-orb-wrapper");

// =======================
// HERO TESTIMONIAL ROTATION
// =======================
const testimonials = [
  {
    initials: "KS",
    name: "Khosi Sambo",
    meta: "Retail & Customer Support · Johannesburg",
    quote:
      '"SpaniSami turned my weekend spaza hustle into a real CV. I finally felt confident applying for jobs."',
  },
  {
    initials: "LM",
    name: "Lerato M.",
    meta: "First‑time job seeker · Soweto",
    quote:
      '"I spoke in isiZulu and English mix, and it still understood me. Now my CV actually looks professional."',
  },
  {
    initials: "TK",
    name: "Thabo K.",
    meta: "Student & Maths tutor · Pretoria",
    quote:
      '"I used my tutoring and church work as experience. SpaniSami helped me explain it nicely for bursary forms."',
  },
  {
    initials: "AZ",
    name: "Ayanda Z.",
    meta: "Side‑hustle hairstylist · Durban",
    quote:
      '"I always thought my braiding hustle was small. Seeing it as real work experience on my CV changed my mindset."',
  },
];

function initHeroTestimonials() {
  const card = document.getElementById("testimonialCard");
  const avatarEl = document.getElementById("testimonialAvatar");
  const nameEl = document.getElementById("testimonialName");
  const metaEl = document.getElementById("testimonialMeta");
  const quoteEl = document.getElementById("testimonialQuote");
  const dotsContainer = document.getElementById("testimonialDots");

  if (!card || !avatarEl || !nameEl || !metaEl || !quoteEl || !dotsContainer) {
    return;
  }

  let index = 0;
  const dots = [];

  testimonials.forEach((t, i) => {
    const dot = document.createElement("button");
    dot.className = "testimonial-dot" + (i === 0 ? " active" : "");
    dot.addEventListener("click", () => {
      index = i;
      render();
      resetInterval();
    });
    dotsContainer.appendChild(dot);
    dots.push(dot);
  });

  function render() {
    const t = testimonials[index];
    avatarEl.textContent = t.initials;
    nameEl.textContent = t.name;
    metaEl.textContent = t.meta;
    quoteEl.textContent = t.quote;

    dots.forEach((d, i) => d.classList.toggle("active", i === index));

    // trigger fade animation
    card.classList.remove("fade-in");
    // force reflow
    void card.offsetWidth;
    card.classList.add("fade-in");
  }

  render();

  let intervalId = setInterval(() => {
    index = (index + 1) % testimonials.length;
    render();
  }, 3000);

  function resetInterval() {
    clearInterval(intervalId);
    intervalId = setInterval(() => {
      index = (index + 1) % testimonials.length;
      render();
    }, 3000);
  }
}

// Helper to update orb visual state: idle | listening | processing | speaking
function setVoiceVisualState(state) {
  if (!voiceOrbWrapper) return;
  voiceOrbWrapper.classList.remove(
    "state-idle",
    "state-listening",
    "state-processing",
    "state-speaking"
  );
  voiceOrbWrapper.classList.add(`state-${state}`);
}

// =======================
// STATE (TEXT CV)
// =======================
let currentProfileId = null;
let currentProfile = null;
let currentCvText = "";

// =======================
// STATE (VOICE ASSISTANT)
// =======================
const SpeechRecognition =
  window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
let isListening = false;
let lastTranscript = "";
let voiceSessionId = null; // session_id from backend
const VOICE_MODE = "cv"; // "cv" or "interview"

// =======================
// 1) CREATE PROFILE (TEXT INPUT)
// =======================
if (btnCreateProfile) {
  btnCreateProfile.addEventListener("click", async () => {
    const text = userInputEl.value.trim();
    if (!text) {
      alert("Please tell SpaniSami a bit about yourself first.");
      return;
    }

    btnCreateProfile.disabled = true;
    btnCreateProfile.textContent = "Creating profile...";
    profileOutputEl.textContent = "SpaniSami is thinking...";

    try {
      const profileIdFromLogin = localStorage.getItem("spaniProfileId");
      const phoneFromLogin = localStorage.getItem("spaniUserPhone") || null;

      const res = await fetch(`${BASE_URL}/build_profile`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          raw_text: text,
          preferred_language: "en",
          profile_id: profileIdFromLogin,   // optional – backend can ignore if None
          phone: phoneFromLogin,           // optional – for name/email sync later
        }),
      });

      if (!res.ok) {
        throw new Error(`Backend error: ${res.status}`);
      }

      const data = await res.json();
      currentProfileId = data.profile_id || null;

      // profile is JSON string from backend – try to parse it for nicer display
      try {
        currentProfile = data.profile ? JSON.parse(data.profile) : null;
      } catch (e) {
        console.warn("Could not parse profile JSON, keeping raw text.", e);
        currentProfile = data.profile || null;
      }

      profileOutputEl.textContent = JSON.stringify(
        {
          profile_id: currentProfileId,
          profile: currentProfile,
        },
        null,
        2
      );

      // allow CV generation now
      btnGenerateCV.disabled = false;
    } catch (err) {
      console.error(err);
      profileOutputEl.textContent =
        "Eish, something went wrong talking to the backend.";
    } finally {
      btnCreateProfile.disabled = false;
      btnCreateProfile.textContent = "Create Profile";
    }
  });
}

// =======================
// 2) GENERATE CV
// =======================
if (btnGenerateCV) {
  btnGenerateCV.addEventListener("click", async () => {
    if (!currentProfileId && !currentProfile) {
      alert("First create a profile.");
      return;
    }

    const targetRole = targetRoleEl.value.trim() || null;

    btnGenerateCV.disabled = true;
    btnGenerateCV.textContent = "Generating CV...";
    cvOutputEl.textContent = "SpaniSami is building your CV...";

    try {
      const res = await fetch(`${BASE_URL}/generate_cv`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profile_id: currentProfileId,
          profile: currentProfile,
          target_role: targetRole,
        }),
      });

      if (!res.ok) {
        throw new Error(`Backend error: ${res.status}`);
      }

      const data = await res.json();
      currentCvText = data.cv || "";

      if (!currentCvText) {
        cvOutputEl.textContent = "No CV text returned from backend.";
        btnDownloadPdf.disabled = true;
      } else {
        cvOutputEl.textContent = currentCvText;
        btnDownloadPdf.disabled = false;
      }
    } catch (err) {
      console.error(err);
      cvOutputEl.textContent =
        "Error generating CV. Please check the backend logs.";
      btnDownloadPdf.disabled = true;
    } finally {
      btnGenerateCV.disabled = false;
      btnGenerateCV.textContent = "Generate CV";
    }
  });
}

// =======================
// 3) DOWNLOAD AS PDF
// =======================
if (btnDownloadPdf) {
  btnDownloadPdf.addEventListener("click", () => {
    if (!currentCvText) {
      alert("Please generate a CV first.");
      return;
    }

    if (!window.jspdf || !window.jspdf.jsPDF) {
      alert("PDF library not loaded. Check your index.html <script> tags.");
      return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: "pt", format: "a4" });

    const margin = 40;
    const maxWidth = 515; // page width (~595) - 2*margin
    const lines = doc.splitTextToSize(currentCvText, maxWidth);

    doc.setFont("Helvetica", "normal");
    doc.setFontSize(11);
    doc.text(lines, margin, margin);

    doc.save("SpaniSami_CV.pdf");
  });
}

// =======================
// VOICE ASSISTANT HELPERS
// =======================
function appendChatMessage(sender, text) {
  if (!text || !voiceChatLogEl) return;

  const wrapper = document.createElement("div");
  wrapper.className = `chat-message ${sender === "bot" ? "bot" : "user"}`;

  const label = document.createElement("div");
  label.className = "chat-label";
  label.textContent = sender === "bot" ? "SpaniSami" : "You";

  const bubble = document.createElement("div");
  bubble.className = "chat-bubble";
  bubble.textContent = text;

  wrapper.appendChild(label);
  wrapper.appendChild(bubble);
  voiceChatLogEl.appendChild(wrapper);
  voiceChatLogEl.scrollTop = voiceChatLogEl.scrollHeight;
}

function speakText(text, langCode) {
  if (!window.speechSynthesis) return;
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = mapToLocale(langCode);

  // Show "speaking" state while SpaniSami is talking
  setVoiceVisualState("speaking");
  utter.onend = () => {
    setVoiceVisualState("idle");
  };

  window.speechSynthesis.speak(utter);
}

function mapToLocale(code) {
  const map = {
    en: "en-ZA",
    af: "af-ZA",
    zu: "zu-ZA",
    xh: "xh-ZA",
    st: "st-ZA",
    tn: "tn-ZA",
    nso: "nso-ZA",
    ts: "ts-ZA",
    ve: "ve-ZA",
    ss: "ss-ZA",
    nr: "nr-ZA",
  };
  return map[code] || "en-ZA";
}

// =======================
// VOICE ASSISTANT SETUP
// =======================
function setupVoiceAssistant() {
  if (!btnToggleRecording) return;

  if (!SpeechRecognition) {
    if (micStatusEl) {
      micStatusEl.textContent =
        "Your browser does not support speech recognition. Use Chrome on desktop.";
    }
    btnToggleRecording.disabled = true;
    return;
  }

  recognition = new SpeechRecognition();
  recognition.interimResults = true;
  recognition.continuous = false;

  let userCancelled = false;

  recognition.onstart = () => {
    console.log("SpeechRecognition started");
    userCancelled = false;
    lastTranscript = "";
    setVoiceVisualState("listening");
  };

  recognition.onresult = (event) => {
    console.log("SpeechRecognition result event", event);

    let transcript = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      transcript += event.results[i][0].transcript + " ";
    }
    lastTranscript = transcript.trim();

    if (lastTranscript && micStatusEl) {
      micStatusEl.textContent = `I heard: "${lastTranscript}"`;
    }
  };

  recognition.onerror = (event) => {
    console.error("SpeechRecognition error:", event.error, event.message);
    isListening = false;
    updateMicUi();
    if (micStatusEl) {
      micStatusEl.textContent = `Mic error: ${event.error || "unknown error"}`;
    }
  };

  recognition.onnomatch = () => {
    console.warn("SpeechRecognition: no match");
    if (micStatusEl) {
      micStatusEl.textContent =
        "I could not understand what you said. Please try again.";
    }
  };

  recognition.onend = async () => {
    console.log("SpeechRecognition ended. Last transcript:", lastTranscript);
    isListening = false;
    updateMicUi();

    if (userCancelled) {
      console.log("SpeechRecognition manually cancelled by user.");
      if (micStatusEl) {
        micStatusEl.textContent = "Mic stopped. Tap Start talking to try again.";
      }
      setVoiceVisualState("idle");
      return;
    }

    if (!lastTranscript) {
      if (micStatusEl) {
        micStatusEl.textContent = "I didn't hear anything. Try again.";
      }
      setVoiceVisualState("idle");
      return;
    }

    // We have text; now backend is processing
    setVoiceVisualState("processing");

    if (micStatusEl) {
      micStatusEl.textContent = `I heard: "${lastTranscript}". SpaniSami is thinking...`;
    }

    appendChatMessage("user", lastTranscript);
    await sendTextToBackend(lastTranscript);
    lastTranscript = "";
  };

  btnToggleRecording.addEventListener("click", () => {
    if (!recognition) return;

    if (!isListening) {
      const langCode = voiceLanguageEl?.value || "en";
      const locale = mapToLocale(langCode);
      recognition.lang = locale;

      try {
        recognition.start();
        isListening = true;
        updateMicUi();
        if (micStatusEl) micStatusEl.textContent = "Listening...";
      } catch (err) {
        console.error("Failed to start recognition:", err);
        if (micStatusEl) {
          micStatusEl.textContent =
            "Could not start microphone. Check permissions.";
        }
      }
    } else {
      userCancelled = true;
      recognition.abort();
    }
  });

  function updateMicUi() {
    const labelEl = btnToggleRecording.querySelector(".mic-label");
    if (!labelEl) return;

    if (isListening) {
      labelEl.textContent = "Stop talking";
      btnToggleRecording.classList.add("recording");
    } else {
      labelEl.textContent = "Start talking";
      btnToggleRecording.classList.remove("recording");
    }
  }

  async function sendTextToBackend(text) {
    const langCode = voiceLanguageEl?.value || "en";

    if (micStatusEl) micStatusEl.textContent = "SpaniSami is thinking...";

    try {
      const res = await fetch(`${BASE_URL}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: voiceSessionId,
          message: text,
          language: langCode,
          mode: VOICE_MODE,
        }),
      });

      const data = await res.json();
      console.log("Backend /chat response:", data);

      if (!res.ok) {
        throw new Error(data.error || `Backend error: ${res.status}`);
      }

      if (data.session_id) {
        voiceSessionId = data.session_id;
      }

      if (data.reply) {
        appendChatMessage("bot", data.reply);
        speakText(data.reply, langCode);
      }

      if (micStatusEl) {
        micStatusEl.textContent =
          "Done. Tap the mic to answer the next question.";
      }
    } catch (err) {
      console.error("sendTextToBackend error:", err);
      if (micStatusEl) {
        micStatusEl.textContent = "Something went wrong. Please try again.";
      }
      alert("Voice chat failed: " + err.message);
    }
  }
}

// =======================
// JOB SCANNER STATE
// =======================
let mapsApiLoaded = false;
let jobScannerInitialized = false;
let jobMap = null;
let jobCircle = null;
let jobMarkers = [];

// Quick centres for major SA cities
const cityCenters = {
  jhb: { name: "Johannesburg", lat: -26.2041, lng: 28.0473 },
  pta: { name: "Pretoria", lat: -25.7479, lng: 28.2293 },
  cpt: { name: "Cape Town", lat: -33.9249, lng: 18.4241 },
  dbn: { name: "Durban", lat: -29.8587, lng: 31.0218 },
  plk: { name: "Polokwane", lat: -23.8962, lng: 29.4486 },
  bf: { name: "Bloemfontein", lat: -29.0852, lng: 26.1596 },
  gqe: { name: "Gqeberha", lat: -33.9608, lng: 25.6022 },
  rst: { name: "Rustenburg", lat: -25.6544, lng: 27.2559 },
};

const jobLocations = [
  // Johannesburg & surrounds
  {
    id: 1,
    city: "Johannesburg",
    title: "Cashier – Local Supermarket",
    company: "Friendly Grocer · Soweto, Johannesburg",
    lat: -26.2485,
    lng: 27.854,
    description: "Handle cash, assist customers, and keep the till area tidy.",
    requirements: [
      "Good with people and basic maths",
      "Comfortable working weekends",
      "Reliable and punctual",
    ],
  },
  {
    id: 2,
    city: "Johannesburg",
    title: "Call Centre Agent – Learnership",
    company: "Ubuntu Contact Centre · Braamfontein",
    lat: -26.1949,
    lng: 28.0323,
    description:
      "Entry-level call centre learnership with full training provided.",
    requirements: [
      "Matric (any pass)",
      "Comfortable speaking on the phone",
      "Willing to learn and take feedback",
    ],
  },
  {
    id: 3,
    city: "Johannesburg",
    title: "Tutor – Grade 8–10 Maths",
    company: "After-school Programme · Alexandra",
    lat: -26.1044,
    lng: 28.0891,
    description:
      "Help high school learners with maths homework and exam revision.",
    requirements: [
      "Strong maths marks (or experience tutoring)",
      "Patient and able to explain clearly",
      "Available afternoons or Saturdays",
    ],
  },
  {
    id: 4,
    city: "Johannesburg",
    title: "Shop Assistant – Clothing Store",
    company: "Downtown Fashion · Johannesburg CBD",
    lat: -26.2044,
    lng: 28.0456,
    description:
      "Assist customers on the floor, pack stock, and keep the store neat.",
    requirements: [
      "Friendly, presentable, and confident",
      "Able to stand for long periods",
      "Weekend and public holiday shifts",
    ],
  },
  {
    id: 5,
    city: "Johannesburg",
    title: "Barista / Counter Hand",
    company: "Corner Café · Rosebank",
    lat: -26.1467,
    lng: 28.0414,
    description:
      "Make basic hot drinks, serve customers, and keep the coffee bar tidy.",
    requirements: [
      "Enjoy working with people",
      "Willing to learn coffee-making skills",
      "Early morning and weekend shifts",
    ],
  },

  // Pretoria
  {
    id: 6,
    city: "Pretoria",
    title: "Admin Assistant – Entry Level",
    company: "Community Clinic · Pretoria CBD",
    lat: -25.7465,
    lng: 28.189,
    description:
      "Help with filing, scanning documents, and answering basic queries.",
    requirements: [
      "Basic computer skills (email, Word)",
      "Organised and detail-focused",
      "Friendly with patients and staff",
    ],
  },
  {
    id: 7,
    city: "Pretoria",
    title: "Retail Assistant – Electronics",
    company: "Gadget World · Hatfield",
    lat: -25.746,
    lng: 28.2337,
    description:
      "Assist customers with phones and accessories, manage stock on shelves.",
    requirements: [
      "Interest in phones and gadgets",
      "Comfortable talking to customers",
      "Weekend and holiday availability",
    ],
  },

  // Cape Town
  {
    id: 8,
    city: "Cape Town",
    title: "Waiter / Waitress – Waterfront",
    company: "Harbour View Restaurant · V&A Waterfront",
    lat: -33.905,
    lng: 18.4207,
    description:
      "Serve guests, take orders, and help keep the restaurant area neat.",
    requirements: [
      "Good spoken English",
      "Friendly and able to work under pressure",
      "Evening and weekend shifts",
    ],
  },
  {
    id: 9,
    city: "Cape Town",
    title: "Warehouse Picker & Packer",
    company: "Online Store Hub · Montague Gardens",
    lat: -33.8645,
    lng: 18.5124,
    description:
      "Pick online orders, pack boxes, and assist with stock counts.",
    requirements: [
      "Able to lift light boxes",
      "Comfortable standing and walking",
      "Attention to detail when packing",
    ],
  },

  // Durban
  {
    id: 10,
    city: "Durban",
    title: "Front Desk Assistant – Budget Hotel",
    company: "Seaside Lodge · Durban North",
    lat: -29.7919,
    lng: 31.0256,
    description:
      "Welcome guests, answer calls, and assist with basic check-in tasks.",
    requirements: [
      "Friendly phone manner",
      "Basic computer skills",
      "Able to work shifts and weekends",
    ],
  },
  {
    id: 11,
    city: "Durban",
    title: "Retail Cashier – Clothing",
    company: "Urban Styles · Durban CBD",
    lat: -29.8579,
    lng: 31.0219,
    description:
      "Operate the till, assist shoppers, and keep the front area clean.",
    requirements: [
      "Comfortable working with cash",
      "Customer-focused",
      "Shift and weekend work",
    ],
  },

  // Polokwane
  {
    id: 12,
    city: "Polokwane",
    title: "Promoter – In-store Sampling",
    company: "SnackCo Promotions · Polokwane Mall",
    lat: -23.9028,
    lng: 29.4541,
    description:
      "Promote new snacks in store, offer tasters, and share basic product info.",
    requirements: [
      "Confident talking to strangers",
      "Energetic and outgoing",
      "Weekend work in malls",
    ],
  },

  // Bloemfontein
  {
    id: 13,
    city: "Bloemfontein",
    title: "Library Assistant",
    company: "Community Library · Bloemfontein Central",
    lat: -29.1121,
    lng: 26.214,
    description:
      "Help shelve books, assist learners with finding resources, and keep the space tidy.",
    requirements: [
      "Enjoy reading or studying",
      "Quiet, helpful attitude",
      "Available afternoons",
    ],
  },

  // Gqeberha
  {
    id: 14,
    city: "Gqeberha",
    title: "Call Centre Trainee – Customer Care",
    company: "Bay Contact Centre · Gqeberha",
    lat: -33.96,
    lng: 25.6022,
    description:
      "Handle basic customer calls with full training provided.",
    requirements: [
      "Good phone voice in English and one local language",
      "Willingness to learn scripts",
      "Able to work shifts",
    ],
  },

  // Rustenburg
  {
    id: 15,
    city: "Rustenburg",
    title: "General Assistant – Hardware Store",
    company: "BuildRight Hardware · Rustenburg",
    lat: -25.6544,
    lng: 27.2559,
    description:
      "Help customers find items, carry small loads, and keep aisles neat.",
    requirements: [
      "Physically fit for light lifting",
      "Good with people",
      "Weekend availability",
    ],
  },
];

// Card DOM
const jobDetailCardEl = document.getElementById("jobDetailCard");
const jobDetailTitleEl = document.getElementById("jobDetailTitle");
const jobDetailMetaEl = document.getElementById("jobDetailMeta");
const jobDetailDescriptionEl = document.getElementById("jobDetailDescription");
const jobDetailRequirementsEl = document.getElementById("jobDetailRequirements");
const jobDetailCloseEl = document.getElementById("jobDetailClose");
const jobDetailApplyEl = document.getElementById("jobDetailApply");
const jobDetailBuildCvEl = document.getElementById("jobDetailBuildCv");
const jobDetailTrainEl = document.getElementById("jobDetailTrain");

let selectedJob = null;

// =======================
// JOB SCANNER CORE
// =======================
function setupJobScanner() {
  const mapEl = document.getElementById("jobMap");
  if (!mapEl || !window.google || !google.maps) {
    console.warn("Google Maps not ready or jobMap element missing.");
    return;
  }

  const defaultCenter = new google.maps.LatLng(
    cityCenters.jhb.lat,
    cityCenters.jhb.lng
  );
  const defaultRadiusKm = 5;

  jobMap = new google.maps.Map(mapEl, {
    center: defaultCenter,
    zoom: 11,
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: true,
  });

  jobCircle = new google.maps.Circle({
    strokeColor: "#22C55E",
    strokeOpacity: 0.8,
    strokeWeight: 2,
    fillColor: "#22C55E",
    fillOpacity: 0.15,
    map: jobMap,
    center: defaultCenter,
    radius: defaultRadiusKm * 1000,
  });

  const radiusSlider = document.getElementById("jobRadius");
  const radiusLabel = document.getElementById("jobRadiusLabel");
  const useLocationBtn = document.getElementById("jobUseLocation");
  const citySelect = document.getElementById("jobCity");

  if (radiusSlider && radiusLabel) {
    radiusLabel.textContent = `${radiusSlider.value} km`;

    radiusSlider.addEventListener("input", () => {
      const km = Number(radiusSlider.value);
      radiusLabel.textContent = `${km} km`;
      jobCircle.setRadius(km * 1000);
      refreshJobMarkers(jobCircle.getCenter());
    });
  }

  if (useLocationBtn && navigator.geolocation) {
    useLocationBtn.addEventListener("click", () => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const userPos = new google.maps.LatLng(
            pos.coords.latitude,
            pos.coords.longitude
          );
          jobMap.setCenter(userPos);
          jobMap.setZoom(13);
          jobCircle.setCenter(userPos);
          if (citySelect) {
            citySelect.value = "";
          }
          refreshJobMarkers(userPos);
        },
        (err) => {
          console.warn("Geolocation error:", err);
          alert("Could not get your location. Using Johannesburg instead.");
          refreshJobMarkers(defaultCenter);
        }
      );
    });
  }

  if (citySelect) {
    citySelect.addEventListener("change", () => {
      const key = citySelect.value;
      const city = cityCenters[key];
      if (!city) return;

      const centre = new google.maps.LatLng(city.lat, city.lng);
      jobMap.setCenter(centre);
      jobMap.setZoom(12);
      jobCircle.setCenter(centre);
      refreshJobMarkers(centre);
    });
  }

  // Initial pins
  refreshJobMarkers(defaultCenter);

  // Card close
  if (jobDetailCloseEl) {
    jobDetailCloseEl.addEventListener("click", () => {
      hideJobDetailCard();
    });
  }

  // Apply button
  if (jobDetailApplyEl) {
    jobDetailApplyEl.addEventListener("click", () => {
      if (!selectedJob) return;
      alert(
        `Application feature coming soon.\n\nFor now, mention this role when you apply:\n\n` +
          `${selectedJob.title} at ${selectedJob.company}`
      );
    });
  }

  // Build CV button
  if (jobDetailBuildCvEl) {
    jobDetailBuildCvEl.addEventListener("click", () => {
      if (!selectedJob) return;
      // Go to CV builder and pre-fill target role
      showSection("cv-builder");
      if (targetRoleEl) {
        targetRoleEl.value = selectedJob.title;
      }
      hideJobDetailCard();
      window.scrollTo(0, 0);
    });
  }

  // Train me button
  if (jobDetailTrainEl) {
    jobDetailTrainEl.addEventListener("click", () => {
      if (!selectedJob) return;
      // Jump to voice assistant
      showSection("voice");
      hideJobDetailCard();
      window.scrollTo(0, 0);
    });
  }

  jobScannerInitialized = true;
}

function refreshJobMarkers(centerLatLng) {
  if (!jobMap || !google.maps || !google.maps.geometry) return;

  // Clear old markers
  jobMarkers.forEach((m) => m.setMap(null));
  jobMarkers = [];

  const radiusMeters = jobCircle.getRadius();

  jobLocations.forEach((job) => {
    const position = new google.maps.LatLng(job.lat, job.lng);
    const distanceMeters =
      google.maps.geometry.spherical.computeDistanceBetween(
        centerLatLng,
        position
      );
    const inside = distanceMeters <= radiusMeters;

    const marker = new google.maps.Marker({
      position,
      map: jobMap,
      title: job.title,
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        scale: inside ? 7 : 6,
        fillColor: inside ? "#22C55E" : "#9CA3AF",
        fillOpacity: 1,
        strokeColor: "#ffffff",
        strokeWeight: 2,
      },
    });

    marker.addListener("click", () => {
      showJobDetailCard(job, distanceMeters / 1000);
    });

    jobMarkers.push(marker);
  });
}

function showJobDetailCard(job, distanceKm) {
  selectedJob = job;

  if (!jobDetailCardEl) return;

  if (jobDetailTitleEl) jobDetailTitleEl.textContent = job.title;
  if (jobDetailMetaEl) {
    const roundKm = Math.round(distanceKm * 10) / 10;
    jobDetailMetaEl.textContent = `${job.company} · approx ${roundKm} km from centre`;
  }
  if (jobDetailDescriptionEl) jobDetailDescriptionEl.textContent =
    job.description;

  if (jobDetailRequirementsEl) {
    jobDetailRequirementsEl.innerHTML = "";
    job.requirements.forEach((req) => {
      const li = document.createElement("li");
      li.textContent = req;
      jobDetailRequirementsEl.appendChild(li);
    });
  }

  jobDetailCardEl.classList.remove("hidden");
}

function hideJobDetailCard() {
  if (!jobDetailCardEl) return;
  jobDetailCardEl.classList.add("hidden");
  selectedJob = null;
}

// =======================
// GOOGLE MAPS CALLBACK
// =======================
function initJobScannerMap() {
  mapsApiLoaded = true;
  const jobSection = document.getElementById("job-scanner");
  if (
    jobSection &&
    jobSection.classList.contains("active") &&
    !jobScannerInitialized
  ) {
    setupJobScanner();
  }
}

// Make sure Google Maps can call this
window.initJobScannerMap = initJobScannerMap;

// Make sure Google Maps can find the callback
window.initJobScannerMap = initJobScannerMap;

// expose to global so Google Maps can call it
window.initJobScannerMap = initJobScannerMap;

// =======================
// SIMPLE "PAGES" / SECTION SWITCHING
// =======================
function showSection(sectionId) {
  const sections = document.querySelectorAll(".page-section");
  sections.forEach((sec) => {
    if (sec.id === sectionId) {
      sec.classList.add("active");
    } else {
      sec.classList.remove("active");
    }
  });

  const navLinks = document.querySelectorAll(".nav-links a");
  navLinks.forEach((link) => {
    if (link.dataset.section === sectionId) {
      link.classList.add("active");
    } else {
      link.classList.remove("active");
    }
  });

  // When switching to Job Scanner, initialise map if API is ready
  if (sectionId === "job-scanner") {
    if (mapsApiLoaded && !jobScannerInitialized) {
      setupJobScanner();
    }
  }

  window.scrollTo(0, 0);
}

// expose for inline onclick handlers
window.showSection = showSection;

// Hook navbar clicks
document.querySelectorAll(".nav-links a").forEach((link) => {
  link.addEventListener("click", (e) => {
    const targetSection = link.dataset.section;
    if (targetSection) {
      e.preventDefault();
      showSection(targetSection);
    }
  });
});

// =======================
// SIMPLE AUTH MODAL + PROFILE UI
// =======================
function getInitialsFromName(name) {
  if (!name) return "SS";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0]?.toUpperCase() || "S";
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function initAuthUi() {
  const authModal = document.getElementById("authModal");
  if (!authModal) return;

  // Steps
  const stepSignup = document.getElementById("modalStepSignup");
  const stepVerify = document.getElementById("modalStepVerify");
  const stepPassword = document.getElementById("modalStepPassword");
  const stepLogin = document.getElementById("modalStepLogin");

  // Signup
  const signupForm = document.getElementById("signupForm");
  const signupNameInput = document.getElementById("signupName");
  const signupEmailInput = document.getElementById("signupEmail");
  const signupPhoneInput = document.getElementById("signupPhone");      // NEW

  // Verify
  const verifyForm = document.getElementById("verifyForm");
  const verifyCodeInput = document.getElementById("verifyCode");
  const verifyEmailLabel = document.getElementById("verifyEmailLabel");
  const demoCodeValue = document.getElementById("demoCodeValue");
  const verifyError = document.getElementById("verifyError");
  const verifyBackBtn = document.getElementById("verifyBackBtn");
  const verifyPhoneLabel = document.getElementById("verifyPhoneLabel"); // NEW

  // Password
  const passwordForm = document.getElementById("passwordForm");
  const passwordInput = document.getElementById("passwordInput");
  const passwordConfirmInput = document.getElementById("passwordConfirmInput");
  const passwordError = document.getElementById("passwordError");

  // Login
  const loginForm = document.getElementById("loginForm");
  const loginEmailInput = document.getElementById("loginEmail");
  const loginPasswordInput = document.getElementById("loginPassword");
  const loginError = document.getElementById("loginError");

  // Guest buttons (signup + login)
  const guestButtons = document.querySelectorAll("#continueGuestBtn, #loginGuestBtn");

  // Profile menu + avatar
  const profileMenu = document.getElementById("profileMenu");
  const navProfile = document.getElementById("navProfile");
  const logoutBtn = document.getElementById("logoutBtn");
  const avatarEl = document.getElementById("navProfileAvatar");
  const profileNameEls = document.querySelectorAll(".profile-name-text");

    // Button to jump from signup -> login
  const gotoLoginBtn = document.getElementById("gotoLoginBtn");         // NEW

  // Helper: switch visible step
  function showStep(stepName) {
    [stepSignup, stepVerify, stepPassword, stepLogin].forEach((el) => {
      if (!el) return;
      el.classList.add("hidden");
    });

    if (stepName === "signup" && stepSignup) stepSignup.classList.remove("hidden");
    if (stepName === "verify" && stepVerify) stepVerify.classList.remove("hidden");
    if (stepName === "password" && stepPassword) stepPassword.classList.remove("hidden");
    if (stepName === "login" && stepLogin) stepLogin.classList.remove("hidden");

    authModal.classList.remove("hidden");
  }

  function applyUserToUi(name) {
    const safeName = name || "Guest user";
    profileNameEls.forEach((el) => (el.textContent = safeName));
    if (avatarEl) {
      avatarEl.textContent = getInitialsFromName(safeName);
    }
  }

  // Stored auth state
  const storedName = localStorage.getItem("spaniUserName");
  const storedEmail = localStorage.getItem("spaniUserEmail");
  const storedPassword = localStorage.getItem("spaniUserPassword");
  const loggedIn = localStorage.getItem("spaniLoggedIn") === "true";

  if (loggedIn && storedName) {
    applyUserToUi(storedName);
    authModal.classList.add("hidden");
  } else if (storedEmail && storedPassword) {
    // Returning user, must log in
    if (loginEmailInput) loginEmailInput.value = storedEmail;
    showStep("login");
  } else {
    // First-time user
    showStep("signup");
  }

  // TEMP state for current sign-up
  let pendingName = "";
  let pendingEmail = "";
  let pendingPhone = "";   // NEW
  let pendingCode = "";

  // SIGNUP -> VERIFY
    // SIGNUP -> REQUEST SMS CODE -> VERIFY
  if (signupForm) {
    signupForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const name = signupNameInput.value.trim();
      const email = signupEmailInput.value.trim();
      const phone = (signupPhoneInput?.value || "").trim();

      if (!name || !email || !phone) return;

      pendingName = name;
      pendingEmail = email;
      pendingPhone = phone;

      try {
        const res = await fetch(`${BASE_URL}/request_code`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone }),
        });

        const data = await res.json();
        if (!res.ok) {
          alert(data.error || "Could not request verification code.");
          return;
        }

        // data.code is returned when Twilio fails or for dev; otherwise it's SMS only
        pendingCode = data.code || null;

        if (verifyPhoneLabel) verifyPhoneLabel.textContent = phone;
        if (demoCodeValue) {
          demoCodeValue.textContent = pendingCode || "••••••";
        }
        if (verifyError) verifyError.style.display = "none";
        if (verifyCodeInput) verifyCodeInput.value = "";

        showStep("verify");
      } catch (err) {
        console.error("request_code failed:", err);
        alert("Could not send code. Please try again.");
      }
    });
  }

    // VERIFY -> BACKEND /verify_code -> PASSWORD
  if (verifyForm) {
    verifyForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const entered = (verifyCodeInput?.value || "").trim();
      if (!entered || !pendingPhone) return;

      try {
        const res = await fetch(`${BASE_URL}/verify_code`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone: pendingPhone, code: entered }),
        });

        const data = await res.json();

        if (!res.ok) {
          if (verifyError) verifyError.style.display = "block";
          return;
        }

        // Save profile_id + phone for later CV building
        if (data.profile_id) {
          localStorage.setItem("spaniProfileId", data.profile_id);
          localStorage.setItem("spaniUserPhone", pendingPhone);
          // also update our in-memory pointer for this session
          currentProfileId = data.profile_id;
        }

        if (passwordError) passwordError.style.display = "none";
        if (passwordInput) passwordInput.value = "";
        if (passwordConfirmInput) passwordConfirmInput.value = "";

        // For now, always go to password step (even returning users) – that's your local login layer
        showStep("password");
      } catch (err) {
        console.error("verify_code failed:", err);
        if (verifyError) verifyError.style.display = "block";
      }
    });
  }

  // VERIFY back button
  if (verifyBackBtn) {
    verifyBackBtn.addEventListener("click", () => {
      if (signupNameInput) signupNameInput.value = pendingName;
      if (signupEmailInput) signupEmailInput.value = pendingEmail;
      showStep("signup");
    });
  }

  // PASSWORD -> SAVE + LOG IN
    // PASSWORD -> SAVE + LOG IN
    if (passwordForm) {
      passwordForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const pass = (passwordInput?.value || "").trim();
        const confirm = (passwordConfirmInput?.value || "").trim();

        if (!pass || pass.length < 6 || pass !== confirm) {
          if (passwordError) passwordError.style.display = "block";
          return;
        }

        localStorage.setItem("spaniUserName", pendingName || "Guest user");
        localStorage.setItem("spaniUserEmail", pendingEmail || "");
        localStorage.setItem("spaniUserPhone", pendingPhone || "");   // NEW
        localStorage.setItem("spaniUserPassword", pass);
        localStorage.setItem("spaniLoggedIn", "true");

        applyUserToUi(pendingName);
        authModal.classList.add("hidden");
      });
    }

      // SIGNUP -> LOGIN (for users who already have an account)
  if (gotoLoginBtn) {
    gotoLoginBtn.addEventListener("click", () => {
      // Prefill login email with whatever is typed in signup
      const currentEmail = (signupEmailInput?.value || "").trim();
      if (loginEmailInput && currentEmail) {
        loginEmailInput.value = currentEmail;
      }
      showStep("login");
    });
  }

  // LOGIN existing user
  if (loginForm) {
    loginForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const email = (loginEmailInput?.value || "").trim();
      const pass = (loginPasswordInput?.value || "").trim();

      const savedEmail = localStorage.getItem("spaniUserEmail") || "";
      const savedPass = localStorage.getItem("spaniUserPassword") || "";
      const savedName = localStorage.getItem("spaniUserName") || "Guest user";

      if (email === savedEmail && pass === savedPass) {
        localStorage.setItem("spaniLoggedIn", "true");
        applyUserToUi(savedName);
        if (loginError) loginError.style.display = "none";
        authModal.classList.add("hidden");
      } else if (loginError) {
        loginError.style.display = "block";
      }
    });
  }

  // CONTINUE AS GUEST (on signup & login screens)
  guestButtons.forEach((btn) => {
    if (!btn) return;
    btn.addEventListener("click", () => {
      const guestName = "Guest user";
      localStorage.setItem("spaniLoggedIn", "true");
      localStorage.setItem("spaniUserName", guestName);
      localStorage.removeItem("spaniUserPassword");
      applyUserToUi(guestName);
      authModal.classList.add("hidden");
    });
  });

  // Profile menu toggle (same behaviour as before)
  if (navProfile && profileMenu) {
    navProfile.addEventListener("click", (e) => {
      e.stopPropagation();
      profileMenu.classList.toggle("open");
    });

    document.addEventListener("click", () => {
      profileMenu.classList.remove("open");
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      localStorage.removeItem("spaniLoggedIn");
      localStorage.removeItem("spaniUserName");
      localStorage.removeItem("spaniUserEmail");
      localStorage.removeItem("spaniUserPassword");
      location.reload();
    });
  }
}

// Initial page & component setup
showSection("hero");
setupVoiceAssistant();
initHeroTestimonials();
initAuthUi();