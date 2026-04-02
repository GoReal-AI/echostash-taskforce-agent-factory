import urllib.request
from urllib.parse import urlencode
import re

query = "Israel airspace status Ben Gurion TLV open closed today"
url = 'https://lite.duckduckgo.com/lite/'
data = urlencode({'q': query}).encode('utf-8')
headers = {'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:109.0) Gecko/20100101 Firefox/111.0'}
req = urllib.request.Request(url, data=data, headers=headers)

try:
    html = urllib.request.urlopen(req).read().decode('utf-8')
    # Simple regex to extract result snippets
    snippets = re.findall(r'<td class="result-snippet">(.+?)</td>', html, re.IGNORECASE | re.DOTALL)
    for s in snippets[:5]:
        clean = re.sub(r'<[^>]+>', '', s).strip()
        print("-", clean)
except Exception as e:
    print("Error:", e)
