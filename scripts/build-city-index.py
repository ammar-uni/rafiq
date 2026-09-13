"""Rebuild the Arabic-script city index from a downloaded GeoNames cities500.zip.

Usage: python scripts/build-city-index.py path/to/cities500.zip path/to/admin1CodesASCII.txt
Source: https://download.geonames.org/export/dump/cities500.zip (CC BY 4.0).
No network requests, credentials, or user location data are used by this script.
"""
import hashlib
import json
from pathlib import Path
import re
import sys
import zipfile

archive = Path(sys.argv[1]).read_bytes()
admin_bytes = Path(sys.argv[2]).read_bytes()
regions = {f[0]: f[1] for f in (line.split('\t') for line in admin_bytes.decode('utf-8').splitlines()) if len(f) >= 2}
rows = []
with zipfile.ZipFile(Path(sys.argv[1])) as source:
    snapshot_date = '-'.join(f'{n:02}' for n in source.getinfo('cities500.txt').date_time[:3])
    for line in source.read('cities500.txt').decode('utf-8').splitlines():
        f = line.split('\t')
        if len(f) != 19 or f[6] != 'P' or not f[17]:
            continue
        names = list(dict.fromkeys(n for n in [f[1], f[2]] + f[3].split(',') if 1 < len(n) <= 80))
        if any(re.search('[\u0600-\u06ff]', n) for n in names) and f[7] not in ['PPLX', 'PPLH', 'PPLQ', 'PPLCH']:
            rows.append([int(f[0]), names, f[8], f[10], round(float(f[4]), 3),
                         round(float(f[5]), 3), f[17], int(f[14]), f[7]])
rows.sort(key=lambda row: row[0])
destination = Path(__file__).resolve().parents[1] / 'src' / 'data' / 'city-aliases.json'
destination.parent.mkdir(parents=True, exist_ok=True)
metadata = dict(source='https://download.geonames.org/export/dump/cities500.zip',
                license='https://creativecommons.org/licenses/by/4.0/',
                attribution='GeoNames', snapshotDate=snapshot_date,
                sourceSha256=hashlib.sha256(archive).hexdigest(),
                regionSource='https://download.geonames.org/export/dump/admin1CodesASCII.txt',
                regionSha256=hashlib.sha256(admin_bytes).hexdigest(),
                regions={key: regions[key] for key in sorted({row[2] + '.' + row[3] for row in rows}) if key in regions},
                columns=['id', 'names', 'countryCode', 'admin1', 'latitude', 'longitude', 'timezone', 'population', 'featureCode'])
header = json.dumps(metadata, ensure_ascii=False, indent=2)[:-2]
destination.write_text(header + ',\n  "cities": [\n' + ',\n'.join(
    '    ' + json.dumps(row, ensure_ascii=False, separators=(',', ':')) for row in rows
) + '\n  ]\n}\n', encoding='utf-8')
print(f'Generated {len(rows)} records ({destination.stat().st_size} bytes); snapshot {snapshot_date}')
