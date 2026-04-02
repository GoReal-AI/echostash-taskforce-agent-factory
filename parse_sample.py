import json

with open('tlv_board_full.json', 'r') as f:
    data = json.load(f)

records = data.get('result', {}).get('records', [])
if records:
    print(json.dumps(records[0], indent=2))
