from flask import Flask, request, jsonify
from flask_cors import CORS
from openai import OpenAI
from dotenv import load_dotenv
import os
import uuid
import json
from datetime import datetime, timezone
from twilio.rest import Client
import random
# database helpers
from database.database import db  # we only need db for login codes now

# ---------------------------------------------------
# LOAD ENV + OPENAI CLIENT
# ---------------------------------------------------
load_dotenv()
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
# Twilio setup for SMS codes
TWILIO_SID = os.getenv("TWILIO_SID")
TWILIO_TOKEN = os.getenv("TWILIO_TOKEN")
TWILIO_FROM = os.getenv("TWILIO_FROM")

twilio_client = None
if TWILIO_SID and TWILIO_TOKEN and TWILIO_FROM:
    twilio_client = Client(TWILIO_SID, TWILIO_TOKEN)

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}}, supports_credentials=True)

# In-memory store for demo
profiles = {}  # {profile_id: profile_json_text}
stats = {
    "profiles_created": 0,
    "cvs_generated": 0,
}

# Conversation history for voice/chat mode
conversations = {}  # {session_id: [ {"role": "user"/"assistant", "content": "..."}, ... ]}


# ---------------------------------------------------
# TEST ROUTE
# ---------------------------------------------------
@app.route("/test", methods=["GET"])
def test_api():
    """Check Flask + OpenAI are working."""
    try:
        response = client.responses.create(
            model="gpt-5.1",
            input="Say hello to the Kion Consulting Hackathon in one friendly sentence.",
        )
        return jsonify({"message": response.output_text})
    except Exception as e:
        return jsonify({"error": "OpenAI test failed", "details": str(e)}), 500


# ---------------------------------------------------
# 1) BUILD PROFILE – FROM RAW TEXT TO STRUCTURED PROFILE
# ---------------------------------------------------
@app.route("/build_profile", methods=["POST"])
def build_profile():
    data = request.get_json(force=True) or {}
    raw_text = (data.get("raw_text") or "").strip()
    preferred_language = data.get("preferred_language", "en")

    if not raw_text:
        return jsonify({"error": "raw_text is required"}), 400

    prompt = f"""
You are helping a South African youth write a job-ready profile.

The youth wrote the following about themselves (informal, mixed language):

\"\"\"{raw_text}\"\"\"

1. Read what they wrote.
2. Extract:
   - name (if mentioned, else null)
   - location (if mentioned, else null)
   - education (best guess or 'Unknown')
   - key skills (list)
   - informal experience (list, convert to professional wording)
   - languages (list, if mentioned or easily inferred)
3. Return ONLY valid JSON in this format:

{{
  "name": "...",
  "location": "...",
  "education": "...",
  "skills": ["..."],
  "experience": [
    {{
      "role": "...",
      "description": "..."
    }}
  ],
  "languages": ["English"],
  "summary": "Short friendly summary for a CV, suitable for South African employers."
}}

Respond in {preferred_language}.
"""

    try:
        completion = client.chat.completions.create(
            model="gpt-4.1-mini",
            messages=[
                {"role": "system", "content": "You are a helpful assistant that outputs strict JSON."},
                {"role": "user", "content": prompt},
            ],
        )
        profile_json_text = completion.choices[0].message.content.strip()

        profile_id = str(uuid.uuid4())
        profiles[profile_id] = profile_json_text
        stats["profiles_created"] += 1

        return jsonify({"profile_id": profile_id, "profile": profile_json_text})

    except Exception as e:
        return jsonify({"error": "Failed to build profile", "details": str(e)}), 500


# ---------------------------------------------------
# 2) GENERATE CV – FROM PROFILE TO CV TEXT
# ---------------------------------------------------
@app.route("/generate_cv", methods=["POST"])
def generate_cv():
    """
    Frontend sends:
    {
      "profile_id": "...",          # preferred
      "profile": { ... } or "...",  # optional
      "target_role": "cashier"      # optional
    }
    """
    data = request.get_json(force=True) or {}

    profile = data.get("profile")
    profile_id = data.get("profile_id")
    target_role = data.get("target_role")

    if profile is None and profile_id is None:
        return jsonify({"error": "Send either 'profile' or 'profile_id'"}), 400

    # If only profile_id is given, load stored profile text
    if profile is None and profile_id:
        stored = profiles.get(profile_id)
        if not stored:
            return jsonify({"error": "profile_id not found"}), 404
        profile_text = stored
    else:
        # profile may be dict or already a JSON string
        if isinstance(profile, str):
            profile_text = profile
        else:
            profile_text = json.dumps(profile, indent=2)

    role_line = f"This CV should be tailored towards a job as '{target_role}'.\n" if target_role else ""

    prompt = f"""
You are a helpful assistant generating a clean, simple CV for a South African youth.

Use the following profile data:

PROFILE:
{profile_text}

{role_line}
Create a CV with clearly separated sections:
- Personal Details (name, location – keep it simple, no ID numbers)
- Summary (2–3 lines, friendly and positive)
- Education
- Work Experience OR Informal Experience (use professional wording)
- Skills (bullet list)
- Languages

Write it in clear, simple English, suitable for South African entry-level jobs.
No JSON, just the CV text.
"""

    try:
        response = client.responses.create(
            model="gpt-5.1",
            input=prompt,
        )

        cv_text = response.output_text
        stats["cvs_generated"] += 1

        return jsonify({"cv": cv_text})

    except Exception as e:
        return jsonify({"error": "Failed to generate CV", "details": str(e)}), 500


# ---------------------------------------------------
# SIMPLE STATS ENDPOINT
# ---------------------------------------------------
@app.route("/stats", methods=["GET"])
def get_stats():
    return jsonify({
        "profiles_created": stats["profiles_created"],
        "cvs_generated": stats["cvs_generated"],
        "profiles_in_memory": len(profiles),
    })


# ---------------------------------------------------
# 3) CHAT – TALK TO SPANISAMI (CV builder or interview mode)
# ---------------------------------------------------
@app.route("/chat", methods=["POST"])
def chat():
    data = request.get_json(force=True) or {}
    user_message = (data.get("message") or "").strip()
    language = data.get("language", "en")
    mode = data.get("mode", "cv")
    session_id = data.get("session_id") or str(uuid.uuid4())

    if not user_message:
        return jsonify({"error": "message is required"}), 400

    history = conversations.setdefault(session_id, [])
    history.append({"role": "user", "content": user_message})

    system_prompt = f"""
You are SpaniSami, a friendly South African AI assistant.

Language code: {language}.
- Always reply mainly in this South African language.
- It is OK to mix simple English with that language if it makes things clearer.
- Keep sentences short and youth-friendly.

Mode: {mode}

If mode is "cv":
  - Your job is to ask the user questions so that you can build a strong CV.
  - Ask ONE clear question at a time.
  - Ask about:
      * full name
      * where they live (town / area)
      * education (highest grade, school/college, any courses)
      * side hustles, informal jobs, spaza/church/community work
      * responsibilities at home (looking after siblings, cooking, etc.)
      * computer or phone skills
      * languages they can speak
  - When the user answers, briefly acknowledge (1 short sentence), then ask the next question.
  - When you have enough information, say something like:
      "I think I have enough information to build your CV. If you say 'Create my CV',
       I will send all your answers to the CV builder."

If mode is "interview":
  - Act like a realistic interviewer for entry-level jobs in South Africa.
  - Ask one interview question at a time.
  - After the user answers, give short, kind feedback and one suggestion to improve,
    then ask the next question.
  - Examples of topics: "Tell me about yourself", strengths and weaknesses,
    dealing with difficult customers, working in a team, etc.

Do NOT print any JSON. Only normal chat replies.
""".strip()

    messages = [{"role": "system", "content": system_prompt}] + history

    try:
        completion = client.chat.completions.create(
            model="gpt-4.1-mini",
            messages=messages,
        )
        assistant_text = completion.choices[0].message.content.strip()
        history.append({"role": "assistant", "content": assistant_text})

        return jsonify({"session_id": session_id, "reply": assistant_text})

    except Exception as e:
        return jsonify({"error": "Failed to chat", "details": str(e)}), 500

# =======================
# PHONE LOGIN: REQUEST CODE
# =======================
@app.route("/request_code", methods=["POST"])
def request_code():
    data = request.get_json(force=True) or {}
    phone = (data.get("phone") or "").strip()

    if not phone:
        return jsonify({"error": "Phone number required"}), 400

    # Normalise SA numbers
    if phone.startswith("0"):
        phone = "+27" + phone[1:]
    elif phone.startswith("27"):
        phone = "+" + phone
    elif not phone.startswith("+"):
        phone = "+27" + phone.lstrip("0")

    code = "".join(str(random.randint(0, 9)) for _ in range(6))
    expiry = datetime.now(timezone.utc).timestamp() + 300  # 5 minutes

    db.reference(f"login_codes/{phone}").set({
        "code": code,
        "expires_at": expiry,
    })

    # Try real SMS if Twilio configured, else always fall back with code in JSON
    if twilio_client:
        try:
            message = twilio_client.messages.create(
                body=f"Your SpaniSami verification code: {code}\nValid for 5 minutes only 🇿🇦",
                from_=TWILIO_FROM,
                to=phone,
            )
            app.logger.info(f"Twilio SMS sent → SID: {message.sid}")
            # For dev/demo we ALSO return the code so you can show it in the UI
            return jsonify({"message": "Code sent to your phone!", "code": code})
        except Exception as e:
            app.logger.warning(f"Twilio failed: {e}")

    # Fallback: just return the code in JSON (works with no Twilio config)
    return jsonify({"message": "Code ready!", "code": code})


# =======================
# PHONE LOGIN: VERIFY CODE
# =======================
@app.route("/verify_code", methods=["POST"])
def verify_code():
    data = request.get_json(force=True) or {}
    phone = (data.get("phone") or "").strip()
    code = (data.get("code") or "").strip()

    if not phone or not code:
        return jsonify({"error": "phone and code are required"}), 400

    # Normalise again
    if phone.startswith("0"):
        phone = "+27" + phone[1:]
    elif phone.startswith("27"):
        phone = "+" + phone
    elif not phone.startswith("+"):
        phone = "+27" + phone.lstrip("0")

    entry = db.reference(f"login_codes/{phone}").get()
    now_ts = datetime.now(timezone.utc).timestamp()

    if not entry or entry.get("code") != code or now_ts > float(entry.get("expires_at", 0)):
        return jsonify({"error": "Invalid or expired code"}), 400

    # Delete code immediately so it can't be reused
    db.reference(f"login_codes/{phone}").delete()

    # Look up existing phone record
    phone_doc = db.reference(f"phone_numbers/{phone}").get()

    if phone_doc:
        profile_id = phone_doc.get("profile_id")
        # Update last_login
        db.reference(f"phone_numbers/{phone}").update({
            "last_login": datetime.now(timezone.utc).isoformat()
        })
        return jsonify({
            "new_user": False,
            "profile_id": profile_id,
            "message": f"Welcome back {phone_doc.get('name', 'Champion')}!"
        })

    else:
        # New user: create empty record (we'll fill in profile later)
        # Use phone itself as profile_id for now, or you can create a uuid here
        profile_id = str(uuid.uuid4())
        db.reference(f"phone_numbers/{phone}").set({
            "profile_id": profile_id,
            "name": None,
            "email": None,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "last_login": datetime.now(timezone.utc).isoformat(),
        })

        return jsonify({
            "new_user": True,
            "profile_id": profile_id,
            "message": "Welcome! Let's build your CV step by step 🇿🇦"
        })

if __name__ == "__main__":
    app.run(debug=True)