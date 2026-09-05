import sys, openpyxl
fn = sys.argv[1]
out = sys.argv[2]
wb = openpyxl.load_workbook(fn, data_only=True)
ws = wb["Main"] if "Main" in wb.sheetnames else wb.worksheets[0]
with open(out, "w", encoding="utf-8") as fh:
    for row in ws.iter_rows():
        for c in row:
            if c.value not in (None, "", False, 0, 0.0):
                # skip pure formula leftovers
                v = str(c.value).strip()
                if v and v not in ("False","0","0.0","#N/A"):
                    fh.write(f"{c.coordinate}: {v[:200]}\n")
