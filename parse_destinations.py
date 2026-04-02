import json

with open('tlv_board_full.json', 'r') as f:
    data = json.load(f)

records = data.get('result', {}).get('records', [])

destinations = set()
for r in records:
    if r.get('CHKIK', '') == 'D':
        destinations.add(r.get('CHLOC1T', ''))

print(sorted(list(destinations)))
