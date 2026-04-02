import urllib.request
from urllib.parse import urlencode
import re

query = "Israel airspace status Ben Gurion TLV open closed flights today"
url = 'https://lite.duckduckgo.com/lite/'
data = urlencode({'q': query}).encode('utf-8')
headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
req = urllib.request.Request(url, data=data, headers=headers)

try:
    html = urllib.request.urlopen(req).read().decode('utf-8')
    snippets = re.findall(r'<td class="result-snippet">(.+?)</td>', html, re.IGNORECASE | re.DOTALL)
    for s in snippets[:6]:
        clean = re.sub(r'<[^>]+>', '', s).strip()
        print("-", clean)
except Exception as e:
    print("Error:", e)
