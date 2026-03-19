from drug_names import DRUG_NAMES

def canonicalize(name: str) -> str:
    if not name:
        return ""
    key = name.lower().strip()

    if key in DRUG_NAMES:
        return key

    for k, v in DRUG_NAMES.items():
        if key == v.get("brand","").lower():
            return k

    return key
