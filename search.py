import urllib.request
import urllib.parse
from html.parser import HTMLParser

class DDGParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.in_result = False
        self.in_title = False
        self.in_snippet = False
        self.results = []
        self.current_title = ""
        self.current_snippet = ""
        self.current_href = ""

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'a' and 'class' in attrs and 'result__url' in attrs.get('class', ''):
            self.current_href = attrs.get('href', '')
        if tag == 'h2' and 'class' in attrs and 'result__title' in attrs.get('class', ''):
            self.in_title = True
        if tag == 'a' and 'class' in attrs and 'result__snippet' in attrs.get('class', ''):
            self.in_snippet = True

    def handle_data(self, data):
        if self.in_title:
            self.current_title += data
        if self.in_snippet:
            self.current_snippet += data

    def handle_endtag(self, tag):
        if tag == 'h2' and self.in_title:
            self.in_title = False
        if tag == 'a' and self.in_snippet:
            self.in_snippet = False
            if self.current_title or self.current_snippet:
                self.results.append({
                    'title': self.current_title.strip(),
                    'snippet': self.current_snippet.strip(),
                    'url': self.current_href
                })
            self.current_title = ""
            self.current_snippet = ""
            self.current_href = ""

def search(query):
    url = 'https://html.duckduckgo.com/html/?q=' + urllib.parse.quote(query)
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'})
    try:
        html = urllib.request.urlopen(req).read().decode('utf-8')
        parser = DDGParser()
        parser.feed(html)
        for r in parser.results:
            print(f"TITLE: {r['title']}\nSNIPPET: {r['snippet']}\nURL: {r['url']}\n")
    except Exception as e:
        print('Error:', e)

search('echostash.app')
