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

- Write ONE natural, moderately detailed customer review in Indian Hinglish.
- Normally write 2–3 natural sentences and aim for roughly 25–45 words when enough customer-provided information is available.
- The review should naturally mix simple Hindi and English, like a real Indian customer casually writing a Google review.
- Prefer simple Hindi sentence structure with common English words where they sound natural.
- Do NOT write the entire review in English unless the customer's selected experiences cannot be expressed naturally in Hinglish.
- Do NOT force Hindi translations of common English words such as staff, service, clean, quality, price, or experience.
- Example style: "Staff friendly the, service bhi achhi lagi aur place clean tha."

Use a natural mix of simple Hindi and English, like a real Indian customer would casually write in a Google review.

Do not force Hindi or English. Use whichever words sound natural in Hinglish.

Rules:
- Use ONLY the information provided by the customer.
- Treat the selected rating and selected experiences as the customer's complete feedback.
- Never invent, assume, infer, or add anything that the customer did not explicitly provide.
- The selected experiences are the COMPLETE source of facts for the review.
- Every factual or descriptive statement in the final review must be directly traceable to one of the selected experiences.
- Avoid unnecessary exclamation marks (!). Use them only when they would genuinely sound natural in a casual customer review.
- Prefer simple, conversational punctuation and sentence structure. Do not make the review sound promotional or overly expressive.
- Do not add food items, products, staff names, prices, services, facilities, events, waiting times, locations, or other details unless explicitly provided.
- Do not mention the business name unless the customer explicitly provides or selects it as part of their feedback.
- Prefer casual, natural Indian Hinglish phrasing. Avoid repetitive phrases such as "overall achha laga" multiple times in the same review.
- Do not turn a general selection into a specific claim.
- The review must honestly match the selected rating.
- For 1–2 star ratings, keep the review genuinely negative or critical when the selected experiences are negative. Do not make it sound positive.
- For 3 stars, keep the tone balanced and neutral.
- For 4–5 stars, keep the tone positive but natural and not exaggerated.
- Mention ONLY the selected experience points.
- You may combine or rephrase selected experience points naturally, but you must not introduce a new fact, feeling, opinion, conclusion, or recommendation.
- Do not add claims such as "welcoming", "pleasant", "comfortable", "relaxed", "nice atmosphere", "worth visiting", or "highly recommended" unless those exact ideas are explicitly selected by the customer.
- Do not mention the numerical rating anywhere in the review.
- Do not write phrases such as "5 stars", "3-star", "one-star", "five-star", "I am leaving a X-star rating", or similar rating explanations.
- Do not mention that AI generated the review.
- Do not use hashtags.
- Do not use exaggerated marketing language such as "best ever", "amazing", "perfect", or "highly recommended" unless the customer's selected information clearly supports that wording.
- Make the review detailed enough to sound like a genuine customer review, but do not pad it with meaningless sentences.
- When multiple selected experiences are available, naturally combine them into 2–3 sentences.
- Never add a new fact just to make the review longer.
- When the same rating and experience selections are provided repeatedly, vary the wording and sentence structure naturally.
- Do not use the exact same sentence pattern every time.
- You may change the order of the selected experience points when it sounds natural.
- You may use natural variations such as "achhi lagi", "achhi thi", "friendly the", "kaafi friendly the", "clean tha", or similar wording, as long as the meaning remains exactly the same.
- Variation must NEVER introduce a new fact, experience, feeling, opinion, or recommendation that the customer did not provide.
- Do not deliberately make the review unusual or complicated just to create variation. Keep it simple and natural.
- The customer can edit the review before posting.
`;

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
        reasoning_effort: "low",

        messages: [
          {
            role: "user",
            content: prompt
          }
        ],

        temperature: 0.7,
        max_tokens: 150
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

const groqReview =
  groqData?.choices?.[0]?.message?.content?.trim();

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

    const review =
      data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

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
