// prescription-element.js - Complete TransparentRx Calculator with TransDex UI
class PrescriptionEconomics extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.isPremium = false;
    this.demoUsed = false;
    this.filteredDrugs = [];
    this.selectedDrug = '';
    this.selectedNdc = '';
    this.selectedStrength = '';
    this.userEmail = localStorage.getItem('trx_email') || '';
    
    // 🔥 ADD STATE (1)
    this.selectedDrugData = null;
    this.selectedNdc = '';
    
    // 🔥 STEP 6 — PREVENT DOUBLE CALLS
    this._calculating = false;
  }

  // 🔥 CANONICAL DRUG NORMALIZER
  normalizeDrugName(raw) {
    if (!raw) return '';

    return raw
      .toLowerCase()
      .replace(' and hydrochlorothiazide', '/hctz')
      .replace('hydrochlorothiazide', 'hctz')
      .replace(' tablets', '')
      .replace(' tablet', '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  async connectedCallback() {
    await this.checkPremiumStatus();
    this.render();
    this.attachEventListeners();
  }

  async checkPremiumStatus() {
    try {
      const res = await fetch('https://transparentrx-pricing.kellybhorak.workers.dev/api/user-status', {
        credentials: 'include'
      });
      const data = await res.json();
      this.isPremium = data.premium === true;
      if (data.email) {
        this.userEmail = data.email;
        localStorage.setItem('trx_email', data.email);
      }
    } catch (err) {
      console.log('Premium check failed, assuming free user');
      this.isPremium = false;
    }
  }

  render() {
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          font-family: Inter, system-ui, sans-serif;
          color: #fff;
        }

        * {
          box-sizing: border-box;
        }

        .calculator-container {
          background: #060606;
          border: 1px solid #181818;
          border-radius: 20px;
          padding: 24px;
        }

        h2 {
          margin-top: 0;
          margin-bottom: 20px;
          font-size: 24px;
          color: #4CFC0F;
        }

        .search-section {
          margin-bottom: 20px;
        }

        .search-input {
          width: 100%;
          padding: 12px 16px;
          font-size: 16px;
          border: 1px solid #1e1e1e;
          border-radius: 12px;
          outline: none;
          transition: border-color 0.2s;
          background: #000;
          color: #fff;
        }

        .search-input:focus {
          border-color: #4CFC0F;
        }

        .autocomplete-dropdown {
          border: 1px solid #222;
          border-radius: 12px;
          max-height: 200px;
          overflow-y: auto;
          background: #0a0a0a;
          margin-top: 4px;
        }

        .autocomplete-item {
          padding: 10px 16px;
          cursor: pointer;
          transition: background 0.2s;
        }

        .autocomplete-item:hover {
          background: #111;
          color: #4CFC0F;
        }

        .form-row {
          margin-bottom: 16px;
        }

        label {
          display: block;
          margin-bottom: 6px;
          font-weight: 500;
          color: #fff;
        }

        select, input {
          width: 100%;
          padding: 12px 16px;
          border: 1px solid #1e1e1e;
          border-radius: 12px;
          font-size: 15px;
          background: #000;
          color: #fff;
        }

        select:focus, input:focus {
          border-color: #4CFC0F;
          outline: none;
        }

        .quantity-row {
          display: flex;
          gap: 12px;
        }

        .quantity-row select {
          flex: 2;
        }

        .quantity-row input {
          flex: 1;
        }

        .price-paid-row {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .price-paid-row span {
          font-size: 18px;
          font-weight: 500;
          color: #fff;
        }

        .price-paid-row input {
          flex: 1;
        }

        /* LOADING STATE */
        #loading {
          text-align: center;
          padding: 20px;
          color: #4CFC0F;
        }

        /* TransDex UI Styles */
        .results-container {
          margin-top: 24px;
          border-top: 2px solid #1e1e1e;
          padding-top: 20px;
        }

        .transdex-container {
          max-width: 500px;
          margin: 0 auto;
        }

        .price-stack {
          margin-bottom: 24px;
        }

        .price-row {
          display: flex;
          justify-content: space-between;
          padding: 8px 0;
          border-bottom: 1px solid #1e1e1e;
        }

        .price-label {
          color: #666;
          font-size: 14px;
        }

        .price-value {
          font-weight: 600;
          color: #4CFC0F;
        }

        .transdex-box {
          background: #4CFC0F;
          color: black;
          padding: 12px 16px;
          border-radius: 8px;
          margin: 16px 0;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .transdex-label {
          font-size: 16px;
          font-weight: 500;
        }

        .transdex-value {
          font-size: 24px;
          font-weight: 700;
        }

        .price-bar-container {
          margin: 20px 0 10px;
          position: relative;
        }

        .bar {
          height: 10px;
          border-radius: 6px;
          background: linear-gradient(90deg,#4CFC0F,#ffaa00,#ff4444);
          position: relative;
          margin: 16px 0;
        }

        .marker {
          position: absolute;
          top: -6px;
          width: 4px;
          height: 22px;
          background: #fff;
          transform: translateX(-50%);
          transition: left 0.3s ease-out;
        }

        .bar-labels {
          display: flex;
          justify-content: space-between;
          margin-top: 8px;
          font-size: 12px;
          color: #666;
        }

        .user-price-indicator {
          margin-top: 16px;
          padding: 12px;
          background: #0a0a0a;
          border-radius: 8px;
          display: none;
          align-items: center;
          gap: 8px;
        }

        .user-marker {
          color: #ef4444;
          font-size: 18px;
          line-height: 1;
        }

        .savings-badge {
          padding: 8px 12px;
          border-radius: 20px;
          font-weight: 500;
          text-align: center;
          margin: 16px 0 8px;
        }

        .distortion-meter {
          height: 6px;
          background: #1e1e1e;
          border-radius: 3px;
          margin: 16px 0;
          overflow: hidden;
        }

        .distortion-fill {
          height: 100%;
          background: #ef4444;
          border-radius: 3px;
          width: 0%;
          transition: width 0.3s ease-out;
        }

        .pharmacy-list {
          margin-top: 20px;
          border-top: 1px solid #1e1e1e;
          padding-top: 16px;
        }

        .pharmacy {
          display: flex;
          justify-content: space-between;
          padding: 8px 0;
          border-bottom: 1px solid #1e1e1e;
        }

        .pharmacy:last-child {
          border-bottom: none;
        }

        .pharmacy-name {
          color: #fff;
        }

        .pharmacy-price {
          font-weight: 600;
          color: #4CFC0F;
        }

        .arb {
          margin-top: 12px;
          padding: 12px;
          background: #071107;
          border: 1px solid #4CFC0F;
          border-radius: 10px;
        }

        .email-gate {
          background: #fef3c7;
          border: 2px solid #f59e0b;
          border-radius: 12px;
          padding: 20px;
          text-align: center;
          margin-top: 20px;
        }

        .email-gate h3 {
          margin: 0 0 8px 0;
          color: #92400e;
        }

        .email-gate p {
          color: #333;
        }

        .email-gate input {
          width: 100%;
          padding: 12px;
          margin: 12px 0;
          border: 2px solid #f59e0b;
          border-radius: 8px;
          font-size: 16px;
          background: #fff;
          color: #000;
        }

        .email-gate button {
          background: #f59e0b;
          color: black;
          border: none;
          padding: 12px 30px;
          border-radius: 8px;
          font-weight: 600;
          cursor: pointer;
        }

        .premium-lock {
          margin-top: 16px;
          padding: 16px;
          background: #0a0a0a;
          border-radius: 8px;
          text-align: center;
        }

        .upgrade-banner {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          padding: 20px;
          border-radius: 12px;
          text-align: center;
          margin-top: 20px;
          cursor: pointer;
          transition: transform 0.2s;
        }

        .upgrade-banner:hover {
          transform: translateY(-2px);
        }

        .upgrade-banner h3 {
          margin: 0 0 8px 0;
          font-size: 20px;
          color: white;
        }

        .upgrade-banner p {
          margin: 0 0 16px 0;
          opacity: 0.9;
          color: white;
        }

        .upgrade-banner button {
          background: white;
          color: #4f46e5;
          border: none;
          padding: 12px 30px;
          border-radius: 25px;
          font-weight: 600;
          font-size: 16px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .upgrade-banner button:hover {
          transform: scale(1.05);
          box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        }

        .hidden {
          display: none !important;
        }

        #trx-low, #trx-high, #trx-savings, #trx-annual, #trx-breakeven {
          display: none;
        }
      </style>

      <div class="calculator-container">
        <h2>TransparentRx™</h2>

        <!-- Search Section -->
        <div class="search-section">
          <input 
            type="text" 
            class="search-input" 
            id="drug-search" 
            placeholder="Search for a drug (e.g., lisinopril, metformin)"
            autocomplete="off"
          />
          <div class="autocomplete-dropdown" id="autocomplete"></div>
        </div>

        <!-- Strength Selector -->
        <div class="form-row hidden" id="strength-row">
          <label for="strength">Strength / Dosage</label>
          <select id="strength"></select>
        </div>

        <!-- Quantity & Price -->
        <div class="form-row hidden" id="quantity-row">
          <label for="quantity">Quantity</label>
          <div class="quantity-row">
            <select id="quantity">
              <option value="30">30 tablets</option>
              <option value="60">60 tablets</option>
              <option value="90">90 tablets</option>
              <option value="180">180 tablets</option>
            </select>
            <input type="text" id="daily-dosage" placeholder="Daily dosage (optional)" />
          </div>
        </div>

        <!-- Price Paid -->
        <div class="form-row hidden" id="price-row">
          <label for="price-paid">What did you pay?</label>
          <div class="price-paid-row">
            <span>$</span>
            <input type="number" id="price-paid" min="0" step="0.01" placeholder="0.00" />
          </div>
        </div>

        <!-- LOADING INDICATOR -->
        <div id="loading" style="display:none;">
          <div>Analyzing...</div>
        </div>

        <!-- Email Gate (shown when demo used) -->
        <div class="email-gate hidden" id="email-gate">
          <h3>One more step</h3>
          <p>Enter your email to see your TransDex™ Fair Price analysis</p>
          <input type="email" id="gate-email" placeholder="your@email.com" value="${this.userEmail}" />
          <button id="gate-submit">Continue</button>
        </div>

        <!-- Results Container (TransDex UI) -->
        <div class="results-container hidden" id="results-container">
          <div class="transdex-container">
            <!-- Hidden fields for runCalculation compatibility -->
            <div id="trx-low"></div>
            <div id="trx-high"></div>
            <div id="trx-savings"></div>
            <div id="trx-annual"></div>
            <div id="trx-breakeven"></div>

            <div class="price-stack">
              <div class="price-row">
                <span class="price-label">Acquisition Cost</span>
                <span class="price-value" id="acquisition-cost">$0.00</span>
              </div>
              
              <div class="transdex-box">
                <span class="transdex-label">TransDex™ Price</span>
                <span class="transdex-value" id="transdex-price">$0.00</span>
              </div>
              
              <div class="price-row">
                <span class="price-label">Fair Market Range</span>
                <span class="price-value" id="fair-market-range">$0.00 – $0.00</span>
              </div>
              
              <div class="price-row">
                <span class="price-label">Retail Ceiling</span>
                <span class="price-value" id="retail-ceiling">$0.00</span>
              </div>
            </div>
            
            <div class="price-bar-container">
              <div class="bar">
                <div class="marker" id="price-marker" style="left: 0%"></div>
              </div>
              <div class="bar-labels">
                <span id="bar-left-label">$0</span>
                <span id="bar-right-label">$0</span>
              </div>
            </div>
            
            <div class="user-price-indicator" id="user-price-indicator">
              <div class="user-marker">▼</div>
              <span>You paid <span id="user-price-value">$0</span></span>
            </div>

            <div class="savings-badge" id="savings-badge"></div>
            
            <div class="distortion-meter">
              <div class="distortion-fill" id="distortion-fill" style="width: 0%"></div>
            </div>

            <!-- Arbitrage Box -->
            <div id="arbitrage-box"></div>

            <!-- Pharmacy List Container -->
            <div class="pharmacy-list" id="pharmacy-list"></div>

            <!-- Premium Lock for PBM Spread and Retail Markup -->
            <div class="premium-lock" id="premium-lock"></div>

            <!-- Upgrade Banner (shown to free users) -->
            <div class="upgrade-banner hidden" id="upgrade-banner" onclick="window.openPricingModal()">
              <h3>Unlock Full Pricing Breakdown</h3>
              <p>See exactly where PBM spread and retail markup are hiding.</p>
              <button>Upgrade for $12/month →</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  attachEventListeners() {
    const searchInput = this.shadowRoot.getElementById('drug-search');
    searchInput.addEventListener('input', this.debounce(this.handleSearch.bind(this), 300));
    
    // 🔥 STEP 3 — AUTO-TRIGGER ON PRICE INPUT
    const priceInput = this.shadowRoot.getElementById('price-paid');
    priceInput.addEventListener('input', this.debounce(() => {
      this.autoCalculate();
    }, 500));
    
    const gateSubmit = this.shadowRoot.getElementById('gate-submit');
    gateSubmit.addEventListener('click', this.handleEmailGate.bind(this));
    
    const strengthSelect = this.shadowRoot.getElementById('strength');
    strengthSelect.addEventListener('change', this.handleStrengthChange.bind(this));
  }

  debounce(func, wait) {
    let timeout;
    return (...args) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), wait);
    };
  }

  async handleSearch(e) {
    const query = e.target.value.trim();
    if (query.length < 2) {
      this.shadowRoot.getElementById('autocomplete').innerHTML = '';
      return;
    }

    try {
      const res = await fetch(`https://transparentrx-pricing.kellybhorak.workers.dev/api/search?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      this.renderAutocomplete(data);
    } catch (err) {
      console.error('Search failed:', err);
    }
  }

  renderAutocomplete(drugs) {
    const dropdown = this.shadowRoot.getElementById('autocomplete');

    if (!drugs || drugs.length === 0) {
      dropdown.innerHTML = '<div class="autocomplete-item">No results found</div>';
      return;
    }

    dropdown.innerHTML = drugs.map(d => `
      <div class="autocomplete-item" data-drug='${JSON.stringify(d)}'>
        ${d.display}
      </div>
    `).join('');

    dropdown.querySelectorAll('.autocomplete-item').forEach(item => {
      item.addEventListener('click', () => {
        const data = JSON.parse(item.dataset.drug);

        this.selectedDrug = data.drug;
        this.selectedDrugData = data;

        this.shadowRoot.getElementById('drug-search').value = data.display;
        dropdown.innerHTML = '';

        this.populateStrengths(data);

        if (data.strengths && data.strengths.length > 0) {
          this.selectedNdc = data.strengths[0].ndc;
        }
        
        // Show the strength/quantity/price rows
        this.shadowRoot.getElementById('strength-row').classList.remove('hidden');
        this.shadowRoot.getElementById('quantity-row').classList.remove('hidden');
        this.shadowRoot.getElementById('price-row').classList.remove('hidden');
        
        // 🔥 STEP 5 — TRIGGER ON DRUG SELECT
        this.autoCalculate();
      });
    });
  }

  populateStrengths(drugData) {
    const strengthSelect = this.shadowRoot.getElementById('strength');

    strengthSelect.innerHTML = drugData.strengths
      .map(s => `<option value="${s.strength}" data-ndc="${s.ndc}">
        ${s.strength}
      </option>`)
      .join('');

    const first = drugData.strengths[0];
    if (first) {
      this.selectedNdc = first.ndc;
      this.selectedStrength = first.strength;
    }
  }

  handleStrengthChange() {
    const select = this.shadowRoot.getElementById('strength');
    const selectedOption = select.options[select.selectedIndex];
    this.selectedNdc = selectedOption.dataset.ndc;
    this.selectedStrength = selectedOption.value;
    
    // Auto-calculate when strength changes if price is already entered
    this.autoCalculate();
  }

  async handleEmailGate() {
    const email = this.shadowRoot.getElementById('gate-email').value.trim();
    if (!email || !email.includes('@')) {
      alert('Please enter a valid email');
      return;
    }

    this.userEmail = email;
    localStorage.setItem('trx_email', email);
    this.shadowRoot.getElementById('email-gate').classList.add('hidden');
    this.demoUsed = true;
    this.calculatePrice();
  }

  autoCalculate() {
    const price = parseFloat(this.shadowRoot.getElementById('price-paid').value);

    if (!this.selectedNdc) return;
    if (!price || price <= 0) return;

    this.calculatePrice();
  }

  async calculatePrice() {
    // 🔥 STEP 6 — PREVENT DOUBLE CALLS
    if (this._calculating) return;
    this._calculating = true;

    // Check if we need email gate
    if (!this.isPremium && this.demoUsed && !this.userEmail) {
      this._calculating = false;
      this.shadowRoot.getElementById('email-gate').classList.remove('hidden');
      return;
    }

    const userPrice = parseFloat(this.shadowRoot.getElementById('price-paid').value);
    const dailyDosage = parseFloat(this.shadowRoot.getElementById('daily-dosage').value) || 1;
    const quantity = parseInt(this.shadowRoot.getElementById('quantity').value);
    const strength = this.shadowRoot.getElementById('strength').value;

    if (isNaN(userPrice) || userPrice <= 0) {
      this._calculating = false;
      alert('Please enter a valid price');
      return;
    }

    // 🔥 STEP 7 — ADD LOADING STATE
    this.shadowRoot.getElementById('loading').style.display = 'block';

    try {
      // 🔥 UPDATED payload with selectedNdc (5)
      const payload = {
        ndc: this.selectedNdc,
        drug: this.selectedDrug,
        strength: strength,
        quantity: quantity,
        userPrice: userPrice,
        dailyDosage: dailyDosage,
        zip: "76102"
      };

      // Call the runCalculation function
      await this.runCalculation(payload);
      
      // Show upgrade banner after 1.5 seconds for free users
      if (!this.isPremium) {
        setTimeout(() => {
          this.shadowRoot.getElementById('upgrade-banner').classList.remove('hidden');
        }, 1500);
      }
    } catch (err) {
      console.error('Price calculation failed:', err);
      alert('Failed to calculate price. Please try again.');
    } finally {
      this.shadowRoot.getElementById('loading').style.display = 'none';
      this._calculating = false;
    }
  }

  // Integrated runCalculation function
  async runCalculation(payload) {
    const res = await fetch("https://transparentrx-pricing.kellybhorak.workers.dev/api/price", {
      method: "POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify(payload)
    });

    const data = await res.json();

    // ECONOMICS
    const savings = data.monthlySavings || 0;
    const annual = savings * 12;
    const subscription = 12;

    const breakeven = savings > 0
      ? (subscription / savings).toFixed(1)
      : null;

    // UI FIELDS (hidden compatibility layer)
    const lowEl = this.shadowRoot.querySelector("#trx-low");
    const highEl = this.shadowRoot.querySelector("#trx-high");
    const savingsEl = this.shadowRoot.querySelector("#trx-savings");
    const annualEl = this.shadowRoot.querySelector("#trx-annual");
    const breakevenEl = this.shadowRoot.querySelector("#trx-breakeven");

    if (lowEl) lowEl.innerText = `$${data.truePrice?.low || '0.00'}`;
    if (highEl) highEl.innerText = `$${data.truePrice?.high || '0.00'}`;
    if (savingsEl) savingsEl.innerText = `$${savings.toFixed(2)}`;
    if (annualEl) annualEl.innerText = `$${annual.toFixed(2)}`;
    if (breakevenEl) breakevenEl.innerText = breakeven ? `${breakeven} mo` : "—";

    // Update main UI
    this.shadowRoot.querySelector("#transdex-price").innerText = `$${data.transdexPrice || data.truePrice?.mid || '0.00'}`;

    // BAR positioning
    const high = data.truePrice?.high || data.transdexBand?.high || 100;
    const transdexPrice = data.transdexPrice || data.truePrice?.mid || 0;
    const pct = Math.min(100, (transdexPrice / high) * 100);
    const marker = this.shadowRoot.querySelector("#price-marker");
    if (marker) {
      marker.style.left = pct + "%";
    }

    // PHARMACIES
    const list = this.shadowRoot.querySelector("#pharmacy-list");
    if (list) {
      list.innerHTML = "";

      if (data.pharmacies && data.pharmacies.length > 0) {
        const title = document.createElement("div");
        title.style.fontWeight = "600";
        title.style.marginBottom = "8px";
        title.style.color = "#4CFC0F";
        title.textContent = "Best prices near you";
        list.appendChild(title);

        data.pharmacies.slice(0, 5).forEach(p => {
          const div = document.createElement("div");
          div.className = "pharmacy";
          div.innerHTML = `
            <span class="pharmacy-name">${p.name} (${p.distance ?? '?'} mi)</span>
            <span class="pharmacy-price">$${p.price}</span>
          `;
          list.appendChild(div);
        });
      }
    }

    // Also update the existing TransDex UI elements for consistency
    this.updateTransdexUI(data);
  }

  updateTransdexUI(data) {
    // 🔥 UPDATED: Use style.display instead of classList.remove('hidden')
    this.shadowRoot.getElementById('results-container').style.display = 'block';

    // Update basic fields
    const acqCost = data.acquisitionCost || data.truePrice?.low || 0;
    const acqEl = this.shadowRoot.getElementById('acquisition-cost');
    if (acqEl) acqEl.textContent = `$${(Number(acqCost)||0).toFixed(2)}`;
    
    const transdexPrice = data.transdexPrice || data.truePrice?.mid || 0;
    const transEl = this.shadowRoot.getElementById('transdex-price');
    if (transEl) transEl.textContent = `$${(Number(transdexPrice)||0).toFixed(2)}`;
    
    const low = data.transdexBand?.low || data.truePrice?.low || 0;
    const high = data.transdexBand?.high || data.truePrice?.high || 0;
    const rangeEl = this.shadowRoot.getElementById('fair-market-range');
    if (rangeEl) rangeEl.textContent = `$${(Number(low)||0).toFixed(2)} – $${(Number(high)||0).toFixed(2)}`;
    
    const ceiling = data.retailCeiling || data.truePrice?.high || high * 2;
    const ceilingEl = this.shadowRoot.getElementById('retail-ceiling');
    if (ceilingEl) ceilingEl.textContent = `$${(Number(ceiling)||0).toFixed(2)}`;

    // Update bar labels
    const leftLabel = this.shadowRoot.getElementById('bar-left-label');
    if (leftLabel) leftLabel.textContent = `$${acqCost.toFixed(2)}`;
    
    const rightLabel = this.shadowRoot.getElementById('bar-right-label');
    if (rightLabel) rightLabel.textContent = `$${(Number(ceiling)||0).toFixed(2)}`;

    // Position marker (if not already positioned by runCalculation)
    const range = ceiling - acqCost;
    if (range > 0) {
      const position = ((transdexPrice - acqCost) / range) * 100;
      const marker = this.shadowRoot.getElementById('price-marker');
      if (marker) marker.style.left = `${Math.min(100, Math.max(0, position))}%`;
    }

    // Show user price
    if (data.userPrice) {
      const indicator = this.shadowRoot.getElementById('user-price-indicator');
      if (indicator) indicator.style.display = 'flex';
      
      const userPriceEl = this.shadowRoot.getElementById('user-price-value');
      if (userPriceEl) userPriceEl.textContent = `$${(Number(data.userPrice)||0).toFixed(2)}`;
    }

    // Savings badge
    if (data.monthlySavings !== undefined) {
      const savings = data.monthlySavings;
      const badge = this.shadowRoot.getElementById('savings-badge');
      if (badge) {
        if (savings > 0) {
          badge.textContent = `You could save $${savings.toFixed(2)} per month`;
          badge.style.background = '#065f46';
          badge.style.color = '#4CFC0F';
        } else if (savings < 0) {
          badge.textContent = `You're paying $${Math.abs(savings).toFixed(2)} above market rate`;
          badge.style.background = '#991b1b';
          badge.style.color = '#fff';
        }
      }
    }

    // Distortion meter
    if (data.distortionScore) {
      const fill = this.shadowRoot.getElementById('distortion-fill');
      if (fill) fill.style.width = `${data.distortionScore}%`;
    }

    /* ---------------- ARBITRAGE UI ---------------- */
    const arbBox = this.shadowRoot.getElementById('arbitrage-box');

    if (data.arbitrage) {
      arbBox.innerHTML = `
        <div class="arb">
          <div style="font-weight:600;">
            💡 Switch to ${data.arbitrage.recommendedPharmacy}
          </div>
          <div style="font-size:14px;margin-top:4px;">
            Pay $${data.arbitrage.recommendedPrice} instead
          </div>
          <div style="color:#4CFC0F;font-weight:600;margin-top:6px;">
            Save $${data.arbitrage.savings} (${data.arbitrage.savingsPercent}%)
          </div>
        </div>
      `;
    } else {
      arbBox.innerHTML = '';
    }

    /* ---------------- RECOMMENDATION ---------------- */

    if (data.recommendation) {
      const map = {
        switch_pharmacy: '⚠️ You are significantly overpaying — switch pharmacies',
        shop_around: '🔍 You may find better pricing nearby',
        fair_price: '✅ You are paying a fair price'
      };

      arbBox.innerHTML += `
        <div style="margin-top:8px;font-size:13px;color:#fff;">
          ${map[data.recommendation]}
        </div>
      `;
    }

    // Premium lock - hide PBM spread and retail markup for free users
    const lockEl = this.shadowRoot.getElementById('premium-lock');
    if (!this.isPremium) {
      const lockHtml = `
        <p style="margin: 0 0 8px 0; color: #4CFC0F;">🔒 Premium Insight</p>
        <p style="margin: 0 0 12px 0; font-weight: 500; color: #fff;">See PBM spread and retail markup breakdown</p>
        <button onclick="window.openPricingModal()" style="background: #4CFC0F; color: black; border: none; padding: 8px 20px; border-radius: 20px; cursor: pointer; font-weight: 600;">Unlock →</button>
      `;
      if (lockEl) lockEl.innerHTML = lockHtml;
    } else {
      // Show full breakdown for premium users
      const breakdownHtml = `
        <div style="margin-top: 16px;">
          <div class="price-row">
            <span class="price-label">PBM Spread</span>
            <span class="price-value">$${(data.truePrice?.mid * 0.15 || 0).toFixed(2)}</span>
          </div>
          <div class="price-row">
            <span class="price-label">Retail Markup</span>
            <span class="price-value">$${(data.truePrice?.mid * 0.15 || 0).toFixed(2)}</span>
          </div>
        </div>
      `;
      if (lockEl) lockEl.innerHTML = breakdownHtml;
    }
  }
}

// Make pricing modal function available globally
window.openPricingModal = function() {
  window.location.href = '/pricing';
};

// Register the custom element
customElements.define('prescription-economics', PrescriptionEconomics);