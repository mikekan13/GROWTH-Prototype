import sys, openpyxl, os, glob
src = r"C:\Projects\GRO.WTH\docs\_tmp\cs53\When all bonds are broken"
files = sorted(glob.glob(os.path.join(src, "*.xlsx")))
print("Name | File | KV | STR | DEX | CON | INT | WIS | CHA | Tech | Wealth | Seed | Age | Birth | Lifespan | Home | Karma")
for fn in files:
    name = os.path.basename(fn)
    try:
        wb = openpyxl.load_workbook(fn, data_only=True)
        ws = wb["Main"]
        char = ws['B2'].value
        kv = ws['B3'].value
        attrs = {}
        for r in range(4,10):
            label = ws.cell(row=r,column=3).value
            lvl = ws.cell(row=r,column=5).value
            score = ws.cell(row=r,column=6).value
            attrs[label] = (lvl, score)
        seed = ws['D12'].value
        sex = ws['E12'].value
        beauty = ws['F12'].value
        home = ws['G12'].value
        height = ws['J12'].value
        weight = ws['K12'].value
        hair = ws['L12'].value
        lifespan = ws['D14'].value
        age = ws['E14'].value
        birthm = ws['F14'].value
        birthd = ws['G14'].value
        tech = ws['E2'].value
        wealth = ws['G2'].value
        karma = ws['J19'].value
        focus_max = ws['K8'].value
        toughness = ws['K4'].value
        baseresist = ws['K5'].value
        bvir = ws['K6'].value
        baseapt = ws['K7'].value
        speedmod = ws['L7'].value
        unarmed = ws['L9'].value
        cells = [str(char), name, str(kv), 
                 f"{attrs.get('STRENGTH',('',''))[0]}/{attrs.get('STRENGTH',('',''))[1]}",
                 f"{attrs.get('DEXTERITY',('',''))[0]}/{attrs.get('DEXTERITY',('',''))[1]}",
                 f"{attrs.get('CONSTITUTION',('',''))[0]}/{attrs.get('CONSTITUTION',('',''))[1]}",
                 f"{attrs.get('INTELLIGENCE',('',''))[0]}/{attrs.get('INTELLIGENCE',('',''))[1]}",
                 f"{attrs.get('WISDOM',('',''))[0]}/{attrs.get('WISDOM',('',''))[1]}",
                 f"{attrs.get('CHARISMA',('',''))[0]}/{attrs.get('CHARISMA',('',''))[1]}",
                 str(tech), str(wealth), str(seed), str(age), f"{birthm}/{birthd}", str(lifespan), str(home), str(karma)]
        print(" | ".join(cells))
        # Extra: pillar-relevant fields
        print(f"   ^ Endurance(K8)={focus_max} Toughness(K4)={toughness} BaseResist(K6)={bvir} BaseAPT(K8)={baseapt} SpeedMod(L8)={speedmod} UnarmedMod(L9)={unarmed} Beauty={beauty} Sex={sex} Height={height} Weight={weight} HairEyes={hair}")
    except Exception as e:
        print(f"ERR {name}: {e}")
