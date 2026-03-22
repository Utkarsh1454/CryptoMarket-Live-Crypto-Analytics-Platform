import urllib.request
import json
import sys

url = "https://api.openai.com/v1/chat/completions"
headers = {
    "Content-Type": "application/json",
    "Authorization": "Bearer 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"
}
data = {
    "model": "gpt-4o-mini",
    "messages": [{"role": "user", "content": "What are the REST API endpoints and JSON response formats for fetching stock quotes and historical timeseries from the 'massive.com' stock API? Please provide the exact base URL and endpoints. If massive.com is not a known stock API provider, please tell me what other APIs use the key format 'fKmO7seK9_QG72A9t4UHW1HZzKdbxBJq' (32 alphanumeric chars with underscores) and might be confused with it."}]
}

req = urllib.request.Request(url, data=json.dumps(data).encode("utf-8"), headers=headers)
try:
    with urllib.request.urlopen(req) as response:
        result = json.loads(response.read().decode())
        print(result['choices'][0]['message']['content'])
except Exception as e:
    print(f"Error checking API: {e}")
