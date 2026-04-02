import json
import os

if not os.path.exists('tlv_board_full.json'):
    print("File not found.")
    exit(1)

with open('tlv_board_full.json', 'r') as f:
    data = json.load(f)

records = data.get('result', {}).get('records', [])

print("### Flights from TLV to BUD (Today's Ben Gurion Airport Schedule)\n")
print("| Airline | Flight | Scheduled Departure (TLV) | Arrival (BUD) | Duration | Status |")
print("|---|---|---|---|---|---|")

found = 0
for r in records:
    iata = r.get('CHLOC1', '') 
    iata_code = r.get('CHLOC1D', '')
    city = r.get('CHLOC1T', '').upper()
    flight_type = r.get('CHKIK', '') # 'D' for departure
    
    if ('BUD' in [iata_code, iata] or 'BUDAPEST' in city) and flight_type == 'D':
        found += 1
        airline = r.get('CHOPERD', '') 
        flight_num = r.get('CHOPER', '') + r.get('CHFLTN', '') 
        scheduled_time = r.get('CHSTOL', '') 
        status = r.get('CHRMINE', '') 
        
        print(f"| {airline} | {flight_num} | {scheduled_time} | N/A | ~3h 15m | {status} |")

if found == 0:
    print("| - | - | No direct flights found today | - | - | - |")

