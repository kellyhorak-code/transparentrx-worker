class TransparentRXPricing extends HTMLElement {

constructor(){
super();
this.attachShadow({mode:'open'});

this.API_BASE="https://transparentrx-pricing.kellybhorak.workers.dev";
this.checkoutLoading=false;
}

connectedCallback(){
this.render();
this.setupEventListeners();
}

render(){

this.shadowRoot.innerHTML=`

<style>

:host{
display:block;
font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;
background:#000;
color:#fff;
}

.page-container{
display:flex;
flex-direction:column;
align-items:center;
min-height:100vh;
padding:2rem 1rem;
box-sizing:border-box;
}

.content-wrapper{
max-width:1200px;
width:100%;
margin:0 auto;
}

.logo{
font-size:2rem;
font-weight:700;
margin-bottom:.5rem;
text-align:center;
}

.logo-transparent{color:#4CFC0F}

.logo-rx{
background:#4CFC0F;
color:#000;
padding:.2rem .5rem;
border-radius:8px;
}

.tagline{
color:#ccc;
font-size:1rem;
margin-bottom:2rem;
text-align:center;
}

.hero-section{text-align:center;margin-bottom:2rem}

h1{
font-size:2.5rem;
color:#4CFC0F;
margin-bottom:1rem;
line-height:1.2;
}

p{
color:#ccc;
font-size:1.1rem;
max-width:700px;
margin:0 auto 1.5rem;
line-height:1.6;
}

.price-badge-container{
display:flex;
justify-content:center;
gap:1rem;
margin:2rem 0;
flex-wrap:wrap;
}

.price-badge{
padding:.5rem 1.5rem;
background:rgba(76,252,15,.1);
border:1px solid #4CFC0F;
border-radius:60px;
color:#4CFC0F;
font-size:.95rem;
}

.trust-badges{
display:flex;
justify-content:center;
gap:2rem;
margin:2rem 0;
flex-wrap:wrap;
}

.trust-badge{
color:#ccc;
font-size:.9rem;
}

.pricing-grid{
display:flex;
justify-content:center;
gap:2rem;
margin:3rem 0;
flex-wrap:wrap;
}

.pricing-card{
flex:0 1 350px;
background:#0a0a0a;
border:1px solid #2a2a2a;
border-radius:24px;
padding:2rem;
position:relative;
}

.pricing-card.premium{
border:2px solid #4CFC0F;
background:linear-gradient(135deg,#0a0a0a,#0f1a0f);
}

.popular-badge{
position:absolute;
top:-12px;
left:50%;
transform:translateX(-50%);
background:#4CFC0F;
color:#000;
padding:.25rem 1rem;
border-radius:60px;
font-size:.75rem;
font-weight:600;
}

.plan-name{
font-size:1.5rem;
font-weight:600;
margin-bottom:1rem;
color:#4CFC0F;
text-align:center;
}

.price{
font-size:2.5rem;
font-weight:700;
color:#4CFC0F;
margin-bottom:1rem;
text-align:center;
}

.price span{
font-size:1rem;
font-weight:400;
color:#ccc;
}

.features{
list-style:none;
padding:0;
margin:2rem 0;
}

.features li{
padding:.75rem 0;
border-bottom:1px solid #2a2a2a;
color:#ccc;
font-size:.95rem;
}

.features li:last-child{
border-bottom:none;
}

.btn{
width:100%;
padding:1rem 2rem;
border-radius:60px;
font-weight:600;
font-size:1rem;
cursor:pointer;
transition:.25s;
}

.btn-primary{
background:#4CFC0F;
color:#000;
border:none;
}

.btn-primary:hover{
background:#5eff20;
transform:translateY(-2px);
box-shadow:0 10px 20px -5px rgba(76,252,15,.3);
}

.btn-loading{
opacity:.6;
cursor:wait;
}

.faq-section{
max-width:800px;
margin:4rem auto 0;
}

.faq-title{
font-size:2rem;
color:#4CFC0F;
text-align:center;
margin-bottom:2rem;
}

.faq-item{
background:#0a0a0a;
border-radius:16px;
margin-bottom:1rem;
border:1px solid #2a2a2a;
overflow:hidden;
}

.faq-question{
padding:1.25rem;
cursor:pointer;
font-weight:600;
display:flex;
justify-content:space-between;
align-items:center;
}

.faq-answer{
padding:0 1.25rem 1.25rem;
color:#ccc;
display:none;
}

.faq-answer.show{display:block}

.arrow{transition:.25s;color:#4CFC0F}

.arrow.rotated{transform:rotate(180deg)}

.disclaimer{
font-size:.7rem;
color:#666;
text-align:center;
margin-top:3rem;
padding-top:1rem;
border-top:1px solid #2a2a2a;
}

</style>

<div class="page-container">
<div class="content-wrapper">

<div class="logo">
<span class="logo-transparent">Transparent</span>
<span class="logo-rx">RX</span>.io
</div>

<div class="tagline">know what you're really paying</div>

<div class="hero-section">
<h1>Check If You're Overpaying for Prescriptions</h1>
<p>See exactly what your prescriptions cost annually, compare to federal benchmarks, and understand if you're paying too much.</p>
</div>

<div class="price-badge-container">
<span class="price-badge">One free calculation</span>
<span class="price-badge">Premium $12/month</span>
</div>

<div class="pricing-grid">

<div class="pricing-card">
<div class="plan-name">Free Insight</div>
<div class="price">$0<span> one-time</span></div>
<ul class="features">
<li>One economic calculation</li>
<li>Annual cost analysis</li>
<li>Benchmark comparison</li>
</ul>
<button class="btn" disabled>Current Plan</button>
</div>

<div class="pricing-card premium">
<div class="popular-badge">BEST VALUE</div>
<div class="plan-name">Premium Access</div>
<div class="price">$12<span>/month</span></div>
<ul class="features">
<li>Unlimited calculations</li>
<li>Historical trends</li>
<li>Dashboard insights</li>
<li>PDF export reports</li>
</ul>
<button class="btn btn-primary" id="premiumPlan">Get Premium Access</button>
</div>

</div>

<div class="faq-section">

<h2 class="faq-title">Questions?</h2>

${[1,2,3].map(i=>`
<div class="faq-item">
<div class="faq-question" id="faq${i}">
<span>${[
"What's included in the free calculation?",
"How does Premium work?",
"Can I cancel anytime?"
][i-1]}</span>
<span class="arrow" id="arrow${i}">▼</span>
</div>
<div class="faq-answer" id="faq${i}Answer">
${[
"Your free calculation compares your prescription price to federal benchmarks.",
"Premium gives unlimited analysis and full dashboard access.",
"You can cancel your subscription anytime."
][i-1]}
</div>
</div>
`).join("")}

</div>

<div class="disclaimer">
Informational tool only. Not medical advice.
</div>

</div>
</div>

`;

}

setupEventListeners(){

const premiumBtn=this.shadowRoot.getElementById("premiumPlan");

premiumBtn.addEventListener("click",()=>this.startCheckout());

for(let i=1;i<=3;i++){

const q=this.shadowRoot.getElementById(`faq${i}`);
const a=this.shadowRoot.getElementById(`faq${i}Answer`);
const arrow=this.shadowRoot.getElementById(`arrow${i}`);

q.addEventListener("click",()=>{

for(let j=1;j<=3;j++){
if(j!==i){
this.shadowRoot.getElementById(`faq${j}Answer`).classList.remove("show");
this.shadowRoot.getElementById(`arrow${j}`).classList.remove("rotated");
}
}

a.classList.toggle("show");
arrow.classList.toggle("rotated");

});

}

}

async startCheckout(){

if(this.checkoutLoading) return;

this.checkoutLoading=true;

const btn=this.shadowRoot.getElementById("premiumPlan");
btn.classList.add("btn-loading");
btn.textContent="Redirecting...";

try{

const res=await fetch(`${this.API_BASE}/api/checkout`,{
method:"POST",
headers:{'Content-Type':'application/json'},
body:JSON.stringify({source:"pricing_page"})
});

const data=await res.json();

if(data.url){
window.location.href=data.url;
return;
}

throw new Error("Checkout failed");

}catch(err){

console.error(err);

btn.textContent="Checkout Error — Retry";
btn.classList.remove("btn-loading");

}

this.checkoutLoading=false;

}

}

customElements.define(
'transparentrx-pricing',
TransparentRXPricing
);