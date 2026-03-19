class PrescriptionEconomics extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    this.shadowRoot.innerHTML = `
      <div id="result"></div>
    `;
  }

  renderTerminalV2(data) {
    const el = this.shadowRoot.getElementById("result");

    const position =
      ((data.userPrice - data.simulation.low) /
      (data.simulation.high - data.simulation.low)) * 100;

    el.innerHTML = `
    <div style="font-family:Inter,sans-serif;color:#fff;padding:20px;background:#000">

      <!-- POSITION -->
      <div style="font-size:22px;font-weight:700;">
        $${data.userPrice} → 
        <span style="color:#4CFC0F">$${data.truePrice.mid}</span>
      </div>

      <div style="color:#ff4d4d;font-size:14px;margin-top:4px;">
        Overpay: $${(data.userPrice - data.truePrice.mid).toFixed(2)}
      </div>

      <!-- MARKET -->
      <div style="margin-top:12px;font-size:12px;color:#aaa;">
        Market Range: $${data.min} – $${data.max}
      </div>

      <!-- FORECAST -->
      <div style="margin-top:16px;border-top:1px solid #111;padding-top:10px;">
        <div style="font-size:11px;color:#666;">FORECAST (30D)</div>

        <div style="display:flex;justify-content:space-between;font-size:12px;">
          <span>$${data.simulation.low}</span>
          <span style="color:#4CFC0F">$${data.simulation.expected}</span>
          <span>$${data.simulation.high}</span>
        </div>

        <div style="margin-top:6px;height:6px;
          background:linear-gradient(90deg,#00ff88,#eab308,#ef4444);
          border-radius:4px;position:relative;">

          <div style="position:absolute;
            left:${position}%;
            top:-6px;width:2px;height:18px;background:white;">
          </div>
        </div>

        <div style="font-size:12px;color:#aaa;margin-top:6px;">
          ${data.userPrice > data.simulation.expected 
            ? "Above expected future pricing"
            : "Within expected range"}
        </div>
      </div>

      <!-- BEST OPTION -->
      <div style="margin-top:16px;">
        Best: ${data.bestPharmacy?.name} — 
        <span style="color:#4CFC0F">$${data.bestPharmacy?.price}</span>
      </div>

    </div>
    `;
  }
}

customElements.define('prescription-economics', PrescriptionEconomics);
