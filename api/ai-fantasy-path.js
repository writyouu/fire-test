/**
 * Vercel Serverless Function (Node.js)
 * - 作为 DeepSeek API 代理，避免在前端暴露 API Key
 *
 * 部署前请在 Vercel 项目环境变量中配置：
 * - DEEPSEEK_API_KEY=xxx
 *
 * 说明：
 * - 前端会 POST /api/ai-fantasy-path
 * - 返回格式：{ text: "..." }
 */
export default async function handler(req, res) {
  // 允许预检请求（可选，但对某些本地调试场景更友好）
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Origin", "*");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const apiKey = process.env.sk-0aff1ef583de4f0c949965da6e1f1174;
    if (!apiKey) {
      return res.status(500).json({ error: "Missing DEEPSEEK_API_KEY" });
    }

    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const personaName = String(body.personaName || "").trim();
    const personaIcon = String(body.personaIcon || "").trim();
    const score = Number(body.score || 0);
    const radar = Array.isArray(body.radar) ? body.radar : [];

    if (!personaName) {
      return res.status(400).json({ error: "Missing personaName" });
    }

    const prompt = [
      `你是一个善于写“财务自由幻想路径”的中文写作助手。`,
      `请根据用户的人设，生成一段约200字的个性化文字（180~230字为佳）。`,
      `要求：第二人称“你”，语气像一位克制但有画面感的教练；不要出现“我是AI/作为模型”等字样；不要给投资建议或具体标的；给出1~2个可执行的小动作。`,
      ``,
      `用户人设：${personaIcon ? personaIcon + " " : ""}${personaName}`,
      `用户总分：${Number.isFinite(score) ? score : "未知"}/36`,
      `四维雷达（储蓄力/投资力/消费力/风险力，0-100）：${radar.join("/") || "未知"}`,
      ``,
      `请直接输出正文，不要标题、不要列表编号。`
    ].join("\n");

    // DeepSeek OpenAI-compatible base_url: https://api.deepseek.com
    // Docs sample path: /chat/completions  (no /v1)
    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        // deepseek-chat 将于 2026/07/24 弃用，改用 v4 系列
        model: "deepseek-v4-flash",
        messages: [
          { role: "system", content: "你是严谨、简洁、擅长写作的中文助手。" },
          { role: "user", content: prompt },
        ],
        // 为了生成约 200 字中文（180~230），350 token 足够
        temperature: 0.8,
        max_tokens: 350,
        // 不开启思考模式，避免不必要的延迟与费用（如需可改 enabled）
        thinking: { type: "disabled" },
        stream: false,
      }),
    });

    if (!response.ok) {
      const raw = await response.text().catch(() => "");
      return res.status(502).json({ error: "DeepSeek API error", status: response.status, raw: raw.slice(0, 800) });
    }

    const data = await response.json();
    const text = String(data?.choices?.[0]?.message?.content || "").trim();
    if (!text) {
      return res.status(502).json({ error: "Empty response from DeepSeek" });
    }

    // 轻度清洗：去掉可能的引号包裹
    const cleaned = text.replace(/^["“](.*)["”]$/s, "$1").trim();

    return res.status(200).json({ text: cleaned });
  } catch (err) {
    return res.status(500).json({ error: "Server error", message: String(err?.message || err) });
  }
}
