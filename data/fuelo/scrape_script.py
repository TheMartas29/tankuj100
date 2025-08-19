#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import sys
import json
import csv
import time
import requests
import warnings
from requests.packages.urllib3.exceptions import InsecureRequestWarning

# potlačí hlášky o neověřeném HTTPS
warnings.simplefilter("ignore", InsecureRequestWarning)

# === Nastavení ===
FUELO_API_KEY = "866b963a3818f7b"
BASE_URL = "https://fuelo.net/api/gasstation"
USER_AGENT = "my-fuelo-scraper/1.0"

input_file = sys.argv[1] if len(sys.argv) >= 2 else "benzinky_98plus.json"
output_file = sys.argv[2] if len(sys.argv) >= 3 else "benzinky_98plus_details_export.csv"

# Načti JSON se seznamem stanic
with open(input_file, encoding="utf-8") as f:
    doc = json.load(f)
stations = doc.get("gasstations", [])
total = len(stations)
print(f"Nalezeno stanic: {total}")

# pevné pořadí sloupců v CSV
fieldnames = [
    "id", "lat", "lon",
    "brand_name", "brand_id", "name", "city", "address", "zip", "phone",
    "worktime", "services", "payments",
    "foursquare_id", "wikimapia_id",
    "status", "error"
]

# Otevři CSV pro výstup
with open(output_file, "w", encoding="utf-8", newline="") as f_out:
    writer = csv.DictWriter(f_out, fieldnames=fieldnames, extrasaction="ignore")
    writer.writeheader()

    start_time = time.time()

    for i, st in enumerate(stations, start=1):
        station_id = st.get("id")
        row = {"id": station_id}

        if not station_id:
            row["status"] = "ERROR"
            row["error"] = "missing_id"
        else:
            url = f"{BASE_URL}?key={FUELO_API_KEY}&id={station_id}"
            try:
                resp = requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=10, verify=False)
                if resp.status_code == 200:
                    data = resp.json()
                    row.update(data)
                else:
                    row["status"] = "ERROR"
                    row["error"] = f"HTTP {resp.status_code}"
            except Exception as e:
                row["status"] = "ERROR"
                row["error"] = str(e)

        writer.writerow(row)
        f_out.flush()   # průběžný zápis na disk

        # progress log
        elapsed = time.time() - start_time
        avg_time = elapsed / i
        remaining = (total - i) * avg_time
        percent = (i / total) * 100
        name = row.get("name", "?")
        print(f"[{i}/{total}] {percent:.1f}% | ID={station_id} | {name} | "
              f"zbývá ~{int(remaining//60)}m {int(remaining%60)}s")

        time.sleep(0.3)  # šetrné zpomalení

print(f"\n✅ Hotovo! Výstup uložen do: {output_file}")