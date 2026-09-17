import sys, openpyxl, os, glob
src = r"C:\Projects\GRO.WTH\docs\_tmp\cs53\When all bonds are broken"
for fn in sorted(glob.glob(os.path.join(src, "*.xlsx"))):
    name = os.path.basename(fn)
    try:
        wb = openpyxl.load_workbook(fn, data_only=True)
        ws = wb["Main"]
        print(f"\n=== {name} ===")
        # Pull canonical positions: B2-I7 identity, attribute block B10:F15, Reflexes B17 row, APT/Speed
        print(f"Name: {ws['C2'].value} | Race: {ws['C3'].value} | Sex: {ws['F2'].value} | Home: {ws['F3'].value}")
        print(f"Weight: {ws['H2'].value} | Height: {ws['H3'].value} | Hair: {ws['H4'].value} | Eyes: {ws['H5'].value}")
        print(f"KV: {ws['I3'].value} | Karma: {ws['M5'].value} | Age: {ws['C7'].value} | Lifespan: {ws['E7'].value} | Beauty: {ws['H7'].value}")
        print("Attributes (LVL / SaveMod / Aug / DR):")
        for r in range(10,16):
            attr = ws.cell(row=r,column=2).value
            lvl = ws.cell(row=r,column=3).value
            sm = ws.cell(row=r,column=4).value
            aug = ws.cell(row=r,column=5).value
            dr = ws.cell(row=r,column=6).value
            if attr: print(f"  {attr}: L{lvl} SM{sm} Aug{aug} DR{dr}")
        print(f"Reflexes: {ws['C17'].value} | Focus Regen: {ws['E17'].value}")
        print(f"APT Mod: {ws['C18'].value} | APT: {ws['E18'].value}")
        print(f"Speed Mod: {ws['C19'].value} | Speed: {ws['E19'].value}")
        print(f"Unarmed Mod: {ws['C20'].value} | Unarmed DMG: {ws['E20'].value}")
        print(f"Tech Level: {ws['B23'].value}")
        # Focus value M9, M12; Frequency = K9/Q9? Let's just dump M-column near attrs
        focus_max_row9 = ws['K9'].value
        focus_max_row12 = ws['K12'].value
        print(f"K9 (something): {focus_max_row9}, K12: {focus_max_row12}")
        # G10..G15 — could be focus/aug? Looking at Tara: G10=40 (Strain), G13=60
        print(f"G10-G15: {[ws.cell(row=r,column=7).value for r in range(10,16)]}")
        print(f"H10-H15: {[ws.cell(row=r,column=8).value for r in range(10,16)]}")
        print(f"I10-I15: {[ws.cell(row=r,column=9).value for r in range(10,16)]}")
    except Exception as e:
        print(f"ERR {name}: {e}")
