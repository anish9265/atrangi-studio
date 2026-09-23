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

Write ONE short, natural-sounding review in simple English.

Rules:
- Use ONLY the information provided above.
- Do not invent food items, products, staff names, prices, services, events, or other details.
- The review must match the selected rating.
- Do not exaggerate.
- Do not mention that AI wrote the review.
- Do not use hashtags.
- Keep it around 25-45 words.
- Do not mention the star rating or write phrases like "5 stars", "3-star", "one-star", "five-star", or "I am leaving a X-star rating".
- Do not explicitly state the numerical rating in the review.
- Make the review sound like a natural customer-written review, not a rating explanation.
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
