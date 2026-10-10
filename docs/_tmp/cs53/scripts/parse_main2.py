import sys, openpyxl
fn = sys.argv[1]
out = sys.argv[2]
wb = openpyxl.load_workbook(fn, data_only=True)
ws = wb["Main"] if "Main" in wb.sheetnames else wb.worksheets[0]
n=0
with open(out, "w", encoding="utf-8") as fh:
    for row in ws.iter_rows():
        for c in row:
            v = c.value
            if v is None: continue
            s = str(v).strip()
            if not s: continue
            if s in ("False","0","0.0","#N/A"): continue
            fh.write(f"{c.coordinate}\t{s[:250]}\n")
            n+=1
print(f"WROTE {n} cells to {out}")
