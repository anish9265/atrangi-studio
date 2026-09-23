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

Write ONE short, natural-sounding customer review in natural Indian Hinglish.

Use a natural mix of simple Hindi and English, like a real Indian customer would casually write in a Google review.

Do not force Hindi or English. Use whichever words sound natural in Hinglish.

Rules:
- Use ONLY the information provided by the customer.
- Treat the selected rating and selected experiences as the customer's complete feedback.
- Never invent or assume anything that the customer did not provide.
- Do not add food items, products, staff names, prices, services, facilities, events, waiting times, locations, or other details unless explicitly provided.
- Do not turn a general selection into a specific claim.
- The review must honestly match the selected rating.
- For 1–2 star ratings, keep the review genuinely negative or critical when the selected experiences are negative. Do not make it sound positive.
- For 3 stars, keep the tone balanced and neutral.
- For 4–5 stars, keep the tone positive but natural and not exaggerated.
- Mention only the selected experience points.
- Do not mention the numerical rating anywhere in the review.
- Do not write phrases such as "5 stars", "3-star", "one-star", "five-star", "I am leaving a X-star rating", or similar rating explanations.
- Do not mention that AI generated the review.
- Do not use hashtags.
- Do not use exaggerated marketing language such as "best ever", "amazing", "perfect", or "highly recommended" unless the customer's selected information clearly supports that wording.
- Keep the review short and natural, usually around 20–40 words.
- Do not add unnecessary sentences just to reach a word count.
- Make it sound like a real customer wrote it, not like an AI-generated advertisement.
- The customer can edit the review before posting.
`;

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=" +
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

if (!response.ok) {
  const errorText = await response.text();

  console.error("Gemini API error:", errorText);

  return res.status(500).json({
    error: "Gemini API request failed",
    status: response.status,
    details: errorText
  });
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
