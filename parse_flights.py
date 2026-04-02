import json
from datetime import datetime

with open('tlv_flights.json', 'r') as f:
    data = f.read()

j = json.loads(data)

departures = j.get('result', {}).get('response', {}).get('airport', {}).get('pluginData', {}).get('schedule', {}).get('departures', {}).get('data', [])

print("| Airline | Departure (TLV) | Arrival (BUD) | Duration |")
print("|---|---|---|---|")
found = 0
for day in departures:
    flights = day.get('flight', {}).get('data', [])
    for flight in flights:
        f = flight.get('flight', {})
        dest_airport = f.get('airport', {}).get('destination', {})
        if dest_airport and dest_airport.get('code', {}).get('iata') == 'BUD':
            found += 1
            airline = f.get('airline', {}).get('name', 'Unknown')
            dep_time = f.get('time', {}).get('scheduled', {}).get('departure')
            arr_time = f.get('time', {}).get('scheduled', {}).get('arrival')
            
            dep_str = datetime.fromtimestamp(dep_time).strftime('%Y-%m-%d %H:%M') if dep_time else "N/A"
            arr_str = datetime.fromtimestamp(arr_time).strftime('%Y-%m-%d %H:%M') if arr_time else "N/A"
            
            dur = "N/A"
            if dep_time and arr_time:
                mins = (arr_time - dep_time) // 60
                dur = f"{mins // 60}h {mins % 60}m"
                
            print(f"| {airline} | {dep_str} | {arr_str} | {dur} |")

if found == 0:
    print("No flights to BUD found in the schedule.")
