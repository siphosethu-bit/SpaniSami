from flask import Flask, request, jsonify
from openai import OpenAI
from dotenv import load_dotenv
import os
import uuid

# 1) Load env + OpenAI client
load_dotenv()
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

app = Flask(__name__)

# In-memory store for hackathon demo
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
    """
    Simple check that:
    - Flask is running
    - OpenAI key works
    """

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
    """
    Frontend sends:
    {
      "raw_text": "I help at my uncle's spaza on weekends...",
      "preferred_language": "en"  # optional
    }

    Backend:
    - Calls OpenAI
    - Returns structured profile + profile_id
    """

    data = request.get_json(force=True) or {}
    raw_text = data.get("raw_text", "").strip()
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
        response = client.responses.create(
            model="gpt-5.1",
            input=prompt,
        )

        # The model will output JSON text. We just return it as-is.
        # If you want, you could json.loads() it and validate.
        profile_json_text = response.output_text

        # For hackathon simplicity, store as raw text and also return it
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
# 2) GENERATE CV – FROM PROFILE TO CV TEXT
# ---------------------------------------------------
@app.route("/generate_cv", methods=["POST"])
def generate_cv():
    """
    Two ways to call this:

    A) Send profile JSON directly:
       { "profile": { ... } }

    B) Send profile_id (previously returned by /build_profile):
       { "profile_id": "uuid-here" }
    """

    data = request.get_json(force=True) or {}

    profile = data.get("profile")
    profile_id = data.get("profile_id")

    if profile is None and profile_id is None:
        return jsonify({"error": "Send either 'profile' or 'profile_id'"}), 400

    # If only profile_id is given, load stored profile text
    if profile is None and profile_id:
        stored = profiles.get(profile_id)
        if not stored:
            return jsonify({"error": "profile_id not found"}), 404
        profile_text = stored
    else:
        # profile was sent directly (Python dict); convert to text for prompt
        profile_text = str(profile)

    prompt = f"""
You are a helpful assistant generating a clean, simple CV for a South African youth.

Use the following profile data:

PROFILE:
{profile_text}

Create a CV with clearly separated sections:
- Personal Details (name, location – keep it simple, no full address)
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
# SIMPLE STATS ENDPOINT (OPTIONAL – FOR DEMO)
# ---------------------------------------------------
@app.route("/stats", methods=["GET"])
def get_stats():
    """
    Small endpoint to show judges:
    how many profiles / CVs we generated.
    """
    return jsonify({
        "profiles_created": stats["profiles_created"],
        "cvs_generated": stats["cvs_generated"],
        "profiles_in_memory": len(profiles)
    })


if __name__ == "__main__":
    # For local dev only
    app.run(debug=True)
