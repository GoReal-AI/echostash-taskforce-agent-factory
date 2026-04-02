import urllib.request
import urllib.parse
import re

query = urllib.parse.quote_plus("echostash app competitors")
url = f"https://html.duckduckgo.com/html/?q={query}"
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
try:
    html = urllib.request.urlopen(req).read().decode('utf-8')
    snippets = re.findall(r'<a class="result__snippet[^>]*>(.*?)</a>', html, re.IGNORECASE | re.DOTALL)
    for s in snippets:
        print(re.sub(r'<[^>]+>', '', s).strip())
except Exception as e:
    print(e)
