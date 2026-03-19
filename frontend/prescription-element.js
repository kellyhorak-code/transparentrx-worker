class PrescriptionEconomics extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.selected = null; // holds chosen drug object
    this.selectedNdc = null;
  }

  connectedCallback() {
    this.render();
    this.bind();
  }

  render() {
    this.shadowRoot.innerHTML = `
      <style>
        :host { display:block; font-family:system-ui; color:#fff; }
        .box { background:#060606; border:1px solid #181818; border-radius:16px; padding:20px; }
        input, select {
          width:100%; padding:12px; margin-top:10px;
          background:#000; color:#fff; border:1px solid #222; border-radius:10px;
        }
        .dropdown { background:#0a0a0a; border:1px solid #222; margin-top:4px; border-radius:10px; max-height:200px; overflow:auto; }
        .item { padding:10px; cursor:pointer; }
        .item:hover { background:#111; color:#4CFC0F; }
        .hidden { display:none; }
        .btn { margin-top:12px; padding:12px; border:none; border-radius:10px; background:#4CFC0F; color:#000; font-weight:700; cursor:pointer; }
        .result { margin-top:16px; padding:12px; border-radius:10px; background:#0a0a0a; }
      </style>

      <div class="box">
        <input id="search" placeholder="Search drug (e.g., lisinopril)" />
        <div id="dropdown" class="dropdown"></div>

        <select id="strength" class="hidden"></select>
        <input id="price" class="hidden" type="number" placeholder="What did you pay?" />
        <button id="calc" class="btn hidden">Analyze</button>

        <div id="result" class="result hidden"></div>
      </div>
    `;
  }

  bind() {
    const search = this.shadowRoot.getElementById('search');
    const dropdown = this.shadowRoot.getElementById('dropdown');
    const strength = this.shadowRoot.getElementById('strength');
    const price = this.shadowRoot.getElementById('price');
    const calc = this.shadowRoot.getElementById('calc');
    const result = this.shadowRoot.getElementById('result');

    // SEARCH
    search.addEventListener('input', async (e) => {
      const q = e.target.value.trim();
      if (q.length < 2) { dropdown.innerHTML = ''; return; }

      const res = await fetch(
        "https://transparentrx-pricing.kellybhorak.workers.dev/api/search?q=" + encodeURIComponent(q)
      );
      const data = await res.json();

      dropdown.innerHTML = data.map(d =>
        `<div class="item" data='${JSON.stringify(d)}'>${d.display}</div>`
      ).join('');

      dropdown.querySelectorAll('.item').forEach(el => {
        el.onclick = () => {
          const d = JSON.parse(el.getAttribute('data'));
          this.selected = d;
          search.value = d.display;
          dropdown.innerHTML = '';

          // populate strengths
          strength.innerHTML = d.strengths.map(s =>
            `<option data-ndc="${s.ndc}">${s.strength}</option>`
          ).join('');

          this.selectedNdc = d.strengths[0]?.ndc || null;

          strength.classList.remove('hidden');
          price.classList.remove('hidden');
          calc.classList.remove('hidden');
        };
      });
    });

    // STRENGTH CHANGE
    strength.addEventListener('change', () => {
      const opt = strength.options[strength.selectedIndex];
      this.selectedNdc = opt.getAttribute('data-ndc');
    });

    // CALCULATE
    calc.addEventListener('click', async () => {
      const userPrice = parseFloat(price.value);
      if (!this.selectedNdc || !userPrice) return;

      const res = await fetch(
        "https://transparentrx-pricing.kellybhorak.workers.dev/api/price",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ndc: this.selectedNdc,
            userPrice,
            quantity: 30,
            dailyDosage: 1,
            zip: "76102"
          })
        }
      );

      const data = await res.json();

      result.classList.remove('hidden');
      result.innerHTML = `
        <div><b>TransDex:</b> $${data.truePrice?.mid}</div>
        <div><b>You paid:</b> $${userPrice}</div>
        <div><b>Monthly savings:</b> $${data.monthlySavings}</div>
        <div><b>Best pharmacy:</b> ${data.bestPharmacy?.name} ($${data.bestPharmacy?.price})</div>
        <div><b>Recommendation:</b> ${data.recommendation}</div>
      `;
    });
  }
}

customElements.define('prescription-economics', PrescriptionEconomics);
