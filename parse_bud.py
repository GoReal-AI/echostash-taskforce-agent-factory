import json
from datetime import datetime

with open('bud_flights.json', 'r') as f:
    data = f.read()

j = json.loads(data)

arrivals = j.get('result', {}).get('response', {}).get('airport', {}).get('pluginData', {}).get('schedule', {}).get('arrivals', {}).get('data', [])

print("| Airline | Departure (TLV) | Arrival (BUD) | Duration |")
print("|---|---|---|---|")
found = 0
for day in arrivals:
    flights = day.get('flight', {}).get('data', [])
    for flight in flights:
        f = flight.get('flight', {})
        origin_airport = f.get('airport', {}).get('origin', {})
        if origin_airport and origin_airport.get('code', {}).get('iata') == 'TLV':
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

