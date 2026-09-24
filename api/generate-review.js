export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {
    const { businessName, rating, experiences } = req.body;

    if (!businessName || !rating || !Array.isArray(experiences)) {
      return res.status(400).json({
        error: "Missing review information"
      });
    }

const prompt = `
You are helping a customer write a genuine Google review.

Business: ${businessName}
Rating selected by customer: ${rating}/5
Customer's selected experiences: ${experiences.join(", ")}

Write ONE natural customer review in Indian Hinglish.

STYLE:
- Normally write 2–3 natural sentences.
- Aim for roughly 25–45 words when enough customer-provided information is available.
- Use simple Indian Hinglish.
- Mix Hindi and common English words naturally.
- Do not make every review sound identical.
- Keep the review conversational, simple and believable.
- Do not make it sound like an advertisement or marketing copy.

IMPORTANT STRUCTURE RULES:
- Do NOT automatically start the review with the first selected experience.
- Do NOT simply follow the exact order in which the experiences were selected.
- You may naturally change the order of the selected experiences.
- Vary the sentence structure and opening from one generation to another.
- You may use neutral structural openings such as "Overall," or "Mera experience..." when they do not introduce any new fact.
- Do NOT add a positive or negative feeling in the opening unless it is directly supported by the customer's selected information and rating.
- Do NOT repeatedly use the same opening pattern.
- Do NOT deliberately make the wording complicated just to create variation.

FACTUAL RULES:
- Use ONLY information provided by the customer.
- Treat the selected rating and selected experiences as the complete source of facts.
- Never invent, assume, infer, or add anything that the customer did not explicitly provide.
- Every factual or descriptive statement must be directly traceable to the selected experiences.
- You may combine or rephrase selected experiences naturally.
- You may change their order.
- You must not introduce a new fact, feeling, opinion, recommendation, or conclusion.
- Do not add food items, products, staff names, prices, facilities, locations, waiting times, atmosphere, events, or other details unless explicitly selected.
- Do not mention the business name.
- Do not mention the numerical rating.
- Do not mention that AI generated the review.
- Do not use hashtags.

RATING TONE:
- For 1–2 stars, the review should honestly reflect the selected negative experiences.
- For 3 stars, keep the tone balanced and neutral.
- For 4–5 stars, keep the tone positive only to the extent supported by the selected experiences.
- Do not turn a low rating into a positive review.
- Do not make a high rating sound exaggerated.

LANGUAGE:
- Prefer natural Indian Hinglish.
- Do not force Hindi translations of common English words such as staff, service, clean, quality, price, or experience.
- Do not write the entire review in English unless Hinglish would sound unnatural.
- Avoid repetitive phrases.

OUTPUT FORMAT:
- Return ONLY the final customer review.
- Do not write an introduction.
- Do not explain your answer.
- Do not write "Here is your review".
- Do not add notes, analysis, commentary, or instructions.
- Do not output markdown.
- Do not output labels such as "Review:".
- Stop immediately after the final review.
`;

    function cleanReviewText(text) {

  if (!text) return "";

  let cleaned = text.trim();

  // Remove model end-of-text marker and everything after it
  const endMarkers = [
    "<|endoftext|>",
    "<|end_of_text|>",
    "</s>"
  ];

  for (const marker of endMarkers) {

    const index =
      cleaned.indexOf(marker);

    if (index !== -1) {
      cleaned =
        cleaned.substring(0, index).trim();
    }

  }

  // Remove accidental "Review:" prefix
cleaned =
  cleaned.replace(
    /^Review:\s*/i,
    ""
  ).trim();

// Make punctuation more natural for casual reviews
cleaned =
  cleaned
    .replace(/[—–]/g, ", ")
    .replace(/\s+,/g, ",")
    .replace(/,\s*,/g, ",")
    .replace(/\s{2,}/g, " ")
    .trim();

return cleaned;
}
    const generateWithGroq = async () => {

  const groqResponse = await fetch(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.GROQ_API_KEY}`
      },

      body: JSON.stringify({
        model: "openai/gpt-oss-20b",


        messages: [
          {
            role: "user",
            content: prompt
          }
        ],

        temperature: 0.7,
max_completion_tokens: 500,
reasoning_effort: "low",
include_reasoning: false,
      })
    }
  );

  if (!groqResponse.ok) {
    const errorText = await groqResponse.text();

    console.error("Groq API error:", errorText);

    throw new Error("Groq API request failed");
  }

  const groqData = await groqResponse.json();

console.log("Groq response:", JSON.stringify(groqData));

const rawGroqReview =
  groqData?.choices?.[0]?.message?.content;

const groqReview =
  cleanReviewText(rawGroqReview);

if (!groqReview) {
  throw new Error(
    "Groq returned no text. Check Vercel logs for the full response."
  );
}

  return groqReview;
};
const maxRetries = 3;
let response;

for (let attempt = 0; attempt < maxRetries; attempt++) {

  response = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=" +
      process.env.GEMINI_API_KEY,
    {
      method: "POST",

      headers: {
        "Content-Type": "application/json"
      },

      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: prompt
              }
            ]
          }
        ]
      })
    }
  );

  if (response.ok) {
    break;
  }

  const errorText = await response.text();

  console.error(
    `Gemini attempt ${attempt + 1} failed:`,
    errorText
  );

  // Daily quota exceeded → retry mat karo
  if (
    response.status === 429 &&
    (
      errorText.includes("PerDay") ||
      errorText.includes("per_day") ||
      errorText.includes("daily") ||
      errorText.includes("quota")
    )
  ) {
    console.log(
      "Gemini daily quota exceeded. Switching to Groq..."
    );
    break;
  }

  // Sirf temporary 429/503 par retry
  if (response.status !== 429 && response.status !== 503) {
    break;
  }

  if (attempt < maxRetries - 1) {

    const delay =
      1000 * Math.pow(2, attempt);

    console.log(
      `Retrying Gemini in ${delay}ms...`
    );

    await new Promise(resolve =>
      setTimeout(resolve, delay)
    );
  }
}


if (!response.ok) {

  console.error(
    "Gemini failed after retries. Trying Groq backup..."
  );

  try {

    const review = await generateWithGroq();

    return res.status(200).json({
      review,
      provider: "backup"
    });

  } catch (groqError) {

    console.error(
      "Groq backup also failed:",
      groqError
    );

    return res.status(500).json({
      error: "Both AI services failed"
    });
  }
}

    const data = await response.json();

const rawReview =
  data?.candidates?.[0]?.content?.parts?.[0]?.text;

const review =
  cleanReviewText(rawReview);

    if (!review) {
      return res.status(500).json({
        error: "No review generated"
      });
    }

    return res.status(200).json({
      review
    });

  } catch (error) {

    console.error("Server error:", error);

    return res.status(500).json({
      error: "Something went wrong"
    });
  }
}
