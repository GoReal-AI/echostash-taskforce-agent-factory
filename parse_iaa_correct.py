import json

with open('tlv_board_full.json', 'r') as f:
    data = json.load(f)

records = data.get('result', {}).get('records', [])

print("### Upcoming Flights from TLV to BUD (Ben Gurion Airport Schedule)\n")
print("| Airline | Flight | Scheduled Departure (TLV) | Arrival (BUD) | Duration | Status |")
print("|---|---|---|---|---|---|")

found = 0
for r in records:
    iata = r.get('CHLOC1', '') 
    city_name = r.get('CHLOC1D', '')
    flight_type = r.get('CHAORD', '') # 'D' for departure
    
    if ('BUD' in [iata, city_name] or 'BUDAPEST' in city_name.upper()) and flight_type == 'D':
        found += 1
        airline = r.get('CHOPERD', '') 
        flight_num = r.get('CHOPER', '') + r.get('CHFLTN', '') 
        # Format the scheduled time (e.g. 2026-04-01T23:40:00 -> 2026-04-01 23:40)
        scheduled_time = r.get('CHSTOL', '').replace('T', ' ')
        status = r.get('CHRMINE', '') 
        
        print(f"| {airline} | {flight_num} | {scheduled_time} | N/A | ~3h 15m | {status} |")

if found == 0:
    print("| - | - | No direct flights to Budapest found in the current schedule | - | - | - |")

