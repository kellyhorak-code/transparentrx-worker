class PrescriptionEconomics extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.API = "https://transparentrx-pricing.kellybhorak.workers.dev";
  }

  connectedCallback() {
    this.render();
    this.bind();
  }

  render() {
    this.shadowRoot.innerHTML = `
      <style>
        :host { display:block; font-family:system-ui; color:#fff; }
        .box { background:#060606; border:1px solid #181818; border-radius:16px; padding:20px; position:relative; }
        input {
          width:100%; padding:12px; margin-top:10px;
          background:#000; color:#fff; border:1px solid #222; border-radius:10px;
        }
        .dropdown {
          position:absolute;
          background:#0a0a0a;
          border:1px solid #222;
          margin-top:2px;
          border-radius:10px;
          max-height:200px;
          overflow:auto;
          width:100%;
          z-index:9999;
        }
        .item { padding:10px; cursor:pointer; }
        .item:hover { background:#111; color:#4CFC0F; }
        .btn {
          margin-top:12px; padding:12px;
          border:none; border-radius:10px;
          background:#4CFC0F; color:#000;
          font-weight:700; cursor:pointer;
          width:100%;
        }
        .result { margin-top:16px; padding:12px; border-radius:10px; background:#0a0a0a; }
      </style>

      <div class="box">
        <input id="search" placeholder="Search drug (e.g., lisinopril)" />
        <div id="dropdown" class="dropdown"></div>

        <input id="strength" placeholder="Strength (e.g. 10mg)" />
        <input id="price" type="number" placeholder="What did you pay?" />

        <button id="calc" class="btn">Analyze</button>

        <div id="result" class="result"></div>
      </div>
    `;
  }

  bind() {
    const search = this.shadowRoot.getElementById('search');
    const dropdown = this.shadowRoot.getElementById('dropdown');

    search.addEventListener('input', async (e) => {
      const q = e.target.value.trim();
      if (q.length < 2) {
        dropdown.innerHTML = '';
        return;
      }

      try {
        const res = await fetch(`${this.API}/api/search?q=${encodeURIComponent(q)}`);
        const data = await res.json();

        dropdown.innerHTML = data.map(d => `
          <div class="item" onclick="this.getRootNode().host.selectDrug('${d}')">
            ${d}
          </div>
        `).join('');
      } catch (err) {
        console.error("Autocomplete fetch failed:", err);
      }
    });

    this.shadowRoot.getElementById('calc')
      .addEventListener('click', () => this.runCheck());
  }

  selectDrug(name) {
    this.shadowRoot.getElementById('search').value = name;
    this.shadowRoot.getElementById('dropdown').innerHTML = '';
  }

  async runCheck() {
    const drug = this.shadowRoot.getElementById('search').value;
    const strength = this.shadowRoot.getElementById('strength').value;
    const user_price = parseFloat(this.shadowRoot.getElementById('price').value);

    try {
      const res = await fetch(`${this.API}/api/price`, {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({ drug, strength, user_price })
      });

      const data = await res.json();
      this.renderResult(data);
    } catch (err) {
      console.error("Price fetch failed:", err);
    }
  }

  typeWriter(el, text, speed = 14) {
    let i = 0;
    el.innerHTML = "";

    const typing = () => {
      if (i < text.length) {
        el.innerHTML += text.charAt(i);
        i++;
        setTimeout(typing, speed);
      }
    };

    typing();
  }

  renderResult(data) {
    const result = this.shadowRoot.getElementById('result');

    if (data.error) {
      result.innerHTML = "No data available";
      return;
    }

    result.innerHTML = `
      <h3>TruePrice<sup style="font-size:10px;">™</sup></h3>

      <div>
        ${data.recommended.pharmacy} — approx $${data.recommended.expectedPrice.toFixed(2)}
      </div>

      ${data.recommended.savings ? `
        <div style="color:#4CFC0F;">
          Save ~$${data.recommended.savings.toFixed(2)}
        </div>
      ` : ""}

      <div style="margin-top:6px;font-size:12px;color:#888;">
        Confidence: ${data.recommended.confidence}
      </div>

      <div style="margin-top:10px;">
        ${data.ranking.map(p => `
          <div>${p.name} — $${p.price.toFixed(2)}</div>
        `).join('')}
      </div>

      <div id="aiText" style="margin-top:10px;"></div>

      <div style="margin-top:10px;font-size:11px;color:#777;">
        Pricing estimates are based on aggregated market data and may vary.
      </div>
    `;

    this.typeWriter(
      this.shadowRoot.getElementById('aiText'),
      data.insight || '',
      14
    );
  }
}

customElements.define('prescription-economics', PrescriptionEconomics);