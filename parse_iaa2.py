import json

with open('tlv_board.json', 'r') as f:
    data = json.load(f)

records = data.get('result', {}).get('records', [])

print("| Airline | Flight | Departure (TLV) | Arrival (BUD) | Duration | Status |")
print("|---|---|---|---|---|---|")

found = 0
for r in records:
    iata = r.get('CHLOC1D', '')
    city = r.get('CHLOC1T', '').upper()
    flight_type = r.get('CHKIK', '') # 'D' for departure, 'A' for arrival
    
    if (iata == 'BUD' or 'BUDAPEST' in city) and flight_type == 'D':
        found += 1
        airline = r.get('CHOPERD', '') # Airline name
        flight_num = r.get('CHOPER', '') + r.get('CHFLTN', '') # Airline code + flight number
        scheduled_time = r.get('CHSTOL', '') # Scheduled time
        status = r.get('CHRMINE', '') # Status in English
        
        print(f"| {airline} | {flight_num} | {scheduled_time} | N/A | ~3h 15m | {status} |")

if found == 0:
    print("No direct flights to BUD found in the current TLV flight board.")
