class PrescriptionEconomics extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    this.shadowRoot.innerHTML = `<div id="result"></div>`;
  }

  renderTerminalV2(data) {
    const el = this.shadowRoot.getElementById("result");

    const overpay = data.userPrice - data.truePrice.mid;
    const percent = ((overpay / data.userPrice) * 100).toFixed(0);

    const posMarket =
      ((data.userPrice - data.min) / (data.max - data.min)) * 100;

    const posForecast =
      ((data.userPrice - data.simulation.low) /
      (data.simulation.high - data.simulation.low)) * 100;

    el.innerHTML = `
    <div style="font-family:JetBrains Mono,monospace;color:#00ffcc;
      background:#000;padding:20px;line-height:1.5">

      <!-- POSITION -->
      <div style="border-bottom:1px solid #111;padding-bottom:10px;margin-bottom:10px;">
        <div>YOU PAID        $${data.userPrice}</div>
        <div>FAIR VALUE      $${data.truePrice.mid}</div>
        <div style="color:#ff4d4d;">
          STATUS          OVERPRICED (+${percent}%)
        </div>
      </div>

      <!-- MARKET -->
      <div style="border-bottom:1px solid #111;padding-bottom:10px;margin-bottom:10px;">
        <div style="color:#888;">MARKET RANGE</div>
        <div>LOW      $${data.min}</div>
        <div>MEDIAN   $${data.median}</div>
        <div>HIGH     $${data.max}</div>

        <div style="margin-top:6px;height:4px;
          background:linear-gradient(90deg,#00ff88,#ffaa00,#ff4444);
          position:relative;">
          <div style="position:absolute;left:${posMarket}%;
            width:2px;height:10px;background:white;top:-3px;"></div>
        </div>
      </div>

      <!-- STRUCTURE -->
      <div style="border-bottom:1px solid #111;padding-bottom:10px;margin-bottom:10px;">
        <div style="color:#888;">PRICE BREAKDOWN</div>
        ${data.layers.map(l => `
          <div>
            ${l.name.padEnd(20)} $${l.value}
          </div>
        `).join('')}
      </div>

      <!-- FORECAST -->
      <div style="border-bottom:1px solid #111;padding-bottom:10px;margin-bottom:10px;">
        <div style="color:#888;">FORECAST (30D)</div>
        <div>LOW       $${data.simulation.low}</div>
        <div style="color:#4CFC0F;">EXPECTED  $${data.simulation.expected}</div>
        <div>HIGH      $${data.simulation.high}</div>

        <div style="margin-top:6px;height:4px;
          background:linear-gradient(90deg,#00ff88,#ffaa00,#ff4444);
          position:relative;">
          <div style="position:absolute;left:${posForecast}%;
            width:2px;height:10px;background:white;top:-3px;"></div>
        </div>

        <div style="margin-top:6px;color:#aaa;">
          ${data.userPrice > data.simulation.expected
            ? "ABOVE EXPECTED RANGE"
            : "WITHIN EXPECTED RANGE"}
        </div>
      </div>

      <!-- EXECUTION -->
      <div>
        <div style="color:#888;">EXECUTION</div>
        <div>
          ${data.bestPharmacy?.name} — 
          <span style="color:#4CFC0F">$${data.bestPharmacy?.price}</span>
        </div>

        <div style="color:#aaa;">
          Savings: $${data.arbitrage?.savings}
        </div>

        <div style="margin-top:6px;color:#4CFC0F;">
          ACTION: SWITCH NOW
        </div>
      </div>

    </div>
    `;
  }
}

customElements.define('prescription-economics', PrescriptionEconomics);
