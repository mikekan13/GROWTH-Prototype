import sys, openpyxl, os
fn = sys.argv[1]
out = sys.argv[2]
sheet = sys.argv[3] if len(sys.argv)>3 else None
wb = openpyxl.load_workbook(fn, data_only=True)
sheets_to_dump = [sheet] if sheet else wb.sheetnames
n=0
with open(out, "w", encoding="utf-8") as fh:
    for sname in sheets_to_dump:
        if sname not in wb.sheetnames: continue
        ws = wb[sname]
        fh.write(f"### SHEET: {sname}\n")
        for row in ws.iter_rows():
            for c in row:
                v = c.value
                if v is None: continue
                s = str(v).strip()
                if not s: continue
                if s in ("False","#N/A"): continue
                fh.write(f"{c.coordinate}\t{s[:250]}\n")
                n+=1
print(f"WROTE {n} cells to {out}")
