import csv
import requests
import time

input_file = "data.csv"
output_file = "data_with_address.csv"

address_columns = [
    "suburb", "borough", "city_district", "city", "state",
    "postcode", "country", "country_code"
]

with open(input_file, newline='', encoding="utf-8") as f_in, \
     open(output_file, "w", newline='', encoding="utf-8") as f_out:
    
    reader = list(csv.DictReader(f_in))   # načteme celé CSV do listu, ať známe délku
    total = len(reader)

    fieldnames = reader[0].keys() | set(address_columns) | {"display_name"}
    writer = csv.DictWriter(f_out, fieldnames=fieldnames)
    writer.writeheader()

    start_time = time.time()

    for i, row in enumerate(reader, start=1):
        lat, lon = row["lat"], row["lng"]
        url = f"https://nominatim.openstreetmap.org/reverse?lat={lat}&lon={lon}&format=json&addressdetails=1"
        try:
            resp = requests.get(url, headers={"User-Agent": "my-reverse-geocoder"})
            if resp.status_code == 200:
                data = resp.json()
                row["display_name"] = data.get("display_name", "")
                address = data.get("address", {})
                for col in address_columns:
                    row[col] = address.get(col, "")
            else:
                row["display_name"] = ""
        except Exception as e:
            print(f"Chyba pro řádek {i}: {e}")
            row["display_name"] = ""
        writer.writerow(row)

        # výpočet progresu a odhadu času
        elapsed = time.time() - start_time
        avg_per_item = elapsed / i
        remaining = (total - i) * avg_per_item
        percent = (i / total) * 100

        # výpis progresu a adresy
        print(f"[{i}/{total}] {percent:.1f}% hotovo | "
              f"zbývá cca {int(remaining//60)} min {int(remaining%60)} s | "
              f"adresa: {row.get('display_name','')}")

        time.sleep(1)  # limit 1 req/s

print(f"\n✅ Hotovo! Nový CSV: {output_file}")