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

FACTUAL BOUNDARY:

The selected experiences are the source of truth for the customer's actual experience.

You may naturally elaborate, rephrase, connect, and express the selected experiences in a human-like way.

However, you must NOT introduce new specific facts or specific experiences that are not reasonably implied by the selected experiences.

The goal is to make the review sound natural and complete, not to simply repeat the selected options word-for-word.

For example:

Selected experience:
Good quality

Natural:
"Quality kaafi achhi lagi. Overall experience achha raha."

Not allowed:
"Khana tasty tha, presentation achhi thi aur sab dishes ki quality consistent thi."

because food taste, presentation, and dish consistency were not provided by the customer.

Selected experiences:
Good quality + Friendly staff + Good service

Natural:
"Quality kaafi achhi lagi. Staff friendly the aur service bhi achhi thi. Overall experience achha raha."

The AI may use general, non-specific connecting language to make the review natural.

The AI must not turn a general experience into a specific one.

For example:
"Good quality" does not automatically mean good food, good taste, fresh food, good ingredients, good products, or good presentation.

"Good service" does not automatically mean fast service, quick service, attentive service, or smooth service.

"Friendly staff" does not automatically mean helpful staff, polite staff, smiling staff, or that staff welcomed the customer.

"Clean" does not automatically mean clean tables, rooms, washrooms, or surroundings.

BUSINESS INFORMATION RULES:

The verified business information is background context only.

Do NOT automatically use business information in the review.

Customer-selected experiences have priority over business information.

A business detail may appear in the review ONLY when:
1. The customer has selected an experience that is directly related to that detail, AND
2. The detail is directly supported by the verified business information.

Never use business information to invent a customer experience.

For example:

Business information:
"Known for biryani."

Customer selects:
"Good food"

Allowed:
"The food quality achhi lagi."

Not allowed:
"The biryani bahut achhi thi."

because the customer did not specifically say that the biryani was good.

Another example:

Business information:
"Family seating available."

Customer selects:
"Clean"

Not allowed:
"Family seating clean aur comfortable thi."

because the customer did not select or describe the seating.

Business information can help identify or clarify a business-related term, but it must never create a new customer experience.
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
SPECIFIC MEANING RULE:

Do not interpret a general experience as a more specific experience.

For example:

"Good quality" does NOT mean:
- good food quality
- good taste
- good product quality
- fresh food
- good ingredients
Also, do not strengthen or intensify the meaning of an experience.

For example:

"Good quality" should remain a simple statement about quality.

Do NOT change it into:
- very good quality
- extremely good quality
- excellent quality
- really good quality
- kaafi achhi quality
- bahut achhi quality

unless the customer explicitly selected a stronger meaning.

unless that exact detail was selected by the customer.

"Good quality" does NOT mean:
- good food quality
- good taste
- good product quality
- fresh food
- good ingredients

unless that exact detail was selected by the customer.

Also, do not strengthen or intensify the meaning of an experience.

For example:

"Good quality" should remain a simple statement about quality.

Do NOT change it into:
- very good quality
- extremely good quality
- excellent quality
- really good quality
- kaafi achhi quality
- bahut achhi quality

unless the customer explicitly selected a stronger meaning.

"Good service" does NOT mean:
- fast service
- quick service
- attentive service
- smooth service

unless that exact detail was selected.

"Friendly staff" does NOT mean:
- helpful staff
- polite staff
- smiling staff
- staff welcomed me

unless that exact detail was selected.

"Clean" does NOT mean:
- clean tables
- clean rooms
- clean washrooms
- clean surroundings

unless that exact detail was selected.

LENGTH AND NATURAL DETAIL:
- Normally write 2–3 natural sentences.
- Aim for roughly 20–35 words when 2–3 experiences are selected.
- Use the available selected experiences fully and naturally.
- You may rephrase, combine, or expand the wording of selected experiences without changing their meaning.
- Do NOT add new facts, specific details, actions, feelings, opinions, reasons, recommendations, or conclusions to make the review longer.
- Do NOT force the review to reach 20–35 words if doing so would require adding information.
- Accuracy and factual consistency are more important than length.
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
