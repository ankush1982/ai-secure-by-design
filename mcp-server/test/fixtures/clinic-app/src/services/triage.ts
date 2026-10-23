import OpenAI from 'openai';

const openai = new OpenAI();

export async function triage(symptoms: string) {
  const res = await openai.chat.completions.create({
    model: 'gpt-x',
    messages: [{ role: 'user', content: symptoms }],
  });
  return res.choices[0]?.message.content;
}
