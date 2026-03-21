class PrescriptionEconomics extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });

    this.state = {
      drug: "",
      userPrice: "",
      data: null,
      loading: false,
      ran: false,
      isPremium: localStorage.getItem("trx_premium") === "true",
      activityIndex: 0
    };

    this.activityFeed = ["Initializing pricing intelligence..."];
  }

  connectedCallback() {
    this.loadActivity();
    this.startActivityTicker();
    this.render();
  }

  // =========================
  // REAL ACTIVITY FEED
  // =========================
  async loadActivity() {
    try {
      const res = await fetch("https://transparentrx-pricing.kellybhorak.workers.dev/api/activity");
      const data = await res.json();

      this.activityFeed = data.map(d => d.message);

      if (!this.activityFeed.length) {
        this.activityFeed = ["Initializing pricing intelligence..."];
      }

    } catch (e) {
      this.activityFeed = ["Activity feed unavailable"];
    }
  }

  startActivityTicker() {
    setInterval(() => {
      if (!this.activityFeed?.length) return;

      this.state.activityIndex =
        (this.state.activityIndex + 1) % this.activityFeed.length;

      this.updateActivity();
    }, 3000);
  }

  updateActivity() {
    const el = this.shadowRoot.querySelector("#activity");
    if (el) {
      el.textContent = this.activityFeed[this.state.activityIndex];
    }
  }

  // =========================
  // CORE RUN
  // =========================
  async run() {

    if (this.state.ran && !this.state.isPremium) {
      this.renderPaywall();
      return;
    }

    this.state.loading = true;
    this.render();

    const res = await fetch("https://transparentrx-pricing.kellybhorak.workers.dev/api/price", {
      method: "POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify({
        drug_name: this.state.drug,
        userPrice: Number(this.state.userPrice || 0)
      })
    });

    this.state.data = await res.json();
    this.state.loading = false;
    this.state.ran = true;

    this.animateAI();
    this.render();

    // refresh activity after interaction
    this.loadActivity();
  }

  async checkout() {
    const res = await fetch("https://transparentrx-pricing.kellybhorak.workers.dev/api/checkout");
    const data = await res.json();
    window.location.href = data.url;
  }

  // =========================
  // AI ANIMATION
  // =========================
  animateAI() {
    const el = this.shadowRoot.querySelector("#ai");
    if (!el || !this.state.data?.aiInsight) return;

    el.innerHTML = "";
    let i = 0;
    const text = this.state.data.aiInsight;

    const t = setInterval(() => {
      el.innerHTML += text[i];
      i++;
      if (i >= text.length) clearInterval(t);
    }, 14);
  }

  // =========================
  // PRICE BAR
  // =========================
  renderBar() {
    const d = this.state.data;
    if (!d) return "";

    const range = d.max - d.min || 1;

    const user = ((d.userPrice - d.min) / range) * 100;
    const p25 = ((d.p25 - d.min) / range) * 100;
    const p50 = ((d.p50 - d.min) / range) * 100;

    return `
      <div class="bar">
        <div class="true" style="left:${p25}%; width:${p50 - p25}%"></div>
        <div class="marker user" style="left:${user}%"></div>
      </div>
    `;
  }

  // =========================
  // SIGNALS (REAL)
  // =========================
  renderSignals() {
    const d = this.state.data || {};

    return `
      <div class="signals">

        <div class="social">
          ✔ Based on ${d.sampleSize || 0}+ real pricing observations
        </div>

        <div id="activity" class="activity">
          ${this.activityFeed[this.state.activityIndex]}
        </div>

        <div class="scarcity">
          ${
            d.arbitrageLevel === "EXTREME"
              ? "⚠ High price volatility detected — delaying may increase cost"
              : "Pricing varies by pharmacy — checking now ensures best price"
          }
        </div>

      </div>
    `;
  }

  // =========================
  // PAYWALL
  // =========================
  renderPaywall() {
    const d = this.state.data || {};

    this.shadowRoot.innerHTML = `
      <style>
        .wrap {
          max-width: 600px;
          margin: 80px auto;
          padding: 30px;
          background: #0e1116;
          color: white;
          border-radius: 16px;
          text-align: center;
        }

        .price {
          font-size: 42px;
          color: #00e676;
          margin: 20px 0;
        }

        button {
          padding: 14px;
          width: 100%;
          border-radius: 10px;
          border: none;
          background: linear-gradient(90deg,#00c6ff,#0072ff);
          color: white;
          font-weight: 600;
        }

        .urgency {
          margin-top: 14px;
          color: #ffcc00;
        }
      </style>

      <div class="wrap">

        <h2>Unlock Full Pricing Intelligence</h2>

        <div>
          You are paying more than <b>${d.userPercentile || "?"}%</b> of observed prices
        </div>

        <div class="price">$12</div>

        <button onclick="this.getRootNode().host.checkout()">
          Unlock Now
        </button>

        <div class="urgency">
          Market volatility detected — prices may shift quickly
        </div>

      </div>
    `;
  }

  // =========================
  // RENDER
  // =========================
  render() {
    const d = this.state.data || {};

    this.shadowRoot.innerHTML = `
      <style>
        * { font-family: -apple-system; }

        .wrap {
          max-width: 880px;
          margin: 40px auto;
          padding: 30px;
          background: #0e1116;
          color: #e6edf3;
          border-radius: 18px;
        }

        input {
          width: 100%;
          padding: 12px;
          margin-top: 10px;
          border-radius: 10px;
          border: 1px solid #2a2f3a;
          background: #161b22;
          color: white;
        }

        button {
          margin-top: 16px;
          width: 100%;
          padding: 14px;
          border-radius: 12px;
          border: none;
          background: linear-gradient(90deg,#00c6ff,#0072ff);
          color: white;
          font-weight: 600;
        }

        .card {
          margin-top: 24px;
          padding: 22px;
          background: #161b22;
          border-radius: 14px;
        }

        .big {
          font-size: 34px;
          color: #00e676;
        }

        .bar {
          margin-top: 20px;
          height: 14px;
          background: #222;
          border-radius: 8px;
          position: relative;
        }

        .true {
          position: absolute;
          height: 100%;
          background: linear-gradient(90deg,#00e676,#00c853);
        }

        .marker {
          position: absolute;
          top: -4px;
          width: 4px;
          height: 22px;
        }

        .user { background: #ff5252; }

        .signals {
          margin-top: 18px;
          font-size: 12px;
          line-height: 1.6;
        }

        .social { color: #9ecbff; }
        .activity { color: #00e676; }
        .scarcity { color: #ffcc00; }

        .ai {
          margin-top: 16px;
          color: #9ecbff;
        }

      </style>

      <div class="wrap">

        <input placeholder="Enter drug name"
          oninput="this.getRootNode().host.state.drug = this.value" />

        <input placeholder="Your price ($)"
          oninput="this.getRootNode().host.state.userPrice = this.value" />

        <button onclick="this.getRootNode().host.run()">
          ${this.state.loading ? "Analyzing..." : "Reveal TruePrice"}
        </button>

        ${this.state.ran ? `
        <div class="card">

          <div class="big">
            $${d.truePrice?.low?.toFixed(2)} – $${d.truePrice?.high?.toFixed(2)}
          </div>

          ${this.renderBar()}

          <div style="margin-top:12px;">
            You are paying more than <b>${d.userPercentile}%</b> of users
          </div>

          <div style="margin-top:8px;">
            Estimated savings: <b>$${d.savings}</b>
          </div>

          <div id="ai" class="ai"></div>

          ${this.renderSignals()}

        </div>
        ` : ""}

      </div>
    `;
  }
}

customElements.define('prescription-economics', PrescriptionEconomics);
