import urllib.request
from urllib.parse import urlencode
from html.parser import HTMLParser

class MyParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.text = []
    def handle_data(self, data):
        data = data.strip()
        if data:
            self.text.append(data)

query = "Israel airspace Ben Gurion airport status today"
url = 'https://lite.duckduckgo.com/lite/'
data = urlencode({'q': query}).encode('utf-8')
headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
req = urllib.request.Request(url, data=data, headers=headers)

try:
    html = urllib.request.urlopen(req).read().decode('utf-8')
    parser = MyParser()
    parser.feed(html)
    for i, t in enumerate(parser.text):
        if "Ben" in t or "Israel" in t or "air" in t.lower() or "flight" in t.lower():
            print(t)
except Exception as e:
    print("Error:", e)
