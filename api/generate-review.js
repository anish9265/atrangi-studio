export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {
const {
  businessName,
  businessInfo,
  rating,
  experiences
} = req.body;

    if (!businessName || !rating || !Array.isArray(experiences)) {
      return res.status(400).json({
        error: "Missing review information"
      });
    }

const prompt = `
You are helping a customer write a genuine Google review.

Business: ${businessName}

Verified business information:
${businessInfo || "No additional business information is available."}

Rating selected by customer: ${rating}/5
Customer's selected experiences: ${experiences.join(", ")}

Write ONE short, natural customer review in Indian Hinglish.

ABSOLUTE FACTUAL RULE:
The customer's selected experiences are the ONLY facts you are allowed to use.

You MUST NOT add, assume, infer, exaggerate, or invent ANY information.

Every statement in the review must be directly supported by one or more of the selected experiences.

You may:
- Rephrase a selected experience.
- Combine selected experiences.
- Change the order of selected experiences.
- Use natural connecting words.
- Make the grammar sound natural.

You MUST NOT:
- Add any new fact.
- Add any new feeling or emotion.
- Add any new opinion.
- Add any recommendation.
- Add any conclusion.
- Add any reason that was not selected.
- Add details about food, products, staff behavior, price, location, cleanliness, atmosphere, waiting time, facilities, etc. unless explicitly selected.
- Say "I loved it", "I really liked it", "highly recommend", "would visit again", "great experience", "friendly vibes", "good value", "comfortable", "improvement is needed", or similar statements unless the exact meaning is directly supported by the selected experiences.
- Use words such as "always", "never", "very", "extremely", "perfect", "amazing", or "excellent" unless they are directly supported by the selected information.
- Mention the business name.
- Mention the numerical rating.
- Mention AI.
- Use hashtags.

IMPORTANT:
Do NOT treat the rating itself as an experience.

For example:
If the customer selects:
"Slow service"
"Staff careless"
"Not clean"

You may write:
"Service kaafi slow thi aur staff thode careless lage. Jagah bhi clean nahi lagi."

But you MUST NOT write:
"Overall improvement ki zaroorat hai."
"Experience disappointing tha."
"Main dobara nahi aaunga."
"Customer service better honi chahiye."

Those statements contain conclusions or opinions that the customer did not explicitly provide.

RATING TONE:
- 1–2 stars: honestly reflect only the selected negative experiences.
- 3 stars: use only the selected experiences and keep the wording neutral.
- 4–5 stars: use only the selected positive experiences.
- Never make a low rating sound positive.
- Never make a high rating exaggerated.

STYLE:
- Write 1–3 short natural sentences.
- Usually around 20–40 words.
- Use simple Indian Hinglish.
- Mix Hindi and common English words naturally.
- Keep it conversational.
- Do not make it sound like advertising.
- Do not use complicated language.
- Do not repeatedly use the same sentence structure.
- You may vary the order of selected experiences.

VERY IMPORTANT:
Natural language must NEVER be created by adding new facts.

LENGTH AND NATURAL DETAIL:
- Do not make the review unnecessarily short just because only a few experiences were selected.
- Normally write 2–3 natural sentences.
- Aim for roughly 20–35 words when 2–3 experiences are selected.
- Do not add information just to reach the target length.
- Accuracy is more important than review length.
You may make the review longer ONLY by:
- Rephrasing the exact selected experiences.
- Combining two or more selected experiences into natural sentences.
- Expressing the same selected experience in slightly different natural wording.
- Adding natural connecting words between selected experiences.

You MUST NOT expand a selected experience into a more specific detail.

For example:
"Good quality" does NOT mean food quality, product quality, taste, or any specific type of quality unless that exact detail was selected.

"Friendly staff" does NOT mean smiling, helping, taking orders, paying attention, or being polite unless those details were selected.

"Good service" does NOT mean fast service, attentive service, smooth service, quick ordering, or good staff behavior unless those details were selected.

"Clean" does NOT mean clean tables, clean rooms, clean washrooms, clean surroundings, or well-maintained unless that detail was selected.

Never create examples, reasons, situations, actions, people, objects, or specific details that are not explicitly present in the customer's selected experiences.
- This elaboration must NOT introduce a new factual detail, new event, new product, new facility, new person, new feeling, new recommendation, or new conclusion.
- Never repeat the exact same selected experience just to increase word count.
- If there is not enough information to naturally reach 30–50 words, write a shorter review rather than inventing information.

OUTPUT:
Return ONLY the final review.
No introduction.
No explanation.
No "Review:" label.
No quotation marks around the review.
No markdown.
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

      console.log("AI PROVIDER USED: GROQ");
  return groqReview;
};
const generateWithGemini = async () => {

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
        "Gemini daily quota exceeded."
      );
      break;
    }

    // Sirf temporary 429/503 par retry
    if (
      response.status !== 429 &&
      response.status !== 503
    ) {
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

  if (!response || !response.ok) {

    throw new Error(
      "Gemini API request failed"
    );
  }

  const data = await response.json();

  const rawReview =
    data?.candidates?.[0]?.content?.parts?.[0]?.text;

  const review =
    cleanReviewText(rawReview);

  if (!review) {

    throw new Error(
      "Gemini returned no review"
    );
  }

  console.log("AI PROVIDER USED: GEMINI");

  return review;
};


// GROQ PRIMARY
try {

  const review =
    await generateWithGroq();

  return res.status(200).json({
    review,
    provider: "groq"
  });

} catch (groqError) {

  console.error(
    "Groq primary failed. Trying Gemini backup...",
    groqError
  );

}


// GEMINI BACKUP
try {

  const review =
    await generateWithGemini();

  return res.status(200).json({
    review,
    provider: "gemini"
  });

} catch (geminiError) {

  console.error(
    "Gemini backup also failed:",
    geminiError
  );

  return res.status(500).json({
    error: "Both AI services failed"
  });

}

  } catch (error) {

    console.error("Server error:", error);

    return res.status(500).json({
      error: "Something went wrong"
    });
  }
}
