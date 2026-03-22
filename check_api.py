import urllib.request
import json
import os

url = "https://api.openai.com/v1/chat/completions"
openai_key = os.environ.get("OPENAI_API_KEY")

if not openai_key:
    raise ValueError("Missing OPENAI_API_KEY environment variable")

headers = {
    "Content-Type": "application/json",
    "Authorization": f"Bearer {openai_key}"
}

data = {
    "model": "gpt-4o-mini",
    "messages": [
        {
            "role": "user",
            "content": (
                "What are the REST API endpoints and JSON response formats for fetching stock quotes "
                "and historical timeseries from the 'massive.com' stock API? Please provide the exact "
                "base URL and endpoints. If massive.com is not a known stock API provider, please tell "
                "me what other APIs use a similar key format (32-character alphanumeric strings with "
                "underscores) and might be confused with it."
            )
        }
    ]
}

req = urllib.request.Request(
    url,
    data=json.dumps(data).encode("utf-8"),
    headers=headers
)

try:
    with urllib.request.urlopen(req) as response:
        result = json.loads(response.read().decode())
        print(result['choices'][0]['message']['content'])
except Exception as e:
    print(f"Error checking API: {e}")
