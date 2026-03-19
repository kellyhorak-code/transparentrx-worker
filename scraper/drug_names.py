"""
drug_names.py

GoodRx canonical name mapping.
- display_name: what shows in autocomplete (clean, consumer-friendly)
- goodrx_slug:  the URL slug GoodRx uses (used by scraper to build URLs)
- fda_names:    what FDA/NDC master might call it (for matching on import)

Format: drug_key -> { display, slug, fda_aliases }
"""

DRUG_NAMES = {

    # ── Statins ──
    "atorvastatin":             { "display": "Atorvastatin (Generic Lipitor)",       "slug": "atorvastatin",             "brand": "Lipitor" },
    "simvastatin":              { "display": "Simvastatin (Generic Zocor)",           "slug": "simvastatin",              "brand": "Zocor" },
    "rosuvastatin":             { "display": "Rosuvastatin (Generic Crestor)",        "slug": "rosuvastatin",             "brand": "Crestor" },
    "pravastatin":              { "display": "Pravastatin (Generic Pravachol)",       "slug": "pravastatin",              "brand": "Pravachol" },
    "lovastatin":               { "display": "Lovastatin (Generic Mevacor)",          "slug": "lovastatin",               "brand": "Mevacor" },
    "fluvastatin":              { "display": "Fluvastatin (Generic Lescol)",          "slug": "fluvastatin",              "brand": "Lescol" },
    "pitavastatin":             { "display": "Pitavastatin (Generic Livalo)",         "slug": "pitavastatin",             "brand": "Livalo" },

    # ── ACE Inhibitors ──
    "lisinopril":               { "display": "Lisinopril (Generic Zestril/Prinivil)", "slug": "lisinopril",               "brand": "Zestril" },
    "enalapril":                { "display": "Enalapril (Generic Vasotec)",           "slug": "enalapril",                "brand": "Vasotec" },
    "ramipril":                 { "display": "Ramipril (Generic Altace)",             "slug": "ramipril",                 "brand": "Altace" },
    "benazepril":               { "display": "Benazepril (Generic Lotensin)",         "slug": "benazepril",               "brand": "Lotensin" },
    "quinapril":                { "display": "Quinapril (Generic Accupril)",          "slug": "quinapril",                "brand": "Accupril" },
    "fosinopril":               { "display": "Fosinopril (Generic Monopril)",         "slug": "fosinopril",               "brand": "Monopril" },

    # ── ARBs ──
    "losartan":                 { "display": "Losartan (Generic Cozaar)",             "slug": "losartan",                 "brand": "Cozaar" },
    "valsartan":                { "display": "Valsartan (Generic Diovan)",            "slug": "valsartan",                "brand": "Diovan" },
    "olmesartan":               { "display": "Olmesartan (Generic Benicar)",          "slug": "olmesartan",               "brand": "Benicar" },
    "irbesartan":               { "display": "Irbesartan (Generic Avapro)",           "slug": "irbesartan",               "brand": "Avapro" },
    "candesartan":              { "display": "Candesartan (Generic Atacand)",         "slug": "candesartan",              "brand": "Atacand" },
    "telmisartan":              { "display": "Telmisartan (Generic Micardis)",        "slug": "telmisartan",              "brand": "Micardis" },

    # ── Beta Blockers ──
    "metoprolol":               { "display": "Metoprolol (Generic Lopressor/Toprol)", "slug": "metoprolol",               "brand": "Lopressor" },
    "atenolol":                 { "display": "Atenolol (Generic Tenormin)",           "slug": "atenolol",                 "brand": "Tenormin" },
    "carvedilol":               { "display": "Carvedilol (Generic Coreg)",            "slug": "carvedilol",               "brand": "Coreg" },
    "bisoprolol":               { "display": "Bisoprolol (Generic Zebeta)",           "slug": "bisoprolol",               "brand": "Zebeta" },
    "propranolol":              { "display": "Propranolol (Generic Inderal)",         "slug": "propranolol",              "brand": "Inderal" },
    "nebivolol":                { "display": "Nebivolol (Generic Bystolic)",          "slug": "nebivolol",                "brand": "Bystolic" },

    # ── Calcium Channel Blockers ──
    "amlodipine":               { "display": "Amlodipine (Generic Norvasc)",          "slug": "amlodipine",               "brand": "Norvasc" },
    "diltiazem":                { "display": "Diltiazem (Generic Cardizem)",          "slug": "diltiazem",                "brand": "Cardizem" },
    "nifedipine":               { "display": "Nifedipine (Generic Procardia)",        "slug": "nifedipine",               "brand": "Procardia" },
    "verapamil":                { "display": "Verapamil (Generic Calan)",             "slug": "verapamil",                "brand": "Calan" },

    # ── Diabetes ──
    "metformin":                { "display": "Metformin (Generic Glucophage)",        "slug": "metformin",                "brand": "Glucophage" },
    "glipizide":                { "display": "Glipizide (Generic Glucotrol)",         "slug": "glipizide",                "brand": "Glucotrol" },
    "glyburide":                { "display": "Glyburide (Generic Diabeta)",           "slug": "glyburide",                "brand": "Diabeta" },
    "glimepiride":              { "display": "Glimepiride (Generic Amaryl)",          "slug": "glimepiride",              "brand": "Amaryl" },
    "pioglitazone":             { "display": "Pioglitazone (Generic Actos)",          "slug": "pioglitazone",             "brand": "Actos" },
    "sitagliptin":              { "display": "Sitagliptin (Januvia)",                 "slug": "sitagliptin",              "brand": "Januvia" },
    "semaglutide":              { "display": "Semaglutide (Ozempic/Wegovy)",          "slug": "semaglutide",              "brand": "Ozempic" },
    "liraglutide":              { "display": "Liraglutide (Victoza/Saxenda)",         "slug": "liraglutide",              "brand": "Victoza" },
    "dulaglutide":              { "display": "Dulaglutide (Trulicity)",               "slug": "dulaglutide",              "brand": "Trulicity" },
    "empagliflozin":            { "display": "Empagliflozin (Jardiance)",             "slug": "empagliflozin",            "brand": "Jardiance" },
    "dapagliflozin":            { "display": "Dapagliflozin (Farxiga)",               "slug": "dapagliflozin",            "brand": "Farxiga" },
    "canagliflozin":            { "display": "Canagliflozin (Invokana)",              "slug": "canagliflozin",            "brand": "Invokana" },
    "linagliptin":              { "display": "Linagliptin (Tradjenta)",               "slug": "linagliptin",              "brand": "Tradjenta" },
    "nateglinide":              { "display": "Nateglinide (Generic Starlix)",         "slug": "nateglinide",              "brand": "Starlix" },
    "repaglinide":              { "display": "Repaglinide (Generic Prandin)",         "slug": "repaglinide",              "brand": "Prandin" },
    "acarbose":                 { "display": "Acarbose (Generic Precose)",            "slug": "acarbose",                 "brand": "Precose" },

    # ── Thyroid ──
    "levothyroxine":            { "display": "Levothyroxine (Generic Synthroid)",     "slug": "levothyroxine",            "brand": "Synthroid" },
    "liothyronine":             { "display": "Liothyronine (Generic Cytomel)",        "slug": "liothyronine",             "brand": "Cytomel" },
    "methimazole":              { "display": "Methimazole (Generic Tapazole)",        "slug": "methimazole",              "brand": "Tapazole" },
    "propylthiouracil":         { "display": "Propylthiouracil (PTU)",                "slug": "propylthiouracil",         "brand": "PTU" },

    # ── Diuretics ──
    "hydrochlorothiazide":      { "display": "Hydrochlorothiazide (HCTZ)",            "slug": "hydrochlorothiazide",      "brand": "Microzide" },
    "furosemide":               { "display": "Furosemide (Generic Lasix)",            "slug": "furosemide",               "brand": "Lasix" },
    "spironolactone":           { "display": "Spironolactone (Generic Aldactone)",    "slug": "spironolactone",           "brand": "Aldactone" },
    "chlorthalidone":           { "display": "Chlorthalidone (Generic Hygroton)",     "slug": "chlorthalidone",           "brand": "Hygroton" },
    "torsemide":                { "display": "Torsemide (Generic Demadex)",           "slug": "torsemide",                "brand": "Demadex" },
    "bumetanide":               { "display": "Bumetanide (Generic Bumex)",            "slug": "bumetanide",               "brand": "Bumex" },
    "metolazone":               { "display": "Metolazone (Generic Zaroxolyn)",        "slug": "metolazone",               "brand": "Zaroxolyn" },
    "indapamide":               { "display": "Indapamide (Generic Lozol)",            "slug": "indapamide",               "brand": "Lozol" },
    "eplerenone":               { "display": "Eplerenone (Generic Inspra)",           "slug": "eplerenone",               "brand": "Inspra" },
    "triamterene":              { "display": "Triamterene (Generic Dyrenium)",        "slug": "triamterene",              "brand": "Dyrenium" },

    # ── PPIs / GI ──
    "omeprazole":               { "display": "Omeprazole (Generic Prilosec)",         "slug": "omeprazole",               "brand": "Prilosec" },
    "pantoprazole":             { "display": "Pantoprazole (Generic Protonix)",       "slug": "pantoprazole",             "brand": "Protonix" },
    "esomeprazole":             { "display": "Esomeprazole (Generic Nexium)",         "slug": "esomeprazole",             "brand": "Nexium" },
    "lansoprazole":             { "display": "Lansoprazole (Generic Prevacid)",       "slug": "lansoprazole",             "brand": "Prevacid" },
    "rabeprazole":              { "display": "Rabeprazole (Generic Aciphex)",         "slug": "rabeprazole",              "brand": "Aciphex" },
    "famotidine":               { "display": "Famotidine (Generic Pepcid)",           "slug": "famotidine",               "brand": "Pepcid" },
    "sucralfate":               { "display": "Sucralfate (Generic Carafate)",         "slug": "sucralfate",               "brand": "Carafate" },
    "misoprostol":              { "display": "Misoprostol (Generic Cytotec)",         "slug": "misoprostol",              "brand": "Cytotec" },
    "dicyclomine":              { "display": "Dicyclomine (Generic Bentyl)",          "slug": "dicyclomine",              "brand": "Bentyl" },
    "hyoscyamine":              { "display": "Hyoscyamine (Generic Levsin)",          "slug": "hyoscyamine",              "brand": "Levsin" },
    "ondansetron":              { "display": "Ondansetron (Generic Zofran)",          "slug": "ondansetron",              "brand": "Zofran" },
    "promethazine":             { "display": "Promethazine (Generic Phenergan)",      "slug": "promethazine",             "brand": "Phenergan" },
    "metoclopramide":           { "display": "Metoclopramide (Generic Reglan)",       "slug": "metoclopramide",           "brand": "Reglan" },
    "prochlorperazine":         { "display": "Prochlorperazine (Generic Compazine)",  "slug": "prochlorperazine",         "brand": "Compazine" },
    "mesalamine":               { "display": "Mesalamine (Generic Asacol/Lialda)",    "slug": "mesalamine",               "brand": "Asacol" },
    "rifaximin":                { "display": "Rifaximin (Xifaxan)",                   "slug": "rifaximin",                "brand": "Xifaxan" },
    "budesonide":               { "display": "Budesonide (Generic Entocort)",         "slug": "budesonide",               "brand": "Entocort" },

    # ── Antidepressants ──
    "sertraline":               { "display": "Sertraline (Generic Zoloft)",           "slug": "sertraline",               "brand": "Zoloft" },
    "fluoxetine":               { "display": "Fluoxetine (Generic Prozac)",           "slug": "fluoxetine",               "brand": "Prozac" },
    "escitalopram":             { "display": "Escitalopram (Generic Lexapro)",        "slug": "escitalopram",             "brand": "Lexapro" },
    "citalopram":               { "display": "Citalopram (Generic Celexa)",           "slug": "citalopram",               "brand": "Celexa" },
    "paroxetine":               { "display": "Paroxetine (Generic Paxil)",            "slug": "paroxetine",               "brand": "Paxil" },
    "venlafaxine":              { "display": "Venlafaxine (Generic Effexor)",         "slug": "venlafaxine",              "brand": "Effexor" },
    "duloxetine":               { "display": "Duloxetine (Generic Cymbalta)",         "slug": "duloxetine",               "brand": "Cymbalta" },
    "bupropion":                { "display": "Bupropion (Generic Wellbutrin)",        "slug": "bupropion",                "brand": "Wellbutrin" },
    "mirtazapine":              { "display": "Mirtazapine (Generic Remeron)",         "slug": "mirtazapine",              "brand": "Remeron" },
    "trazodone":                { "display": "Trazodone (Generic Desyrel)",           "slug": "trazodone",                "brand": "Desyrel" },
    "amitriptyline":            { "display": "Amitriptyline (Generic Elavil)",        "slug": "amitriptyline",            "brand": "Elavil" },
    "nortriptyline":            { "display": "Nortriptyline (Generic Pamelor)",       "slug": "nortriptyline",            "brand": "Pamelor" },
    "imipramine":               { "display": "Imipramine (Generic Tofranil)",         "slug": "imipramine",               "brand": "Tofranil" },
    "desipramine":              { "display": "Desipramine (Generic Norpramin)",       "slug": "desipramine",              "brand": "Norpramin" },
    "clomipramine":             { "display": "Clomipramine (Generic Anafranil)",      "slug": "clomipramine",             "brand": "Anafranil" },
    "doxepin":                  { "display": "Doxepin (Generic Sinequan)",            "slug": "doxepin",                  "brand": "Sinequan" },
    "fluvoxamine":              { "display": "Fluvoxamine (Generic Luvox)",           "slug": "fluvoxamine",              "brand": "Luvox" },
    "milnacipran":              { "display": "Milnacipran (Savella)",                 "slug": "milnacipran",              "brand": "Savella" },

    # ── Anxiety / Sleep ──
    "alprazolam":               { "display": "Alprazolam (Generic Xanax)",            "slug": "alprazolam",               "brand": "Xanax" },
    "clonazepam":               { "display": "Clonazepam (Generic Klonopin)",         "slug": "clonazepam",               "brand": "Klonopin" },
    "lorazepam":                { "display": "Lorazepam (Generic Ativan)",            "slug": "lorazepam",                "brand": "Ativan" },
    "diazepam":                 { "display": "Diazepam (Generic Valium)",             "slug": "diazepam",                 "brand": "Valium" },
    "buspirone":                { "display": "Buspirone (Generic Buspar)",            "slug": "buspirone",                "brand": "Buspar" },
    "zolpidem":                 { "display": "Zolpidem (Generic Ambien)",             "slug": "zolpidem",                 "brand": "Ambien" },
    "suvorexant":               { "display": "Suvorexant (Belsomra)",                 "slug": "suvorexant",               "brand": "Belsomra" },
    "lemborexant":              { "display": "Lemborexant (Dayvigo)",                 "slug": "lemborexant",              "brand": "Dayvigo" },
    "ramelteon":                { "display": "Ramelteon (Rozerem)",                   "slug": "ramelteon",                "brand": "Rozerem" },

    # ── Anticonvulsants ──
    "gabapentin":               { "display": "Gabapentin (Generic Neurontin)",        "slug": "gabapentin",               "brand": "Neurontin" },
    "pregabalin":               { "display": "Pregabalin (Generic Lyrica)",           "slug": "pregabalin",               "brand": "Lyrica" },
    "topiramate":               { "display": "Topiramate (Generic Topamax)",          "slug": "topiramate",               "brand": "Topamax" },
    "lamotrigine":              { "display": "Lamotrigine (Generic Lamictal)",        "slug": "lamotrigine",              "brand": "Lamictal" },
    "levetiracetam":            { "display": "Levetiracetam (Generic Keppra)",        "slug": "levetiracetam",            "brand": "Keppra" },
    "valproic acid":            { "display": "Valproic Acid (Generic Depakene)",      "slug": "valproic-acid",            "brand": "Depakene" },
    "carbamazepine":            { "display": "Carbamazepine (Generic Tegretol)",      "slug": "carbamazepine",            "brand": "Tegretol" },
    "brivaracetam":             { "display": "Brivaracetam (Briviact)",               "slug": "brivaracetam",             "brand": "Briviact" },
    "lacosamide":               { "display": "Lacosamide (Vimpat)",                   "slug": "lacosamide",               "brand": "Vimpat" },
    "perampanel":               { "display": "Perampanel (Fycompa)",                  "slug": "perampanel",               "brand": "Fycompa" },
    "clobazam":                 { "display": "Clobazam (Onfi)",                       "slug": "clobazam",                 "brand": "Onfi" },

    # ── Pain / Muscle ──
    "cyclobenzaprine":          { "display": "Cyclobenzaprine (Generic Flexeril)",    "slug": "cyclobenzaprine",          "brand": "Flexeril" },
    "baclofen":                 { "display": "Baclofen (Generic Lioresal)",           "slug": "baclofen",                 "brand": "Lioresal" },
    "methocarbamol":            { "display": "Methocarbamol (Generic Robaxin)",       "slug": "methocarbamol",            "brand": "Robaxin" },
    "carisoprodol":             { "display": "Carisoprodol (Generic Soma)",           "slug": "carisoprodol",             "brand": "Soma" },
    "tramadol":                 { "display": "Tramadol (Generic Ultram)",             "slug": "tramadol",                 "brand": "Ultram" },
    "meloxicam":                { "display": "Meloxicam (Generic Mobic)",             "slug": "meloxicam",                "brand": "Mobic" },
    "naproxen":                 { "display": "Naproxen (Generic Aleve/Naprosyn)",     "slug": "naproxen",                 "brand": "Naprosyn" },
    "ibuprofen":                { "display": "Ibuprofen (Generic Advil/Motrin)",      "slug": "ibuprofen",                "brand": "Motrin" },
    "celecoxib":                { "display": "Celecoxib (Generic Celebrex)",          "slug": "celecoxib",                "brand": "Celebrex" },
    "diclofenac":               { "display": "Diclofenac (Generic Voltaren)",         "slug": "diclofenac",               "brand": "Voltaren" },
    "indomethacin":             { "display": "Indomethacin (Generic Indocin)",        "slug": "indomethacin",             "brand": "Indocin" },
    "ketorolac":                { "display": "Ketorolac (Generic Toradol)",           "slug": "ketorolac",                "brand": "Toradol" },
    "piroxicam":                { "display": "Piroxicam (Generic Feldene)",           "slug": "piroxicam",                "brand": "Feldene" },
    "tapentadol":               { "display": "Tapentadol (Nucynta)",                  "slug": "tapentadol",               "brand": "Nucynta" },

    # ── Opioids ──
    "oxycodone":                { "display": "Oxycodone (Generic OxyContin)",         "slug": "oxycodone",                "brand": "OxyContin" },
    "hydrocodone":              { "display": "Hydrocodone (Generic Vicodin)",         "slug": "hydrocodone",              "brand": "Vicodin" },
    "morphine":                 { "display": "Morphine Sulfate",                      "slug": "morphine",                 "brand": "MS Contin" },
    "hydromorphone":            { "display": "Hydromorphone (Generic Dilaudid)",      "slug": "hydromorphone",            "brand": "Dilaudid" },
    "codeine":                  { "display": "Codeine Sulfate",                       "slug": "codeine",                  "brand": "Codeine" },
    "buprenorphine":            { "display": "Buprenorphine (Generic Butrans)",       "slug": "buprenorphine",            "brand": "Butrans" },
    "buprenorphine-naloxone":   { "display": "Buprenorphine/Naloxone (Generic Suboxone)", "slug": "buprenorphine-naloxone", "brand": "Suboxone" },
    "methadone":                { "display": "Methadone HCl",                         "slug": "methadone",                "brand": "Methadose" },
    "naltrexone":               { "display": "Naltrexone (Generic Vivitrol)",         "slug": "naltrexone",               "brand": "Vivitrol" },

    # ── Antibiotics ──
    "amoxicillin":              { "display": "Amoxicillin (Generic Amoxil)",          "slug": "amoxicillin",              "brand": "Amoxil" },
    "amoxicillin-clavulanate":  { "display": "Amoxicillin/Clavulanate (Generic Augmentin)", "slug": "amoxicillin-clavulanate", "brand": "Augmentin" },
    "azithromycin":             { "display": "Azithromycin (Generic Zithromax)",      "slug": "azithromycin",             "brand": "Zithromax" },
    "doxycycline":              { "display": "Doxycycline (Generic Vibramycin)",      "slug": "doxycycline",              "brand": "Vibramycin" },
    "ciprofloxacin":            { "display": "Ciprofloxacin (Generic Cipro)",         "slug": "ciprofloxacin",            "brand": "Cipro" },
    "levofloxacin":             { "display": "Levofloxacin (Generic Levaquin)",       "slug": "levofloxacin",             "brand": "Levaquin" },
    "cephalexin":               { "display": "Cephalexin (Generic Keflex)",           "slug": "cephalexin",               "brand": "Keflex" },
    "clindamycin":              { "display": "Clindamycin (Generic Cleocin)",         "slug": "clindamycin",              "brand": "Cleocin" },
    "metronidazole":            { "display": "Metronidazole (Generic Flagyl)",        "slug": "metronidazole",            "brand": "Flagyl" },
    "nitrofurantoin":           { "display": "Nitrofurantoin (Generic Macrobid)",     "slug": "nitrofurantoin",           "brand": "Macrobid" },
    "trimethoprim-sulfamethoxazole": { "display": "Trimethoprim/Sulfamethoxazole (Generic Bactrim)", "slug": "trimethoprim-sulfamethoxazole", "brand": "Bactrim" },
    "erythromycin":             { "display": "Erythromycin",                          "slug": "erythromycin",             "brand": "Ery-Tab" },
    "clarithromycin":           { "display": "Clarithromycin (Generic Biaxin)",       "slug": "clarithromycin",           "brand": "Biaxin" },
    "minocycline":              { "display": "Minocycline (Generic Minocin)",         "slug": "minocycline",              "brand": "Minocin" },
    "cefuroxime":               { "display": "Cefuroxime (Generic Ceftin)",           "slug": "cefuroxime",               "brand": "Ceftin" },
    "cefdinir":                 { "display": "Cefdinir (Generic Omnicef)",            "slug": "cefdinir",                 "brand": "Omnicef" },
    "penicillin v":             { "display": "Penicillin V Potassium",                "slug": "penicillin-v-potassium",   "brand": "Penicillin VK" },
    "moxifloxacin":             { "display": "Moxifloxacin (Generic Avelox)",         "slug": "moxifloxacin",             "brand": "Avelox" },

    # ── Respiratory / Allergy ──
    "montelukast":              { "display": "Montelukast (Generic Singulair)",       "slug": "montelukast",              "brand": "Singulair" },
    "cetirizine":               { "display": "Cetirizine (Generic Zyrtec)",           "slug": "cetirizine",               "brand": "Zyrtec" },
    "loratadine":               { "display": "Loratadine (Generic Claritin)",         "slug": "loratadine",               "brand": "Claritin" },
    "fexofenadine":             { "display": "Fexofenadine (Generic Allegra)",        "slug": "fexofenadine",             "brand": "Allegra" },
    "prednisone":               { "display": "Prednisone",                            "slug": "prednisone",               "brand": "Deltasone" },
    "methylprednisolone":       { "display": "Methylprednisolone (Generic Medrol)",   "slug": "methylprednisolone",       "brand": "Medrol" },
    "theophylline":             { "display": "Theophylline (Generic Theo-24)",        "slug": "theophylline",             "brand": "Theo-24" },

    # ── ADHD ──
    "amphetamine salts":        { "display": "Amphetamine Salts (Generic Adderall)",  "slug": "amphetamine-salt-combo",   "brand": "Adderall" },
    "methylphenidate":          { "display": "Methylphenidate (Generic Ritalin)",     "slug": "methylphenidate",          "brand": "Ritalin" },
    "atomoxetine":              { "display": "Atomoxetine (Generic Strattera)",       "slug": "atomoxetine",              "brand": "Strattera" },
    "guanfacine":               { "display": "Guanfacine (Generic Intuniv)",          "slug": "guanfacine",               "brand": "Intuniv" },
    "clonidine":                { "display": "Clonidine (Generic Catapres)",          "slug": "clonidine",                "brand": "Catapres" },

    # ── Anticoagulants ──
    "warfarin":                 { "display": "Warfarin (Generic Coumadin)",           "slug": "warfarin",                 "brand": "Coumadin" },
    "rivaroxaban":              { "display": "Rivaroxaban (Xarelto)",                 "slug": "rivaroxaban",              "brand": "Xarelto" },
    "apixaban":                 { "display": "Apixaban (Eliquis)",                    "slug": "apixaban",                 "brand": "Eliquis" },
    "clopidogrel":              { "display": "Clopidogrel (Generic Plavix)",          "slug": "clopidogrel",              "brand": "Plavix" },
    "ticagrelor":               { "display": "Ticagrelor (Brilinta)",                 "slug": "ticagrelor",               "brand": "Brilinta" },
    "aspirin":                  { "display": "Aspirin (Low Dose)",                    "slug": "aspirin",                  "brand": "Bayer" },

    # ── Cardiac ──
    "digoxin":                  { "display": "Digoxin (Generic Lanoxin)",             "slug": "digoxin",                  "brand": "Lanoxin" },
    "amiodarone":               { "display": "Amiodarone (Generic Cordarone)",        "slug": "amiodarone",               "brand": "Cordarone" },
    "hydralazine":              { "display": "Hydralazine (Generic Apresoline)",      "slug": "hydralazine",              "brand": "Apresoline" },
    "isosorbide mononitrate":   { "display": "Isosorbide Mononitrate (Generic Imdur)","slug": "isosorbide-mononitrate",   "brand": "Imdur" },
    "nitroglycerin":            { "display": "Nitroglycerin (Generic Nitrostat)",     "slug": "nitroglycerin",            "brand": "Nitrostat" },
    "sacubitril-valsartan":     { "display": "Sacubitril/Valsartan (Entresto)",       "slug": "sacubitril-valsartan",     "brand": "Entresto" },
    "ivabradine":               { "display": "Ivabradine (Corlanor)",                 "slug": "ivabradine",               "brand": "Corlanor" },
    "ranolazine":               { "display": "Ranolazine (Generic Ranexa)",           "slug": "ranolazine",               "brand": "Ranexa" },

    # ── Hyperlipidemia ──
    "ezetimibe":                { "display": "Ezetimibe (Generic Zetia)",             "slug": "ezetimibe",                "brand": "Zetia" },
    "fenofibrate":              { "display": "Fenofibrate (Generic Tricor)",          "slug": "fenofibrate",              "brand": "Tricor" },
    "gemfibrozil":              { "display": "Gemfibrozil (Generic Lopid)",           "slug": "gemfibrozil",              "brand": "Lopid" },
    "niacin":                   { "display": "Niacin (Generic Niaspan)",              "slug": "niacin",                   "brand": "Niaspan" },
    "icosapent ethyl":          { "display": "Icosapent Ethyl (Vascepa)",             "slug": "icosapent-ethyl",          "brand": "Vascepa" },

    # ── Antipsychotics ──
    "quetiapine":               { "display": "Quetiapine (Generic Seroquel)",         "slug": "quetiapine",               "brand": "Seroquel" },
    "aripiprazole":             { "display": "Aripiprazole (Generic Abilify)",        "slug": "aripiprazole",             "brand": "Abilify" },
    "olanzapine":               { "display": "Olanzapine (Generic Zyprexa)",          "slug": "olanzapine",               "brand": "Zyprexa" },
    "risperidone":              { "display": "Risperidone (Generic Risperdal)",       "slug": "risperidone",              "brand": "Risperdal" },
    "haloperidol":              { "display": "Haloperidol (Generic Haldol)",          "slug": "haloperidol",              "brand": "Haldol" },
    "clozapine":                { "display": "Clozapine (Generic Clozaril)",          "slug": "clozapine",                "brand": "Clozaril" },
    "ziprasidone":              { "display": "Ziprasidone (Generic Geodon)",          "slug": "ziprasidone",              "brand": "Geodon" },
    "lurasidone":               { "display": "Lurasidone (Generic Latuda)",           "slug": "lurasidone",               "brand": "Latuda" },
    "paliperidone":             { "display": "Paliperidone (Generic Invega)",         "slug": "paliperidone",             "brand": "Invega" },
    "brexpiprazole":            { "display": "Brexpiprazole (Rexulti)",               "slug": "brexpiprazole",            "brand": "Rexulti" },
    "cariprazine":              { "display": "Cariprazine (Vraylar)",                 "slug": "cariprazine",              "brand": "Vraylar" },
    "lithium":                  { "display": "Lithium Carbonate (Generic Lithobid)",  "slug": "lithium",                  "brand": "Lithobid" },

    # ── Gout ──
    "allopurinol":              { "display": "Allopurinol (Generic Zyloprim)",        "slug": "allopurinol",              "brand": "Zyloprim" },
    "febuxostat":               { "display": "Febuxostat (Generic Uloric)",           "slug": "febuxostat",               "brand": "Uloric" },
    "colchicine":               { "display": "Colchicine (Generic Colcrys)",          "slug": "colchicine",               "brand": "Colcrys" },

    # ── Urinary / BPH ──
    "tamsulosin":               { "display": "Tamsulosin (Generic Flomax)",           "slug": "tamsulosin",               "brand": "Flomax" },
    "finasteride":              { "display": "Finasteride (Generic Proscar/Propecia)","slug": "finasteride",              "brand": "Proscar" },
    "dutasteride":              { "display": "Dutasteride (Generic Avodart)",         "slug": "dutasteride",              "brand": "Avodart" },
    "oxybutynin":               { "display": "Oxybutynin (Generic Ditropan)",         "slug": "oxybutynin",               "brand": "Ditropan" },
    "solifenacin":              { "display": "Solifenacin (Generic Vesicare)",        "slug": "solifenacin",              "brand": "Vesicare" },
    "mirabegron":               { "display": "Mirabegron (Generic Myrbetriq)",        "slug": "mirabegron",               "brand": "Myrbetriq" },
    "doxazosin":                { "display": "Doxazosin (Generic Cardura)",           "slug": "doxazosin",                "brand": "Cardura" },

    # ── ED ──
    "sildenafil":               { "display": "Sildenafil (Generic Viagra)",           "slug": "sildenafil",               "brand": "Viagra" },
    "tadalafil":                { "display": "Tadalafil (Generic Cialis)",            "slug": "tadalafil",                "brand": "Cialis" },
    "vardenafil":               { "display": "Vardenafil (Generic Levitra)",          "slug": "vardenafil",               "brand": "Levitra" },

    # ── Migraine ──
    "sumatriptan":              { "display": "Sumatriptan (Generic Imitrex)",         "slug": "sumatriptan",              "brand": "Imitrex" },
    "rizatriptan":              { "display": "Rizatriptan (Generic Maxalt)",          "slug": "rizatriptan",              "brand": "Maxalt" },
    "zolmitriptan":             { "display": "Zolmitriptan (Generic Zomig)",          "slug": "zolmitriptan",             "brand": "Zomig" },
    "eletriptan":               { "display": "Eletriptan (Generic Relpax)",           "slug": "eletriptan",               "brand": "Relpax" },

    # ── Antivirals ──
    "acyclovir":                { "display": "Acyclovir (Generic Zovirax)",           "slug": "acyclovir",                "brand": "Zovirax" },
    "valacyclovir":             { "display": "Valacyclovir (Generic Valtrex)",        "slug": "valacyclovir",             "brand": "Valtrex" },
    "famciclovir":              { "display": "Famciclovir (Generic Famvir)",          "slug": "famciclovir",              "brand": "Famvir" },
    "oseltamivir":              { "display": "Oseltamivir (Generic Tamiflu)",         "slug": "oseltamivir",              "brand": "Tamiflu" },

    # ── Antifungals ──
    "fluconazole":              { "display": "Fluconazole (Generic Diflucan)",        "slug": "fluconazole",              "brand": "Diflucan" },
    "terbinafine":              { "display": "Terbinafine (Generic Lamisil)",         "slug": "terbinafine",              "brand": "Lamisil" },

    # ── Immunosuppressants / Rheum ──
    "methotrexate":             { "display": "Methotrexate",                          "slug": "methotrexate",             "brand": "Trexall" },
    "hydroxychloroquine":       { "display": "Hydroxychloroquine (Generic Plaquenil)","slug": "hydroxychloroquine",       "brand": "Plaquenil" },
    "leflunomide":              { "display": "Leflunomide (Generic Arava)",           "slug": "leflunomide",              "brand": "Arava" },
    "azathioprine":             { "display": "Azathioprine (Generic Imuran)",         "slug": "azathioprine",             "brand": "Imuran" },
    "mycophenolate":            { "display": "Mycophenolate (Generic Cellcept)",      "slug": "mycophenolate-mofetil",    "brand": "Cellcept" },
    "tacrolimus":               { "display": "Tacrolimus (Generic Prograf)",          "slug": "tacrolimus",               "brand": "Prograf" },
    "cyclosporine":             { "display": "Cyclosporine (Generic Neoral)",         "slug": "cyclosporine",             "brand": "Neoral" },

    # ── Osteoporosis ──
    "alendronate":              { "display": "Alendronate (Generic Fosamax)",         "slug": "alendronate",              "brand": "Fosamax" },
    "risedronate":              { "display": "Risedronate (Generic Actonel)",         "slug": "risedronate",              "brand": "Actonel" },
    "raloxifene":               { "display": "Raloxifene (Generic Evista)",           "slug": "raloxifene",               "brand": "Evista" },

    # ── Hormones ──
    "estradiol":                { "display": "Estradiol (Generic Estrace)",           "slug": "estradiol",                "brand": "Estrace" },
    "conjugated estrogens":     { "display": "Conjugated Estrogens (Generic Premarin)","slug": "conjugated-estrogens",    "brand": "Premarin" },
    "medroxyprogesterone":      { "display": "Medroxyprogesterone (Generic Provera)", "slug": "medroxyprogesterone",      "brand": "Provera" },
    "testosterone":             { "display": "Testosterone Cypionate",                "slug": "testosterone-cypionate",   "brand": "Depo-Testosterone" },

    # ── Smoking Cessation ──
    "varenicline":              { "display": "Varenicline (Generic Chantix)",         "slug": "varenicline",              "brand": "Chantix" },

    # ── Weight ──
    "phentermine":              { "display": "Phentermine (Generic Adipex)",          "slug": "phentermine",              "brand": "Adipex" },
    "orlistat":                 { "display": "Orlistat (Generic Xenical/Alli)",       "slug": "orlistat",                 "brand": "Xenical" },

    # ── Parkinson's ──
    "carbidopa-levodopa":       { "display": "Carbidopa/Levodopa (Generic Sinemet)",  "slug": "carbidopa-levodopa",       "brand": "Sinemet" },
    "pramipexole":              { "display": "Pramipexole (Generic Mirapex)",         "slug": "pramipexole",              "brand": "Mirapex" },
    "ropinirole":               { "display": "Ropinirole (Generic Requip)",           "slug": "ropinirole",               "brand": "Requip" },

    # ── Alzheimer's ──
    "donepezil":                { "display": "Donepezil (Generic Aricept)",           "slug": "donepezil",                "brand": "Aricept" },
    "memantine":                { "display": "Memantine (Generic Namenda)",           "slug": "memantine",                "brand": "Namenda" },
    "rivastigmine":             { "display": "Rivastigmine (Generic Exelon)",         "slug": "rivastigmine",             "brand": "Exelon" },
    "galantamine":              { "display": "Galantamine (Generic Razadyne)",        "slug": "galantamine",              "brand": "Razadyne" },

    # ── Dermatology ──
    "isotretinoin":             { "display": "Isotretinoin (Generic Accutane)",       "slug": "isotretinoin",             "brand": "Accutane" },

    # ── Addiction ──
    "acamprosate":              { "display": "Acamprosate (Generic Campral)",         "slug": "acamprosate",              "brand": "Campral" },
    "disulfiram":               { "display": "Disulfiram (Generic Antabuse)",         "slug": "disulfiram",               "brand": "Antabuse" },

    # ── MS ──
    "dimethyl fumarate":        { "display": "Dimethyl Fumarate (Generic Tecfidera)", "slug": "dimethyl-fumarate",        "brand": "Tecfidera" },
    "teriflunomide":            { "display": "Teriflunomide (Aubagio)",               "slug": "teriflunomide",            "brand": "Aubagio" },
    "fingolimod":               { "display": "Fingolimod (Generic Gilenya)",          "slug": "fingolimod",               "brand": "Gilenya" },

    # ── Supplements / Minerals ──
    "ferrous sulfate":          { "display": "Ferrous Sulfate (Iron)",                "slug": "ferrous-sulfate",          "brand": "Feosol" },
    "folic acid":               { "display": "Folic Acid",                            "slug": "folic-acid",               "brand": "Folic Acid" },
    "potassium chloride":       { "display": "Potassium Chloride (Generic Klor-Con)", "slug": "potassium-chloride",       "brand": "Klor-Con" },
    "cholecalciferol":          { "display": "Vitamin D3 (Cholecalciferol)",          "slug": "cholecalciferol",          "brand": "Vitamin D3" },
}


def get_display_name(drug_key: str) -> str:
    """Get consumer-friendly display name for autocomplete."""
    entry = DRUG_NAMES.get(drug_key.lower())
    if entry:
        return entry["display"]
    # Fallback: capitalize nicely
    return drug_key.title()


def get_goodrx_slug(drug_key: str) -> str:
    """Get GoodRx URL slug for scraping."""
    entry = DRUG_NAMES.get(drug_key.lower())
    if entry:
        return entry["slug"]
    # Fallback: replace spaces with hyphens
    return drug_key.lower().replace(" ", "-")


def get_brand_name(drug_key: str) -> str:
    """Get brand name."""
    entry = DRUG_NAMES.get(drug_key.lower())
    return entry["brand"] if entry else ""


if __name__ == "__main__":
    print(f"Drug name mappings: {len(DRUG_NAMES)}")
    # Show a few examples
    for key in ["metformin", "atorvastatin", "amphetamine salts", "levothyroxine"]:
        e = DRUG_NAMES[key]
        print(f"  {key:30s} → display: '{e['display']}'  slug: '{e['slug']}'")