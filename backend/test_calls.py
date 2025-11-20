import requests

BASE_URL = "http://127.0.0.1:5000"

# 1) Call /build_profile
profile_payload = {
    "raw_text": "I help at my uncle's spaza shop on weekends, braid hair for people in the community, and I tutor maths for grade 10s.",
    "preferred_language": "en"
}

resp = requests.post(f"{BASE_URL}/build_profile", json=profile_payload)
print("BUILD_PROFILE STATUS:", resp.status_code)
print("BUILD_PROFILE RESPONSE:", resp.json())

data = resp.json()
profile_id = data.get("profile_id")

# 2) Call /generate_cv using profile_id
cv_payload = {
    "profile_id": profile_id
}

resp2 = requests.post(f"{BASE_URL}/generate_cv", json=cv_payload)
print("\nGENERATE_CV STATUS:", resp2.status_code)
print("GENERATE_CV RESPONSE:", resp2.json())
