class PrescriptionEconomics extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.debounceTimer = null;
  }

  connectedCallback() {
    this.render();
    this.attachEvents();
  }

  render() {
    this.shadowRoot.innerHTML = `
      <style>
        .box {
          padding: 20px;
          border: 1px solid #222;
          border-radius: 12px;
          background: #000;
          color: #4CFC0F;
        }

        input {
          width: 100%;
          padding: 12px;
          margin-top: 10px;
          border-radius: 8px;
          border: 1px solid #222;
          background: #000;
          color: #fff;
          font-size: 16px;
        }

        .dropdown {
          margin-top: 8px;
          border: 1px solid #222;
          border-radius: 8px;
          background: #0a0a0a;
          display: none;
          max-height: 200px;
          overflow-y: auto;
        }

        .item {
          padding: 10px;
          cursor: pointer;
        }

        .item:hover {
          background: #111;
          color: #4CFC0F;
        }
      </style>

      <div class="box">
        <div>Search for your prescription</div>
        <input id="search" placeholder="e.g. lisinopril" />
        <div id="dropdown" class="dropdown"></div>
      </div>
    `;
  }

  attachEvents() {
    const input = this.shadowRoot.getElementById('search');

    input.addEventListener('input', (e) => {
      clearTimeout(this.debounceTimer);

      const query = e.target.value.trim();

      if (query.length < 2) {
        this.hideDropdown();
        return;
      }

      this.debounceTimer = setTimeout(() => {
        this.search(query);
      }, 300);
    });
  }

  async search(query) {
    try {
      const res = await fetch(`https://transparentrx-pricing.kellybhorak.workers.dev/api/search?q=${encodeURIComponent(query)}`);
      const data = await res.json();

      this.renderDropdown(data);
    } catch (err) {
      console.error("Search failed", err);
    }
  }

  renderDropdown(drugs) {
    const dropdown = this.shadowRoot.getElementById('dropdown');

    if (!drugs || drugs.length === 0) {
      this.hideDropdown();
      return;
    }

    dropdown.innerHTML = drugs.slice(0, 8).map(d => `
      <div class="item">${d.display}</div>
    `).join('');

    dropdown.style.display = 'block';

    dropdown.querySelectorAll('.item').forEach((el, i) => {
      el.addEventListener('click', () => {
        this.select(drugs[i]);
      });
    });
  }

  select(drug) {
    const input = this.shadowRoot.getElementById('search');
    input.value = drug.display;
    this.hideDropdown();

    console.log("SELECTED:", drug);
  }

  hideDropdown() {
    const dropdown = this.shadowRoot.getElementById('dropdown');
    dropdown.style.display = 'none';
    dropdown.innerHTML = '';
  }
}

customElements.define('prescription-economics', PrescriptionEconomics);
