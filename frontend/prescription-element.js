// prescription-element.js
class PrescriptionEconomics extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.isPremium = false;
    this.demoUsed = false;
    this.filteredDrugs = [];
    this.selectedDrug = '';
    this.selectedNdc = '';
    this.pricingSource = null;
    this.householdMeds = [];

    // Local cache for strength fallback only
    this.drugCache = [
      { drug: 'Lisinopril', strengths: ['2.5mg', '5mg', '10mg', '20mg', '30mg', '40mg'], ndc: '00093-4156-01' },
      { drug: 'Metformin', strengths: ['500mg', '750mg', '850mg', '1000mg'], ndc: '00093-7207-01' },
      { drug: 'Atorvastatin', strengths: ['10mg', '20mg', '40mg', '80mg'], ndc: '00071-0156-23' },
      { drug: 'Amlodipine', strengths: ['2.5mg', '5mg', '10mg'], ndc: '00093-3151-01' },
      { drug: 'Levothyroxine', strengths: ['25mcg', '50mcg', '75mcg', '88mcg', '100mcg', '112mcg', '125mcg', '137mcg', '150mcg'], ndc: '00093-7148-01' },
      { drug: 'Omeprazole', strengths: ['10mg', '20mg', '40mg'], ndc: '00093-3138-01' },
      { drug: 'Simvastatin', strengths: ['5mg', '10mg', '20mg', '40mg', '80mg'], ndc: '00093-4146-01' },
      { drug: 'Losartan', strengths: ['25mg', '50mg', '100mg'], ndc: '00093-4152-01' },
      { drug: 'Albuterol', strengths: ['90mcg', '108mcg', '200mcg'], ndc: '00093-3157-01' },
      { drug: 'Gabapentin', strengths: ['100mg', '300mg', '400mg', '600mg', '800mg'], ndc: '00093-4151-01' }
    ];

    // Store API results grouped by drug name for dosage population
    this.apiDrugVariants = {};
  }

  connectedCallback() {
    this.demoUsed = localStorage.getItem('transparentrx_demo_used') === 'true';
    this.householdMeds = JSON.parse(localStorage.getItem('transparentrx_household') || '[]');
    this.render();
    this.setupEventListeners();
  }

  async handleDrugInput() {
    const input = this.shadowRoot.getElementById('drug');
    const value = input.value.trim();
    const dropdown = this.shadowRoot.getElementById('autocompleteDropdown');

    if (value.length < 2) {
      dropdown.style.display = 'none';
      return;
    }

    try {
      const res = await fetch(
        `https://transparentrx-pricing.kellybhorak.workers.dev/api/search?q=${encodeURIComponent(value)}`
      );

      if (!res.ok) throw new Error('Search failed');
      const results = await res.json();

      // Group results by base drug name, preserving all variants (strength + form + ndc)
      const groupMap = new Map();
      this.apiDrugVariants = {};

      (results || []).forEach(item => {
        const baseName = (item.display || item.name || '').split(' ')[0];
        const key = baseName.toLowerCase();

        if (!groupMap.has(key)) {
          groupMap.set(key, {
            display: baseName,
            ndc: item.ndc,
            variants: []
          });
          this.apiDrugVariants[key] = [];
        }

        groupMap.get(key).variants.push(item);
        this.apiDrugVariants[key].push(item);
      });

      this.filteredDrugs = Array.from(groupMap.values());

      if (this.filteredDrugs.length > 0) {
        dropdown.innerHTML = this.filteredDrugs.map(item => `
          <div class="autocomplete-item" data-drug="${item.display}" data-ndc="${item.ndc}" data-key="${item.display.toLowerCase().split(' ')[0]}">
            <strong>${item.display}</strong>
            <span class="autocomplete-count">${item.variants.length} strength${item.variants.length !== 1 ? 's' : ''} available</span>
          </div>
        `).join('');

        dropdown.style.display = 'block';

        dropdown.querySelectorAll('.autocomplete-item').forEach(el => {
          el.addEventListener('click', () => {
            this.selectDrug(el.dataset.drug, el.dataset.ndc, el.dataset.key);
          });
        });

      } else {
        dropdown.innerHTML = '<div class="autocomplete-item autocomplete-empty">No results found</div>';
        dropdown.style.display = 'block';
      }

    } catch (err) {
      console.error("Search API error:", err);
      // Fall back to local cache
      const localResults = this.drugCache.filter(d =>
        d.drug.toLowerCase().includes(value.toLowerCase())
      );
      if (localResults.length > 0) {
        dropdown.innerHTML = localResults.map(item => `
          <div class="autocomplete-item" data-drug="${item.drug}" data-ndc="${item.ndc}" data-key="${item.drug.toLowerCase()}">
            <strong>${item.drug}</strong>
            <span class="autocomplete-count">${item.strengths.length} strengths (cached)</span>
          </div>
        `).join('');
        dropdown.style.display = 'block';
        dropdown.querySelectorAll('.autocomplete-item').forEach(el => {
          el.addEventListener('click', () => {
            this.selectDrug(el.dataset.drug, el.dataset.ndc, el.dataset.key);
          });
        });
      } else {
        dropdown.style.display = 'none';
      }
    }
  }

  selectDrug(drugName, ndc, key) {
    const drugInput = this.shadowRoot.getElementById('drug');
    drugInput.value = drugName;
    this.hideAutocomplete();
    this.selectedDrug = drugName;
    this.selectedNdc = ndc;

    const strengthSelect = this.shadowRoot.getElementById('strength');
    strengthSelect.disabled = false;
    strengthSelect.innerHTML = '';

    // Try to populate from API variants first
    const variants = this.apiDrugVariants[key] || this.apiDrugVariants[drugName.toLowerCase().split(' ')[0]];

    if (variants && variants.length > 0) {
      // Sort variants by strength numerically if possible
      const sorted = [...variants].sort((a, b) => {
        const aNum = parseFloat(a.strength || a.display || '0');
        const bNum = parseFloat(b.strength || b.display || '0');
        return aNum - bNum;
      });

      sorted.forEach(item => {
        const opt = document.createElement('option');
        const strengthLabel = item.strength || '';
        const formLabel = item.form || item.dosageForm || '';
        const display = [strengthLabel, formLabel].filter(Boolean).join(' – ');
        opt.value = display || item.display;
        opt.dataset.ndc = item.ndc;
        opt.textContent = display || item.display;
        strengthSelect.appendChild(opt);
      });

      // Set the NDC from the first/selected option immediately
      this.updateNdcFromStrength();

    } else {
      // Fallback to local cache
      const cached = this.drugCache.find(d => d.drug.toLowerCase() === drugName.toLowerCase());
      if (cached) {
        cached.strengths.forEach(s => {
          const opt = document.createElement('option');
          opt.value = s;
          opt.dataset.ndc = cached.ndc;
          opt.textContent = s;
          strengthSelect.appendChild(opt);
        });
        this.selectedNdc = cached.ndc;
      } else {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = 'No strengths found';
        strengthSelect.appendChild(opt);
      }
    }

    strengthSelect.dispatchEvent(new Event('change'));

    const notFoundView = this.shadowRoot.getElementById('notFoundView');
    if (notFoundView) notFoundView.style.display = 'none';
  }

  updateNdcFromStrength() {
    const strengthSelect = this.shadowRoot.getElementById('strength');
    const selected = strengthSelect.options[strengthSelect.selectedIndex];
    if (selected && selected.dataset.ndc) {
      this.selectedNdc = selected.dataset.ndc;
      this.shadowRoot.getElementById('drug').dataset.ndc = selected.dataset.ndc;
    }
  }

  hideAutocomplete() {
    const dropdown = this.shadowRoot.getElementById('autocompleteDropdown');
    if (dropdown) dropdown.style.display = 'none';
  }

  async getTruePrice(ndc, drug, strength, dosageForm) {
    try {
      const userPrice = parseFloat(this.shadowRoot.getElementById('price').value) || 0;
      const dailyDosage = parseFloat(this.shadowRoot.getElementById('dailyDosage').value) || 1;

      const response = await fetch(
        'https://transparentrx-pricing.kellybhorak.workers.dev/api/price',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ndc,
            userPrice,
            dailyDosage,
            drug,
            strength,
            dosageForm
          })
        }
      );

      if (!response.ok) throw new Error('Pricing API failed');

      const data = await response.json();

      return {
        truePriceLow: data.truePrice.low,
        truePriceHigh: data.truePrice.high,
        truePriceMedian: data.truePrice.mid,
        confidence: 'high',
        layers: data.layers || [],
        sources: data.sources || ['NADAC', 'CMS Part D', 'AWP'],
        breakEven: data.breakEven
      };

    } catch (error) {
      console.error('Pricing engine error:', error);
      return this.getFallbackPricing(drug, strength);
    }
  }

  getFallbackPricing(drug, strength) {
    const userPrice = parseFloat(this.shadowRoot.getElementById('price').value) || 18;
    const basePrice = userPrice > 0 ? userPrice : 18.00;
    return {
      truePriceLow: basePrice * 0.55,
      truePriceHigh: basePrice * 1.10,
      truePriceMedian: basePrice * 0.80,
      confidence: 'medium',
      layers: [
        { name: 'Acquisition Cost (NADAC)', value: basePrice * 0.55, description: 'What pharmacy pays wholesale' },
        { name: 'Dispensing Fee', value: basePrice * 0.10, description: 'Pharmacy flat-fee per fill' },
        { name: 'Pharmacy Margin', value: basePrice * 0.10, description: 'Retail markup over cost' },
        { name: 'PBM Admin Fee', value: basePrice * 0.08, description: 'Pharmacy benefit manager processing' },
        { name: 'Insurance Spread', value: basePrice * 0.17, description: 'Insurer negotiated rate above cost' }
      ],
      sources: ['NADAC (fallback)', 'CMS Part D', 'AWP'],
      breakEven: {
        monthlySavings: basePrice * 0.20,
        monthsToRecoup: 6,
        annualNetGain: basePrice * 0.20 * 12 - 144
      }
    };
  }

  render() {
    this.shadowRoot.innerHTML = `
    <style>
      :host {
        display: block;
        width: 100%;
        background: #000000;
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      }
      .page-container {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: flex-start;
        min-height: 100vh;
        width: 100%;
        background: #000000;
        padding: 2rem 1rem;
        box-sizing: border-box;
      }
      .content-wrapper {
        max-width: 1680px;
        width: 100%;
        margin: 0 auto;
      }
      .logo {
        font-size: 2rem;
        font-weight: 700;
        margin-bottom: 0.5rem;
        text-align: center;
      }
      .logo-transparent { color: #4CFC0F; }
      .logo-rx {
        background: #4CFC0F;
        color: #000000;
        padding: 0.2rem 0.5rem;
        border-radius: 8px;
      }
      .tagline {
        color: #cccccc;
        font-size: 0.875rem;
        margin-bottom: 2rem;
        text-align: center;
      }
      .dashboard {
        display: flex;
        flex-direction: column;
        gap: 1.5rem;
        width: 100%;
        margin: 2rem auto;
      }
      .sidebar {
        width: 100%;
        background: #0a0a0a;
        border-radius: 24px;
        padding: 1.5rem;
        border: 1px solid #2a2a2a;
      }
      .demo-banner {
        background: rgba(76, 252, 15, 0.1);
        border-left: 4px solid #4CFC0F;
        padding: 1rem;
        margin-bottom: 1.5rem;
        border-radius: 8px;
        font-size: 0.9rem;
        color: #ffffff;
        text-align: center;
      }
      .household-summary {
        background: #000000;
        border: 1px solid #4CFC0F;
        border-radius: 16px;
        padding: 1rem;
        margin-bottom: 1.5rem;
      }
      .household-title { color: #4CFC0F; font-size: 0.8rem; text-transform: uppercase; margin-bottom: 0.5rem; }
      .household-count { color: #ffffff; font-size: 1.2rem; font-weight: 600; }
      .household-savings { color: #4CFC0F; font-size: 1rem; }
      .input-group {
        margin-bottom: 1.5rem;
        width: 100%;
        position: relative;
      }
      .input-group label {
        display: block;
        font-size: 0.75rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: #cccccc;
        margin-bottom: 0.5rem;
      }
      .input-group input,
      .input-group select {
        width: 100%;
        padding: 0.875rem 1rem;
        background: #000000;
        border: 1px solid #2a2a2a;
        border-radius: 60px;
        color: #ffffff;
        font-size: 1rem;
        transition: all 0.2s ease;
        box-sizing: border-box;
        -webkit-appearance: none;
        appearance: none;
      }
      .input-group select {
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath fill='%234CFC0F' d='M1 1l5 5 5-5'/%3E%3C/svg%3E");
        background-repeat: no-repeat;
        background-position: right 1rem center;
        padding-right: 2.5rem;
        cursor: pointer;
      }
      .input-group select:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      .input-group select option {
        background: #0a0a0a;
        color: #ffffff;
        padding: 0.5rem;
      }
      .input-group input:focus,
      .input-group select:focus {
        outline: none;
        border-color: #4CFC0F;
        box-shadow: 0 0 0 2px rgba(76, 252, 15, 0.25);
      }
      #price { font-size: 1.25rem; font-weight: 600; }
      input[type=number]::-webkit-inner-spin-button,
      input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
      input[type=number] { -moz-appearance: textfield; appearance: textfield; }
      .number-input { position: relative; display: flex; align-items: center; }
      .number-input input { padding-right: 3.5rem; }
      .number-spinners {
        position: absolute;
        right: 8px;
        display: flex;
        flex-direction: column;
        height: 100%;
        justify-content: center;
      }
      .spinner-up, .spinner-down {
        background: #000000;
        border: 1px solid #2a2a2a;
        width: 28px;
        height: 22px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        color: #cccccc;
        font-size: 12px;
        user-select: none;
        transition: all 0.2s ease;
      }
      .spinner-up { border-radius: 6px 6px 0 0; margin-bottom: 1px; }
      .spinner-down { border-radius: 0 0 6px 6px; }
      .spinner-up:hover, .spinner-down:hover { background: #4CFC0F; color: #000000; border-color: #4CFC0F; }
      .duration-selector {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 0.5rem;
        margin-top: 0.75rem;
      }
      .duration-btn {
        padding: 0.625rem;
        background: #000000;
        border: 1px solid #2a2a2a;
        border-radius: 60px;
        color: #cccccc;
        cursor: pointer;
        transition: all 0.2s ease;
        text-align: center;
        font-size: 0.875rem;
      }
      .duration-btn:hover { border-color: #4CFC0F; color: #4CFC0F; }
      .duration-btn.active { background: #4CFC0F; color: #000000; border-color: #4CFC0F; }
      .dosage-form-selector {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 0.5rem;
        margin-top: 0.5rem;
      }
      .form-btn {
        padding: 0.5rem;
        background: #000000;
        border: 1px solid #2a2a2a;
        border-radius: 30px;
        color: #cccccc;
        cursor: pointer;
        transition: all 0.2s ease;
        text-align: center;
        font-size: 0.8rem;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .form-btn:hover { border-color: #4CFC0F; color: #4CFC0F; }
      .form-btn.active { background: #4CFC0F; color: #000000; border-color: #4CFC0F; }
      .add-household-btn {
        width: 100%;
        padding: 0.75rem;
        background: transparent;
        color: #4CFC0F;
        border: 1px dashed #4CFC0F;
        border-radius: 60px;
        font-size: 0.9rem;
        cursor: pointer;
        margin-top: 1rem;
        transition: all 0.2s ease;
      }
      .add-household-btn:hover { background: rgba(76, 252, 15, 0.1); }
      .calculated-field {
        background: #000000;
        border: 1px solid #2a2a2a;
        padding: 1rem;
        border-radius: 16px;
        margin-top: 0.25rem;
        color: #ffffff;
      }
      .calculated-field .label { font-size: 0.75rem; color: #cccccc; text-transform: uppercase; margin-bottom: 0.25rem; }
      .calculated-field .value { font-size: 1.5rem; font-weight: 600; color: #4CFC0F; display: inline-block; }
      .calculated-field .unit { font-size: 0.875rem; color: #cccccc; margin-left: 0.5rem; }
      .analyze-btn {
        width: 100%;
        padding: 1.25rem 2rem;
        background: #4CFC0F;
        color: #000000;
        border: none;
        border-radius: 60px;
        font-weight: 700;
        font-size: 1rem;
        cursor: pointer;
        transition: all 0.3s ease;
        margin-top: 1rem;
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }
      .analyze-btn:hover {
        background: #5eff20;
        transform: translateY(-2px);
        box-shadow: 0 10px 20px -5px rgba(76, 252, 15, 0.3);
      }
      .main-content {
        width: 100%;
        background: #0a0a0a;
        border-radius: 24px;
        padding: 1.5rem;
        border: 1px solid #2a2a2a;
      }
      .trueprice-container {
        background: #000000;
        border: 1px solid #4CFC0F;
        border-radius: 16px;
        padding: 1.5rem;
        margin-bottom: 2rem;
      }
      .trueprice-title { color: #4CFC0F; font-size: 0.9rem; text-transform: uppercase; margin-bottom: 1rem; }
      .price-range {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin: 1rem 0;
      }
      .range-low, .range-high { font-size: 1.5rem; font-weight: 600; }
      .range-low { color: #4CFC0F; }
      .range-high { color: #ff4444; }
      .range-bar {
        flex: 1;
        height: 8px;
        background: #2a2a2a;
        margin: 0 1rem;
        border-radius: 4px;
        position: relative;
      }
      .range-fill {
        position: absolute;
        height: 100%;
        background: linear-gradient(90deg, #4CFC0F, #ffaa00, #ff4444);
        border-radius: 4px;
        width: 70%;
      }
      .confidence-badge {
        display: inline-block;
        padding: 0.25rem 0.75rem;
        background: rgba(76, 252, 15, 0.1);
        border: 1px solid #4CFC0F;
        border-radius: 20px;
        font-size: 0.75rem;
        color: #4CFC0F;
      }
      .data-freshness {
        display: inline-block;
        padding: 0.25rem 0.75rem;
        background: rgba(100, 100, 255, 0.1);
        border: 1px solid #6464ff;
        border-radius: 20px;
        font-size: 0.75rem;
        color: #aaaaff;
        margin-left: 0.5rem;
      }
      .layers-container { margin: 1.5rem 0; }
      .layer-item {
        display: flex;
        justify-content: space-between;
        padding: 0.75rem 0;
        border-bottom: 1px solid #2a2a2a;
      }
      .layer-name { color: #cccccc; }
      .layer-value { color: #ffffff; font-weight: 500; }
      .layer-desc { font-size: 0.8rem; color: #666; margin-top: 0.25rem; }
      .breakeven-container {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 1rem;
        margin: 1.5rem 0;
      }
      .be-card {
        background: #0a0a0a;
        border: 1px solid #2a2a2a;
        border-radius: 12px;
        padding: 1rem;
        text-align: center;
      }
      .be-label { font-size: 0.75rem; color: #cccccc; text-transform: uppercase; margin-bottom: 0.5rem; }
      .be-value { font-size: 1.5rem; font-weight: 600; color: #4CFC0F; }
      .be-positive { color: #4CFC0F; }
      .be-negative { color: #ff4444; }
      .value-prop {
        display: grid;
        grid-template-columns: 1fr;
        gap: 1rem;
        margin: 2rem 0;
      }
      .value-card {
        background: #000000;
        border: 1px solid #2a2a2a;
        border-radius: 16px;
        padding: 1.5rem;
        text-align: center;
      }
      .value-card h3 { color: #4CFC0F; margin-bottom: 0.5rem; font-size: 1.1rem; }
      .value-card p { color: #cccccc; font-size: 0.9rem; margin: 0; }
      .results-container { display: none; width: 100%; }
      .result-card {
        background: #000000;
        border: 1px solid #2a2a2a;
        border-radius: 16px;
        padding: 1.5rem;
        margin-bottom: 1rem;
        text-align: center;
      }
      .result-card.premium { border-color: #4CFC0F; box-shadow: 0 0 20px rgba(76, 252, 15, 0.1); }
      .result-title { font-size: 0.9rem; color: #cccccc; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.5rem; }
      .result-value { font-size: 2rem; font-weight: 700; color: #4CFC0F; margin-bottom: 0.5rem; }

      /* Autocomplete */
      .autocomplete-dropdown {
        position: absolute;
        top: calc(100% + 4px);
        left: 0;
        right: 0;
        background: #0a0a0a;
        border: 1px solid #2a2a2a;
        border-radius: 16px;
        max-height: 280px;
        overflow-y: auto;
        z-index: 1000;
        display: none;
        box-shadow: 0 20px 40px -10px rgba(0,0,0,0.8);
      }
      .autocomplete-item {
        padding: 0.875rem 1rem;
        cursor: pointer;
        border-bottom: 1px solid #1a1a1a;
        color: #ffffff;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      .autocomplete-item:last-child { border-bottom: none; }
      .autocomplete-item:hover { background: #111111; }
      .autocomplete-item:hover strong { color: #4CFC0F; }
      .autocomplete-item strong { color: #ffffff; transition: color 0.15s; }
      .autocomplete-count { font-size: 0.75rem; color: #666; }
      .autocomplete-empty { color: #666; cursor: default; font-size: 0.9rem; }
      .autocomplete-empty:hover { background: transparent; }

      /* Strength hint */
      .strength-hint {
        font-size: 0.75rem;
        color: #4CFC0F;
        margin-top: 0.4rem;
        padding-left: 1rem;
        display: none;
      }
      .strength-hint.visible { display: block; }

      @media (min-width: 768px) {
        .dashboard { flex-direction: row; align-items: flex-start; gap: 2rem; }
        .sidebar { width: 320px; min-width: 300px; position: sticky; top: 1rem; }
        .main-content { flex: 1; min-width: 0; }
      }
      @media (min-width: 1200px) {
        .sidebar { width: 420px; }
        .main-content { padding: 2.5rem 3rem; }
      }
      @media (max-width: 767px) {
        .page-container { padding: 1rem 0.75rem; }
        .sidebar, .main-content { padding: 1.25rem; border-radius: 18px; }
        .logo { font-size: 1.6rem; }
        .analyze-btn { position: sticky; bottom: 0; margin-top: 1.5rem; z-index: 20; }
      }
      @media (max-width: 380px) {
        .dosage-form-selector { grid-template-columns: repeat(2, 1fr); }
        .breakeven-container { grid-template-columns: 1fr; }
      }
      .main-content h1, .main-content h2, .main-content p {
        max-width: 900px;
        margin-left: auto;
        margin-right: auto;
      }
      .loading-overlay {
        position: fixed;
        top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(0,0,0,0.9);
        backdrop-filter: blur(8px);
        display: none;
        align-items: center;
        justify-content: center;
        z-index: 9999;
        flex-direction: column;
        gap: 1rem;
      }
      .loading-spinner {
        width: 50px; height: 50px;
        border: 4px solid #2a2a2a;
        border-top-color: #4CFC0F;
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
      }
      .loading-text { color: #4CFC0F; font-size: 0.9rem; }
      @keyframes spin { to { transform: rotate(360deg); } }
      .error-message {
        background: rgba(255, 68, 68, 0.1);
        color: #ff4444;
        padding: 1rem 1.5rem;
        border-radius: 60px;
        margin-bottom: 1.5rem;
        display: none;
        border: 1px solid #ff4444;
        text-align: center;
        font-size: 0.875rem;
      }
      .feedback-section {
        background: #000000;
        border: 1px solid #2a2a2a;
        border-radius: 16px;
        padding: 1.5rem;
        margin-top: 2rem;
        text-align: center;
      }
      .feedback-section h3 { color: #4CFC0F; margin-bottom: 1rem; }
      .feedback-btn {
        padding: 0.875rem 1.5rem;
        background: transparent;
        color: #4CFC0F;
        border: 2px solid #4CFC0F;
        border-radius: 60px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.3s ease;
      }
      .feedback-btn:hover { background: #4CFC0F; color: #000000; }
      .disclaimer {
        font-size: 0.7rem;
        color: #999999;
        text-align: center;
        margin-top: 2rem;
        padding-top: 1rem;
        border-top: 1px solid #2a2a2a;
      }
    </style>

    <div class="page-container">
      <div class="content-wrapper">
        <div class="logo">
          <span class="logo-transparent">Transparent</span>
          <span class="logo-rx">RX</span> .io
        </div>
        <div class="tagline">proprietary TruePrice™ intelligence · break-even analytics</div>

        <div class="loading-overlay" id="loading">
          <div class="loading-spinner"></div>
          <div class="loading-text" id="loadingText">Fetching live pricing data...</div>
        </div>

        <div class="dashboard">
          <div class="sidebar">
            <div class="demo-banner">
              <strong>✨ One free TruePrice™ analysis.</strong> See what you're really paying.
            </div>

            <div class="household-summary" id="householdSummary" style="display: none;">
              <div class="household-title">Household Summary</div>
              <div class="household-count" id="householdCount">0 medications</div>
              <div class="household-savings" id="householdSavings">Potential savings: $0/year</div>
            </div>

            <div class="error-message" id="errorMessage"></div>

            <!-- Drug name with autocomplete -->
            <div class="input-group">
              <label>Drug Name</label>
              <input id="drug" type="text" placeholder="Type to search..." autocomplete="off">
              <div class="autocomplete-dropdown" id="autocompleteDropdown"></div>
            </div>

            <!-- Dosage Strength — now populated from API -->
            <div class="input-group">
              <label>Dosage Strength</label>
              <select id="strength" disabled>
                <option value="">Select drug first</option>
              </select>
              <div class="strength-hint" id="strengthHint">Select a strength to use its exact NDC for pricing</div>
            </div>

            <!-- Dosage Form -->
            <div class="input-group">
              <label>Dosage Form</label>
              <div class="dosage-form-selector" id="dosageFormSelector">
                <div class="form-btn active" data-form="tablet">Tablet</div>
                <div class="form-btn" data-form="capsule">Capsule</div>
                <div class="form-btn" data-form="liquid">Liquid</div>
                <div class="form-btn" data-form="injectable">Injectable</div>
                <div class="form-btn" data-form="cream">Cream</div>
                <div class="form-btn" data-form="ointment">Ointment</div>
                <div class="form-btn" data-form="inhaler">Inhaler</div>
                <div class="form-btn" data-form="patch">Patch</div>
                <div class="form-btn" data-form="other">Other</div>
              </div>
            </div>

            <!-- Prescription Duration -->
            <div class="input-group">
              <label>Prescription Duration (days)</label>
              <div class="number-input">
                <input id="duration" type="number" value="30" min="1" max="365" step="1">
                <div class="number-spinners">
                  <div class="spinner-up" id="durationUp">▲</div>
                  <div class="spinner-down" id="durationDown">▼</div>
                </div>
              </div>
              <div class="duration-selector" id="durationPresets">
                <div class="duration-btn" data-days="15">15 days</div>
                <div class="duration-btn active" data-days="30">30 days</div>
                <div class="duration-btn" data-days="90">90 days</div>
              </div>
            </div>

            <!-- Daily dosage -->
            <div class="input-group">
              <label>Tablets per day</label>
              <div class="number-input">
                <input id="dailyDosage" type="number" value="1" min="0.25" max="10" step="0.25">
                <div class="number-spinners">
                  <div class="spinner-up" id="dailyUp">▲</div>
                  <div class="spinner-down" id="dailyDown">▼</div>
                </div>
              </div>
            </div>

            <!-- Price paid -->
            <div class="input-group">
              <label>Prescription Price ($)</label>
              <input id="price" type="number" placeholder="0.00" value="18.00" step="0.01" min="0">
            </div>

            <!-- Calculated fields -->
            <div class="input-group">
              <label>Quantity per fill</label>
              <div class="calculated-field" id="quantityPerFill">
                <div class="label">calculated</div>
                <div class="value">30</div>
                <span class="unit">units</span>
              </div>
            </div>

            <div class="input-group">
              <label>Annual units</label>
              <div class="calculated-field" id="annualTablets">
                <div class="label">calculated</div>
                <div class="value">365</div>
                <span class="unit">units/year</span>
              </div>
            </div>

            <button class="add-household-btn" id="addToHousehold">
              + Add to Household Analysis
            </button>

            <button class="analyze-btn" id="calculate">
              GENERATE TRUEPRICE™ ANALYSIS
            </button>
          </div>

          <!-- Main Content -->
          <div class="main-content">
            <div id="initialView">
              <h1 style="color: #4CFC0F; font-size: 2.5rem; text-align: center; margin-bottom: 1rem;">TruePrice™ Intelligence</h1>
              <h2 style="color: #ffffff; font-size: 1.5rem; text-align: center; margin-bottom: 2rem;">See through the pricing layers</h2>
              <p style="color: #cccccc; text-align: center; max-width: 700px; margin: 0 auto 2rem;">Most people only see the retail price. We show you the acquisition cost, PBM fees, pharmacy margins, and insurance spreads — then calculate your true economic position.</p>
              <div class="value-prop">
                <div class="value-card"><h3>TruePrice™ Range</h3><p>See the 15–35% variance in what you could be paying based on live market data.</p></div>
                <div class="value-card"><h3>Layer Analysis</h3><p>Understand exactly where each dollar goes — from pharmacy to PBM to insurer.</p></div>
                <div class="value-card"><h3>Break-Even Economics</h3><p>Know exactly when premium pays for itself, and your net annual gain.</p></div>
              </div>
            </div>

            <div id="resultsView" class="results-container">
              <div class="trueprice-container">
                <div class="trueprice-title">🔍 TruePrice™ Intelligence</div>
                <div>
                  <span class="confidence-badge" id="confidenceBadge">High Confidence</span>
                  <span class="data-freshness" id="dataFreshness">Live Data</span>
                </div>
                <div class="price-range" style="margin-top: 1rem;">
                  <span class="range-low" id="truePriceLow">$11.70</span>
                  <div class="range-bar">
                    <div class="range-fill" id="rangeFill" style="width: 70%"></div>
                  </div>
                  <span class="range-high" id="truePriceHigh">$20.70</span>
                </div>
                <div style="display: flex; justify-content: space-between; color: #666; font-size: 0.8rem;">
                  <span>Acquisition Cost</span>
                  <span>Retail Price</span>
                </div>
              </div>

              <div class="result-card">
                <div class="result-title">PRICE LAYER ANALYSIS</div>
                <div class="layers-container" id="priceLayers"></div>
                <div style="color: #666; font-size: 0.8rem; margin-top: 1rem;" id="priceSources">Sources: NADAC · CMS Part D · AWP</div>
              </div>

              <div class="result-card premium">
                <div class="result-title">BREAK-EVEN ECONOMICS</div>
                <div class="breakeven-container" id="breakEven"></div>
                <div style="color: #4CFC0F; margin-top: 1rem;" id="netGainMessage">Premium pays for itself in 3 months</div>
              </div>

              <div class="result-card" id="householdResults" style="display: none;">
                <div class="result-title">HOUSEHOLD AGGREGATE</div>
                <div class="breakeven-container" id="householdBreakEven"></div>
              </div>

              <div class="feedback-section">
                <h3>Was this analysis valuable?</h3>
                <p style="color: #cccccc; font-size: 0.9rem;">Your feedback helps us refine our TruePrice™ algorithm.</p>
                <button class="feedback-btn" id="feedbackBtn">SHARE FEEDBACK</button>
              </div>
            </div>

            <div id="notFoundView" style="display: none;">
              <div style="background: rgba(255,68,68,0.1); border: 1px solid #ff4444; border-radius: 16px; padding: 2rem; text-align: center;">
                <h3 style="color: #ff4444; margin-bottom: 1rem;">Drug not found in database</h3>
                <p style="color: #cccccc; margin-bottom: 1.5rem;">Our AI will research this medication and add it to our TruePrice™ engine.</p>
                <button class="analyze-btn" id="aiAssistBtn" style="margin-top: 0;">ACTIVATE AI RESEARCH</button>
              </div>
            </div>
          </div>
        </div>

        <div class="disclaimer">
          TruePrice™ is a proprietary algorithm based on NADAC, CMS Part D, AWP, and live market intelligence. Not medical advice. Actual prices may vary by pharmacy and location.
        </div>
      </div>
    </div>
    `;
  }

  setupEventListeners() {
    // Drug search
    const drugInput = this.shadowRoot.getElementById('drug');
    let searchTimeout;
    drugInput.addEventListener('input', () => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => this.handleDrugInput(), 250);
    });
    drugInput.addEventListener('blur', () => {
      setTimeout(() => this.hideAutocomplete(), 200);
    });

    // Strength change — update NDC to match selected variant
    const strengthSelect = this.shadowRoot.getElementById('strength');
    strengthSelect.addEventListener('change', () => {
      this.updateNdcFromStrength();
      this.calculateQuantities();

      const hint = this.shadowRoot.getElementById('strengthHint');
      if (strengthSelect.options.length > 1) {
        hint.classList.add('visible');
        setTimeout(() => hint.classList.remove('visible'), 3000);
      }
    });

    // Dosage form selector
    const formBtns = this.shadowRoot.querySelectorAll('.form-btn');
    formBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        formBtns.forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
      });
    });

    // Duration spinners and presets
    this.shadowRoot.getElementById('durationUp').addEventListener('click', () => this.adjustDuration(1));
    this.shadowRoot.getElementById('durationDown').addEventListener('click', () => this.adjustDuration(-1));

    const durationPresets = this.shadowRoot.querySelectorAll('.duration-btn');
    durationPresets.forEach(btn => {
      btn.addEventListener('click', (e) => {
        durationPresets.forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        this.shadowRoot.getElementById('duration').value = parseInt(e.target.dataset.days);
        this.calculateQuantities();
      });
    });

    // Daily dosage spinners
    this.shadowRoot.getElementById('dailyUp').addEventListener('click', () => this.adjustDailyDosage(0.25));
    this.shadowRoot.getElementById('dailyDown').addEventListener('click', () => this.adjustDailyDosage(-0.25));

    // Recalculate quantities on any relevant input change
    ['price', 'duration', 'dailyDosage'].forEach(id => {
      this.shadowRoot.getElementById(id).addEventListener('input', () => this.calculateQuantities());
    });

    // Main action buttons
    this.shadowRoot.getElementById('calculate').addEventListener('click', () => this.calculate());
    this.shadowRoot.getElementById('addToHousehold').addEventListener('click', () => this.addToHousehold());

    const feedbackBtn = this.shadowRoot.getElementById('feedbackBtn');
    if (feedbackBtn) {
      feedbackBtn.addEventListener('click', () => {
        window.open('mailto:feedback@transparentrx.io?subject=TruePrice%20Feedback', '_blank');
      });
    }

    const aiAssistBtn = this.shadowRoot.getElementById('aiAssistBtn');
    if (aiAssistBtn) {
      aiAssistBtn.addEventListener('click', () => this.requestAIAssist());
    }

    this.calculateQuantities();
    this.updateHouseholdSummary();
  }

  adjustDuration(delta) {
    const input = this.shadowRoot.getElementById('duration');
    const newValue = parseInt(input.value) + delta;
    if (newValue >= 1 && newValue <= 365) {
      input.value = newValue;
      this.shadowRoot.querySelectorAll('.duration-btn').forEach(btn => {
        btn.classList.toggle('active', parseInt(btn.dataset.days) === newValue);
      });
      this.calculateQuantities();
    }
  }

  adjustDailyDosage(delta) {
    const input = this.shadowRoot.getElementById('dailyDosage');
    const newValue = Math.round((parseFloat(input.value) + delta) * 4) / 4;
    if (newValue >= 0.25 && newValue <= 10) {
      input.value = newValue;
      this.calculateQuantities();
    }
  }

  calculateQuantities() {
    const duration = parseInt(this.shadowRoot.getElementById('duration').value) || 30;
    const dailyDosage = parseFloat(this.shadowRoot.getElementById('dailyDosage').value) || 1;
    const quantityPerFill = Math.ceil(duration * dailyDosage);
    const annualUnits = Math.round(365 * dailyDosage);

    const qEl = this.shadowRoot.getElementById('quantityPerFill');
    if (qEl) qEl.innerHTML = `<div class="label">calculated</div><div class="value">${quantityPerFill}</div><span class="unit">units</span>`;

    const aEl = this.shadowRoot.getElementById('annualTablets');
    if (aEl) aEl.innerHTML = `<div class="label">calculated</div><div class="value">${annualUnits}</div><span class="unit">units/year</span>`;
  }

  async calculate() {
    const drug = this.shadowRoot.getElementById('drug').value.trim();
    const strengthSelect = this.shadowRoot.getElementById('strength');
    const strength = strengthSelect.value;
    const price = parseFloat(this.shadowRoot.getElementById('price').value);
    const duration = parseInt(this.shadowRoot.getElementById('duration').value);
    const dailyDosage = parseFloat(this.shadowRoot.getElementById('dailyDosage').value);
    const activeFormBtn = this.shadowRoot.querySelector('.form-btn.active');
    const dosageForm = activeFormBtn ? activeFormBtn.dataset.form : 'tablet';

    // Use the NDC from the currently selected strength option
    const selectedOption = strengthSelect.options[strengthSelect.selectedIndex];
    const ndc = (selectedOption && selectedOption.dataset.ndc) || this.selectedNdc || this.shadowRoot.getElementById('drug').dataset.ndc;

    if (!drug) { this.showError("Please search for and select a drug."); return; }
    if (!strength) { this.showError("Please select a dosage strength."); return; }
    if (!price || isNaN(price)) { this.showError("Please enter the prescription price."); return; }
    if (!duration || !dailyDosage) { this.showError("Please complete duration and daily dosage fields."); return; }

    if (this.demoUsed && !this.isPremium) {
      this.showError("Free demo used. Upgrade for unlimited TruePrice™ analysis.");
      return;
    }

    this.showLoading(true, 'Fetching live pricing data...');

    try {
      const truePrice = await this.getTruePrice(ndc, drug, strength, dosageForm);

      const annualCost = price * (365 / duration) * (duration * dailyDosage);
      const truePriceAnnualLow = truePrice.truePriceLow * 365 * dailyDosage;
      const potentialSavings = Math.max(0, annualCost - truePriceAnnualLow);
      const monthlyPremium = 12;
      const monthsToBreakeven = potentialSavings > 0
        ? Math.max(0.1, monthlyPremium / (potentialSavings / 12)).toFixed(1)
        : 'N/A';
      const annualNetGain = potentialSavings - (monthlyPremium * 12);

      this.showResults({
        truePriceLow: truePrice.truePriceLow,
        truePriceHigh: truePrice.truePriceHigh,
        truePriceMedian: truePrice.truePriceMedian,
        layers: truePrice.layers,
        confidence: truePrice.confidence,
        sources: truePrice.sources,
        annualCost,
        potentialSavings,
        monthsToBreakeven,
        annualNetGain
      });

      if (!this.isPremium) {
        this.demoUsed = true;
        localStorage.setItem('transparentrx_demo_used', 'true');
      }

      this.dispatchEvent(new CustomEvent('calculation-complete', {
        detail: { drug, strength, ndc, annualCost, potentialSavings },
        bubbles: true,
        composed: true
      }));

    } catch (error) {
      console.error("TruePrice engine error:", error);
      this.showError("TruePrice™ analysis unavailable. Please try again.");
    } finally {
      this.showLoading(false);
    }
  }

  showResults(data) {
    this.shadowRoot.getElementById('initialView').style.display = 'none';
    const notFoundView = this.shadowRoot.getElementById('notFoundView');
    if (notFoundView) notFoundView.style.display = 'none';

    const resultsView = this.shadowRoot.getElementById('resultsView');
    resultsView.style.display = 'block';

    // Confidence badge
    const badge = this.shadowRoot.getElementById('confidenceBadge');
    if (badge) badge.textContent = data.confidence === 'high' ? '🔒 High Confidence' : '📊 Medium Confidence';

    // Data freshness
    const freshness = this.shadowRoot.getElementById('dataFreshness');
    if (freshness) freshness.textContent = data.confidence === 'high' ? '🟢 Live Data' : '🟡 Cached Estimate';

    // Price range
    this.shadowRoot.getElementById('truePriceLow').textContent = `$${data.truePriceLow.toFixed(2)}`;
    this.shadowRoot.getElementById('truePriceHigh').textContent = `$${data.truePriceHigh.toFixed(2)}`;

    const spread = Math.min(((data.truePriceHigh - data.truePriceLow) / Math.max(data.truePriceLow, 0.01)) * 100, 100);
    const rangeFill = this.shadowRoot.getElementById('rangeFill');
    if (rangeFill) rangeFill.style.width = `${Math.max(spread, 10)}%`;

    // Price layers
    const layersEl = this.shadowRoot.getElementById('priceLayers');
    if (layersEl && data.layers && data.layers.length > 0) {
      layersEl.innerHTML = data.layers.map(layer => `
        <div class="layer-item">
          <div>
            <div class="layer-name">${layer.name}</div>
            <div class="layer-desc">${layer.description || ''}</div>
          </div>
          <span class="layer-value">$${parseFloat(layer.value).toFixed(2)}</span>
        </div>
      `).join('');
    }

    const sourcesEl = this.shadowRoot.getElementById('priceSources');
    if (sourcesEl && data.sources) sourcesEl.textContent = `Sources: ${data.sources.join(' · ')}`;

    // Break-even
    const beEl = this.shadowRoot.getElementById('breakEven');
    if (beEl) {
      beEl.innerHTML = `
        <div class="be-card">
          <div class="be-label">Potential Annual Savings</div>
          <div class="be-value be-positive">$${data.potentialSavings.toFixed(2)}</div>
        </div>
        <div class="be-card">
          <div class="be-label">Months to Break-Even</div>
          <div class="be-value">${data.monthsToBreakeven}</div>
        </div>
        <div class="be-card">
          <div class="be-label">Net Annual Gain</div>
          <div class="be-value ${data.annualNetGain > 0 ? 'be-positive' : 'be-negative'}">
            $${data.annualNetGain.toFixed(2)}
          </div>
        </div>
      `;
    }

    const netGainEl = this.shadowRoot.getElementById('netGainMessage');
    if (netGainEl) {
      if (data.annualNetGain > 0) {
        netGainEl.textContent = `✨ Premium pays for itself in ${data.monthsToBreakeven} months — net gain of $${data.annualNetGain.toFixed(2)}/year`;
        netGainEl.style.color = '#4CFC0F';
      } else {
        netGainEl.textContent = '⚠️ Limited savings for this medication alone. Add household medications for aggregate economics.';
        netGainEl.style.color = '#ffaa00';
      }
    }

    this.updateHouseholdSummary();
  }

  addToHousehold() {
    const drug = this.shadowRoot.getElementById('drug').value.trim();
    const strength = this.shadowRoot.getElementById('strength').value;
    const price = parseFloat(this.shadowRoot.getElementById('price').value);
    const dailyDosage = parseFloat(this.shadowRoot.getElementById('dailyDosage').value);

    if (!drug || !strength || !price) {
      this.showError("Complete medication details before adding to household.");
      return;
    }

    const annualCost = price * (365 / 30) * dailyDosage;
    this.householdMeds.push({ drug, strength, annualCost, dailyDosage, price });
    localStorage.setItem('transparentrx_household', JSON.stringify(this.householdMeds));
    this.updateHouseholdSummary();
    this.showError(`${drug} ${strength} added to household analysis.`);
  }

  updateHouseholdSummary() {
    const summaryEl = this.shadowRoot.getElementById('householdSummary');
    const countEl = this.shadowRoot.getElementById('householdCount');
    const savingsEl = this.shadowRoot.getElementById('householdSavings');
    const householdResults = this.shadowRoot.getElementById('householdResults');

    if (this.householdMeds.length > 0) {
      summaryEl.style.display = 'block';
      countEl.textContent = `${this.householdMeds.length} medication${this.householdMeds.length !== 1 ? 's' : ''}`;
      const totalAnnualCost = this.householdMeds.reduce((sum, m) => sum + m.annualCost, 0);
      const estimatedSavings = totalAnnualCost * 0.2;
      savingsEl.textContent = `Potential savings: $${estimatedSavings.toFixed(2)}/year`;

      if (this.householdMeds.length > 1 && householdResults) {
        householdResults.style.display = 'block';
        const householdBE = this.shadowRoot.getElementById('householdBreakEven');
        if (householdBE) {
          const netGain = estimatedSavings - 144;
          householdBE.innerHTML = `
            <div class="be-card">
              <div class="be-label">Household Annual Cost</div>
              <div class="be-value">$${totalAnnualCost.toFixed(2)}</div>
            </div>
            <div class="be-card">
              <div class="be-label">Total Potential Savings</div>
              <div class="be-value be-positive">$${estimatedSavings.toFixed(2)}</div>
            </div>
            <div class="be-card">
              <div class="be-label">Net Gain (Premium)</div>
              <div class="be-value ${netGain > 0 ? 'be-positive' : 'be-negative'}">$${netGain.toFixed(2)}</div>
            </div>
          `;
        }
      }
    } else {
      summaryEl.style.display = 'none';
      if (householdResults) householdResults.style.display = 'none';
    }
  }

  requestAIAssist() {
    const drug = this.shadowRoot.getElementById('drug').value.trim();
    if (!drug) { this.showError("Enter a drug name for AI research."); return; }
    this.showLoading(true, 'Initiating AI research...');
    this.dispatchEvent(new CustomEvent('ai-assist', { detail: { drug }, bubbles: true, composed: true }));
    setTimeout(() => {
      this.showLoading(false);
      this.showAIAssistResult(drug);
    }, 2000);
  }

  showAIAssistResult(drug) {
    const notFoundView = this.shadowRoot.getElementById('notFoundView');
    if (notFoundView) {
      notFoundView.innerHTML = `
        <div style="background: rgba(76,252,15,0.1); border: 1px solid #4CFC0F; border-radius: 16px; padding: 2rem; text-align: center;">
          <h3 style="color: #4CFC0F; margin-bottom: 1rem;">✅ AI Research Initiated</h3>
          <p style="color: #cccccc; margin-bottom: 1.5rem;">Our TruePrice™ engine is researching "${drug}". You'll be notified when pricing data is available.</p>
          <button class="analyze-btn" id="tryAgainBtn" style="margin-top: 1rem; background: transparent; border: 2px solid #4CFC0F; color: #4CFC0F;">← SEARCH ANOTHER</button>
        </div>
      `;
      notFoundView.querySelector('#tryAgainBtn')?.addEventListener('click', () => {
        notFoundView.style.display = 'none';
        this.shadowRoot.getElementById('initialView').style.display = 'block';
        this.shadowRoot.getElementById('drug').value = '';
        this.shadowRoot.getElementById('drug').focus();
      });
    }
  }

  showError(message) {
    const el = this.shadowRoot.getElementById('errorMessage');
    if (el) {
      el.textContent = message;
      el.style.display = 'block';
      setTimeout(() => el.style.display = 'none', 5000);
    }
  }

  showLoading(show, text = 'Fetching live pricing data...') {
    const loader = this.shadowRoot.getElementById('loading');
    const loadingText = this.shadowRoot.getElementById('loadingText');
    if (loader) loader.style.display = show ? 'flex' : 'none';
    if (loadingText) loadingText.textContent = text;
  }

  setPremiumStatus(isPremium) {
    this.isPremium = isPremium;
  }
}

customElements.define('prescription-economics', PrescriptionEconomics);
