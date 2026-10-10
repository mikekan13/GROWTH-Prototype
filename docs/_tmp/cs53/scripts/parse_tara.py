import sys, os
path = r"C:\Projects\GRO.WTH\docs\_tmp\cs53\extract\Tara_Library_Maiden_CS4.1.txt"
with open(path, encoding="utf-8") as f:
    lines = f.read().splitlines()
sheets = {}
cur = None
for line in lines:
    if line.startswith("## SHEET:"):
        cur = line.split("SHEET:",1)[1].strip()
        sheets[cur] = []
    elif cur and line.startswith("R"):
        sheets[cur].append(line)
print("SHEETS:", list(sheets.keys()))
for name, rows in sheets.items():
    print(f"\n=== {name} === rows={len(rows)}")
    for r in rows:
        s = r if len(r) < 400 else r[:400] + "..."
        if ":" in s and s.split(":",1)[1].strip().replace("|","").strip():
            print(s)
