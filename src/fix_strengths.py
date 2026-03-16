content = open('/Users/kellyhorak/transparentrx-worker/src/index.ts').read()

old = """    const rows = result.results || []

    return json(rows.map((r: any) => ({
      ndc:      r.ndc,
      strength: r.strength || '',
      form:     r.dosage_form || '',
    })))"""

new = """    const rows = result.results || []

    function normalizeStrength(s: string): string {
      return (s || '').toLowerCase().replace(/\\/1/g,'').replace(/\\s+/g,' ').trim()
    }
    function normalizeForm(f: string): string {
      return (f || '').toLowerCase()
        .replace(/film.?coated/g,'').replace(/scored/g,'')
        .replace(/oral/g,'').replace(/tablets?/g,'tablet')
        .replace(/capsules?/g,'capsule').replace(/\\s+/g,' ').trim()
    }

    const clusterMap = new Map()
    for (const r of rows) {
      const strength = normalizeStrength(r.strength)
      const form = normalizeForm(r.dosage_form)
      if (strength.includes(';')) continue
      const key = `${strength}|${form}`
      if (!clusterMap.has(key)) {
        clusterMap.set(key, { ndc: r.ndc, strength, form })
      }
    }

    const clustered = Array.from(clusterMap.values())
      .sort((a: any, b: any) => parseFloat(a.strength) - parseFloat(b.strength))

    return json(clustered.map((r: any) => ({
      ndc:      r.ndc,
      strength: r.strength,
      form:     r.form,
    })))"""

if old in content:
    content = content.replace(old, new)
    open('/Users/kellyhorak/transparentrx-worker/src/index.ts', 'w').write(content)
    print("Done")
else:
    print("Pattern not found - printing current code around strengths:")
    idx = content.find("const rows = result.results || []")
    print(repr(content[idx:idx+300]))