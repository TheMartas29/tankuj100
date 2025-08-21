import csv
import json

input_file = "benzinky_data_final.csv"
output_file = "output.json"

def convert_csv_to_json(input_file, output_file):
    data = []
    with open(input_file, mode="r", encoding="utf-8") as csvfile:
        reader = csv.DictReader(csvfile, delimiter=";")  # 👈 důležité!
        for row in reader:
            # převedeme na dict se stejnými klíči jako CSV hlavička
            data.append(dict(row))

    with open(output_file, mode="w", encoding="utf-8") as jsonfile:
        json.dump(data, jsonfile, indent=2, ensure_ascii=False)

    print(f"✅ Hotovo! JSON uložen do {output_file}")

if __name__ == "__main__":
    convert_csv_to_json(input_file, output_file)