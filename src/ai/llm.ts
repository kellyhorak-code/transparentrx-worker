import OpenAI from "openai";

export async function generateLLMInsight(data: any, apiKey: string) {
  const client = new OpenAI({ apiKey });

  const prompt = `
You are a financial analyst specializing in prescription drug pricing.

Analyze the following structured data and produce a concise, authoritative insight.

DATA:
- User Price: $${data.userPrice}
- Fair Price: $${data.truePrice.mid}
- Market Range: $${data.min} - $${data.max}
- Expected Future Price: $${data.simulation.expected}
- Volatility: ${data.timing?.volatility || 0}

Instructions:
- Be precise, not verbose
- Focus on financial impact
- State if user is overpaying
- Suggest action if clear

Output 2-3 sentences max.
`;

  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.3
  });

  return response.choices[0].message.content;
}
