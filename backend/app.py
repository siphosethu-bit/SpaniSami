from flask import Flask, request, jsonify
from flask_cors import CORS
from openai import OpenAI
from dotenv import load_dotenv
import os
import uuid

# ---------------------------------------------------
# LOAD ENV + OPENAI CLIENT
# ---------------------------------------------------
load_dotenv()
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

app = Flask(__name__)
CORS(app)   # <-- allows your frontend to call your backend

# In-memory storage for demo
profiles = {}  # {profile_id: profile_json}
stats = {
    "profiles_created": 0,
    "cvs_generated": 0,
}


# ---------------------------------------------------
# HEALTH CHECK / DEMO ROUTE
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
    """Creates an AI-generated structured profile from the user's raw informal text."""

    data = request.get_json(force=True) or {}
    raw_text = data.get("raw_text", "").strip()
    preferred_language = data.get("preferred_language", "en")

    if not raw_text:
        return jsonify({"error": "raw_text is required"}), 400

    prompt = f"""
You are helping a South African youth write a job-ready profile.

The youth wrote the following (informal, mixed language):

\"\"\"{raw_text}\"\"\"

1. Read what they wrote.
2. Extract:
   - name (if mentioned, else null)
   - location (if mentioned, else null)
   - education (best guess or 'Unknown')
   - key skills (list)
   - informal experience (list, convert to professional wording)
   - languages (list)
3. Return ONLY valid JSON in the exact format:

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
  "summary": "Short friendly summary for a CV..."
}}

Respond in {preferred_language}.
"""

    try:
        response = client.responses.create(
            model="gpt-5.1",
            input=prompt,
        )

        profile_json_text = response.output_text

        # Store for demo
        profile_id = str(uuid.uuid4())
        profiles[profile_id] = profile_json_text
        stats["profiles_created"] += 1

        return jsonify({
            "profile_id": profile_id,
            "profile": profile_json_text
        })

    except Exception as e:
        return jsonify({"error": "Failed to build profile", "details": str(e)}), 500


# ---------------------------------------------------
# 2) GENERATE CV – FROM PROFILE TO CLEAN CV TEXT
# ---------------------------------------------------
@app.route("/generate_cv", methods=["POST"])
def generate_cv():
    """Generate a CV from either profile JSON or a profile_id."""
    
    data = request.get_json(force=True) or {}

    profile = data.get("profile")
    profile_id = data.get("profile_id")

    if profile is None and profile_id is None:
        return jsonify({"error": "Send either 'profile' or 'profile_id'"}), 400

    if profile is None and profile_id:
        stored = profiles.get(profile_id)
        if not stored:
            return jsonify({"error": "profile_id not found"}), 404
        profile_text = stored
    else:
        profile_text = str(profile)

    prompt = f"""
You are a helpful assistant generating a clean, simple CV for a South African youth.

Use the following profile:

PROFILE:
{profile_text}

Create a CV with these sections:
- Personal Details
- Summary
- Education
- Work Experience / Informal Experience
- Skills
- Languages

Write in simple English, suitable for SA entry-level jobs.
Do NOT return JSON — only the CV text.
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
# 3) SIMPLE STATS ENDPOINT
# ---------------------------------------------------
@app.route("/stats", methods=["GET"])
def get_stats():
    return jsonify({
        "profiles_created": stats["profiles_created"],
        "cvs_generated": stats["cvs_generated"],
        "profiles_in_memory": len(profiles)
    })


# ---------------------------------------------------
# RUN APP LOCALLY
# ---------------------------------------------------
if __name__ == "__main__":
    app.run(debug=True)
