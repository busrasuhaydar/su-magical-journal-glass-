"""Resmî tatil tohum verisini üretir: Türkiye + Avrupa + ABD.
Kaynak: Nager.Date (https://date.nager.at). Yalnız ülke genelindeki tatiller alınır.
Kullanım: python3 scripts/gen_holidays.py 2026 2027 2028 > supabase/seed/holidays.sql
"""
import json, sys, urllib.request, datetime as dt

COUNTRIES = ("TR US AD AL AT AX BA BE BG BY CH CY CZ DE DK EE ES FI FO FR GB GG GI GR HR HU IE IM IS IT "
             "JE LI LT LU LV MC MD ME MK MT NL NO PL PT RO RS RU SE SI SJ SK SM UA VA").split()
TENTATIVE_NOTE = "Kesinleşmedi: tarih ay gözlemine göre 1 gün kayabilir. Diyanet takvimiyle doğrulayın."

def q(s):
    return "null" if s is None else "'" + str(s).replace("'", "''") + "'"

def fetch(year, cc):
    with urllib.request.urlopen(f"https://date.nager.at/api/v3/PublicHolidays/{year}/{cc}", timeout=30) as r:
        body = r.read()
        return json.loads(body) if body else []

def nth_sunday(year, month, n):
    d = dt.date(year, month, 1)
    d += dt.timedelta(days=(6 - d.weekday()) % 7)
    return d + dt.timedelta(weeks=n - 1)

rows = []
for year in map(int, sys.argv[1:]):
    for cc in COUNTRIES:
        for h in fetch(year, cc):
            if h.get("counties"):  # bölgesel tatilleri atla
                continue
            local = h["localName"]
            tentative = "Tentative" in local
            local = local.replace(" (Tentative Date)", "").strip()
            rows.append((cc, h["date"], h["name"].replace(" (Tentative Date)", ""), local, "public",
                         "uncertain" if tentative else "confirmed", TENTATIVE_NOTE if tentative else None, "nager.date"))
            # Türkiye: dinî bayram ve Cumhuriyet Bayramı arifeleri (yarım gün)
            if cc == "TR" and (local.endswith("Bayramı 1. Gün")):
                arife = (dt.date.fromisoformat(h["date"]) - dt.timedelta(days=1)).isoformat()
                base = local.replace(" 1. Gün", "")
                rows.append((cc, arife, f"{base} Eve", f"{base} Arifesi", "half_day",
                             "uncertain" if tentative else "confirmed", TENTATIVE_NOTE if tentative else None, "türetildi"))
        # Türkiye: sabit arife ve önemli günler
    rows.append(("TR", f"{year}-10-28", "Republic Day Eve", "Cumhuriyet Bayramı Arifesi", "half_day", "confirmed", None, "2429 sayılı Kanun"))
    for md, en, tr in [("02-14", "Valentine's Day", "Sevgililer Günü"),
                       ("03-08", "International Women's Day", "Dünya Kadınlar Günü"),
                       ("03-18", "Çanakkale Victory Day", "Çanakkale Zaferi ve Şehitleri Anma Günü"),
                       ("11-10", "Atatürk Memorial Day", "Atatürk'ü Anma Günü"),
                       ("11-24", "Teachers' Day", "Öğretmenler Günü"),
                       ("12-31", "New Year's Eve", "Yılbaşı Gecesi")]:
        rows.append(("TR", f"{year}-{md}", en, tr, "observance", "confirmed", None, "takvim"))
    rows.append(("TR", nth_sunday(year, 5, 2).isoformat(), "Mother's Day", "Anneler Günü", "observance", "confirmed", None, "takvim"))
    rows.append(("TR", nth_sunday(year, 6, 3).isoformat(), "Father's Day", "Babalar Günü", "observance", "confirmed", None, "takvim"))

print("insert into holidays (country, day, name, local_name, kind, certainty, note, source) values")
print(",\n".join("(" + ",".join(q(v) for v in r) + ")" for r in rows))
print("on conflict (country, day, local_name) do nothing;")
print(f"-- {len(rows)} satır", file=sys.stderr)
