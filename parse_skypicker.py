import json
from datetime import datetime

try:
    with open('skypicker.json', 'r') as f:
        data = json.load(f)

    flights = data.get('data', [])
    print("| Airline | Departure (TLV) | Arrival (BUD) | Duration |")
    print("|---|---|---|---|")
    for flight in flights:
        if len(flight.get('route', [])) > 1:
            # We want direct flights or at least to show it properly
            continue
            
        airline = flight.get('airlines', ['Unknown'])[0]
        dep_time = flight.get('dTime')
        arr_time = flight.get('aTime')
        
        dep_str = datetime.fromtimestamp(dep_time).strftime('%Y-%m-%d %H:%M') if dep_time else "N/A"
        arr_str = datetime.fromtimestamp(arr_time).strftime('%Y-%m-%d %H:%M') if arr_time else "N/A"
        
        dur = "N/A"
        fly_duration = flight.get('fly_duration', "N/A")
            
        print(f"| {airline} | {dep_str} | {arr_str} | {fly_duration} |")
except Exception as e:
    print(f"Error: {e}")
