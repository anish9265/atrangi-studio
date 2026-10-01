export default async function handler(req, res) {

  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {

    /*
      ============================================================
      1. READ CUSTOMER INPUT
      ============================================================
    */

    const {
      businessId,
      rating,
      experiences
    } = req.body || {};


    /*
      ============================================================
      2. BASIC VALIDATION
      ============================================================
    */

    if (
      !businessId ||
      !rating ||
      !Array.isArray(experiences) ||
      experiences.length === 0
    ) {
      return res.status(400).json({
        error: "Missing review information"
      });
    }


    const numericBusinessId =
      Number(businessId);

    const numericRating =
      Number(rating);


    if (
      !Number.isInteger(numericBusinessId) ||
      numericBusinessId <= 0
    ) {
      return res.status(400).json({
        error: "Invalid business"
      });
    }


    if (
      !Number.isInteger(numericRating) ||
      numericRating < 1 ||
      numericRating > 5
    ) {
      return res.status(400).json({
        error: "Invalid rating"
      });
    }


    /*
      ============================================================
      3. ALLOWED EXPERIENCE CATEGORIES
      ============================================================

      These are the internal category names used by the system.

      Customer-facing labels can be different.
    */

    const allowedCategories = [

      // Positive
      "good_quality",
      "good_service",
      "friendly_staff",
      "good_value",
      "clean",
      "great_experience",

      // Negative / neutral
      "poor_quality",
      "slow_service",
      "staff_could_be_better",
      "too_expensive",
      "not_clean",
      "overall_disappointing",

      "average_service",
      "average_quality",
      "reasonable_price",
      "could_be_better"

    ];


    /*
      ============================================================
      4. CLEAN CUSTOMER EXPERIENCES
      ============================================================

      Remove duplicates AND invalid categories.
    */

    const selectedExperiences = [
      ...new Set(
        experiences
          .map(item =>
            String(item || "").trim()
          )
          .filter(item =>
            allowedCategories.includes(item)
          )
      )
    ];


    if (!selectedExperiences.length) {
      return res.status(400).json({
        error: "Please select at least one valid experience"
      });
    }


    /*
      ============================================================
      5. SUPABASE CONFIGURATION
      ============================================================
    */

    const supabaseUrl =
      process.env.SUPABASE_URL;

    const serviceRoleKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY;


    if (!supabaseUrl || !serviceRoleKey) {
      return res.status(500).json({
        error: "Server configuration is incomplete"
      });
    }


    const baseUrl =
      supabaseUrl
        .trim()
        .replace(/\/+$/, "")
        .replace(/\/rest\/v1$/, "");


    const supabaseRestUrl =
      `${baseUrl}/rest/v1`;


    const supabaseHeaders = {
      apikey: serviceRoleKey,
      Authorization:
        `Bearer ${serviceRoleKey}`,
      "Content-Type":
        "application/json"
    };


    /*
      ============================================================
      6. FETCH BUSINESS FROM DATABASE
      ============================================================
    */

    const businessResponse =
      await fetch(
        `${supabaseRestUrl}/businesses` +
        `?id=eq.${encodeURIComponent(numericBusinessId)}` +
        `&active=eq.true` +
        `&select=id,name,slug,business_info,category,language`,
        {
          headers: supabaseHeaders
        }
      );


    const businessResponseText =
      await businessResponse.text();


    if (!businessResponse.ok) {

      console.error(
        "Supabase business fetch failed:",
        businessResponseText
      );

      return res.status(500).json({
        error: "Could not load business information"
      });

    }


    let businesses;

    try {

      businesses =
        JSON.parse(
          businessResponseText
        );

    } catch (error) {

      console.error(
        "Invalid Supabase business response:",
        businessResponseText
      );

      return res.status(500).json({
        error: "Invalid business data"
      });

    }


    if (
      !Array.isArray(businesses) ||
      businesses.length === 0
    ) {

      return res.status(404).json({
        error: "Business not found or inactive"
      });

    }


    const business =
      businesses[0];


    /*
      ============================================================
      7. FETCH BUSINESS-SPECIFIC FACTS
      ============================================================

      Facts are stored in:

      public.business_facts

      Only active facts belonging to this business are used.
    */

    const factsResponse =
      await fetch(
        `${supabaseRestUrl}/business_facts` +
        `?business_id=eq.${encodeURIComponent(numericBusinessId)}` +
        `&active=eq.true` +
        `&select=category,fact` +
        `&order=id.asc`,
        {
          headers: supabaseHeaders
        }
      );


    const factsResponseText =
      await factsResponse.text();


    if (!factsResponse.ok) {

      console.error(
        "Supabase business facts fetch failed:",
        factsResponseText
      );

      return res.status(500).json({
        error: "Could not load business facts"
      });

    }


    let businessFacts = [];


    try {

      businessFacts =
        JSON.parse(
          factsResponseText
        );

    } catch (error) {

      console.error(
        "Invalid business facts response:",
        factsResponseText
      );

      return res.status(500).json({
        error: "Invalid business facts"
      });

    }


    /*
      ============================================================
      8. ORGANIZE FACTS BY CATEGORY
      ============================================================
    */

    const factsByCategory = {};


    for (const item of businessFacts) {

      if (
        !item ||
        !item.category ||
        !item.fact
      ) {
        continue;
      }


      const category =
        String(item.category).trim();

      const fact =
        String(item.fact).trim();


      if (!factsByCategory[category]) {
        factsByCategory[category] = [];
      }


      factsByCategory[category].push(
        fact
      );

    }


    /*
      ============================================================
      9. FIND RELEVANT BUSINESS FACTS
      ============================================================

      Only facts belonging to selected experiences are supplied
      to the AI.

      Example:

      Good Service selected
      → service-related facts

      Good Quality selected
      → quality-related facts

      This prevents unrelated facts from appearing.
    */

    const relevantFacts = [];


    for (
      const experience of selectedExperiences
    ) {

      const categoryFacts =
        factsByCategory[experience] || [];


      for (
        const fact of categoryFacts
      ) {

        relevantFacts.push({
          category: experience,
          fact
        });

      }

    }


    /*
      ============================================================
      10. FORMAT VERIFIED FACTS
      ============================================================
    */

    let verifiedFactsText =
      "No business-specific facts are available for the selected experiences.";


    if (relevantFacts.length > 0) {

      verifiedFactsText =
        relevantFacts
          .map(
            item =>
              `- ${item.category}: ${item.fact}`
          )
          .join("\n");

    }


    /*
      ============================================================
      11. BUSINESS INFORMATION
      ============================================================
    */

    const businessInfo =
      business.business_info
        ? String(
            business.business_info
          ).trim()
        : "";


    /*
      ============================================================
      12. BUILD AI PROMPT
      ============================================================

      IMPORTANT:

      The AI is primarily writing in natural Hinglish.

      Hinglish means:
      Roman-script Hindi mixed naturally with English.

      Example:
      "Service kaafi achhi thi aur staff bhi friendly tha."

      NOT:
      Hindi Devanagari script.

      The AI still has freedom in wording and structure.
    */

    const prompt = `You are helping a real customer express their genuine experience as a Google review.

Write a short, natural customer review based on the customer's selected experiences.

The review should sound like something a normal Indian customer would naturally write, not like professional marketing copy or an AI-generated template.

LANGUAGE STYLE:
Use natural Hinglish as the default.

Hinglish means Roman-script Hindi naturally mixed with English.

Examples of the style:
- "Service kaafi achhi thi aur staff bhi friendly tha."
- "Overall experience accha raha, aur prices bhi reasonable the."
- "Place clean tha aur service bhi quick thi."

Do NOT use Hindi Devanagari script.

Do not force Hindi into every sentence. Natural English words such as service, staff, quality, clean, price, food, experience, etc. are completely fine.

The final review should feel like a normal Indian customer casually writing in Hinglish.

BUSINESS:
${business.name}

BUSINESS CATEGORY:
${business.category || "local business"}

GENERAL BUSINESS INFORMATION:
${businessInfo || "None available."}

CUSTOMER RATING:
${numericRating}/5

CUSTOMER SELECTED EXPERIENCES:
${selectedExperiences.join(", ")}

VERIFIED BUSINESS FACTS:
${verifiedFactsText}


CORE RULES:

1. The customer's selected experiences are the main source of truth.

2. Express the selected experiences naturally. You can rewrite, combine, reorder, connect or simplify them however you think sounds most natural.

3. Verified business facts are supporting context. Use them when they naturally help explain or strengthen a selected experience.

4. A verified fact can make a review more specific, but do not force every available fact into the review.

5. Do not invent new specific experiences, events, products, services, details or claims that are not supported by the customer's selected experiences or relevant verified business facts.

6. Do not simply repeat the option labels word-for-word. Convert them into natural customer language.

7. The customer rating should influence the overall tone:
   - 1–2 stars: negative or dissatisfied
   - 3 stars: neutral or mixed
   - 4 stars: positive but moderate
   - 5 stars: clearly positive

8. For positive 5-star experiences, keep the review clearly positive.

9. For negative or lower-rated reviews, describe the selected negative experience naturally. Do not invent additional complaints.

10. When "Good Quality" is selected, do not automatically assume taste, freshness, ingredients, portion size or any other specific detail unless a relevant verified business fact supports it.

11. When "Good Value" or "Reasonable Price" is selected, do not automatically mention exact prices or discounts unless supported by verified facts.

12. When multiple experiences are selected, combine them naturally rather than writing a separate sentence for every option.

13. All selected experiences should be meaningfully represented, but they do not need to appear as separate points.

14. "Great Experience" is an overall impression. It does not need to become a separate sentence. Let it influence the overall positive feeling when appropriate.

15. Simple phrases such as "overall experience accha raha" are allowed when they genuinely fit the review. Do not use the same ending every time.

16. Do not exaggerate or turn the review into advertising.

17. Do not use overly polished, corporate or promotional language.

18. Do not mention the business name, AI, these instructions, or the numerical rating.

19. Do not add recommendations such as "highly recommend", "must try", "worth visiting" or "would visit again" unless the customer has explicitly expressed that sentiment.

20. Keep the customer's meaning unchanged.

21. Do not make every review follow the same sentence structure.

22. Vary the natural flow, opening, sentence length and wording when appropriate.

23. Not every review needs to be equally polished. Simple everyday language is often better.

24. Do not force variation just for the sake of being different. If a simple sentence sounds natural, use it.

25. Keep the review concise. Usually 1–3 short sentences are enough.

26. Do not add extra details just to make the review longer.

27. The review should sound like a real customer casually expressing what they experienced, not like an AI trying to sound human.

28. Business-specific facts can be naturally paraphrased into Hinglish. Do not copy database facts mechanically.

29. If the available verified facts are not needed, simply do not use them.

30. Do not mention information from the general business description as if the customer personally experienced it unless it is supported by the selected experiences or relevant verified facts.

Return ONLY the final review.

No explanation.
No "Review:" label.
No quotation marks.
No markdown.
No hashtags.`;


    /*
      ============================================================
      13. CLEAN AI OUTPUT
      ============================================================
    */

    function cleanReviewText(text) {

      if (!text) return "";


      let cleaned =
        String(text).trim();


      const endMarkers = [
        "<|endoftext|>",
        "<|end_of_text|>",
        "</s>"
      ];


      for (
        const marker of endMarkers
      ) {

        const index =
          cleaned.indexOf(marker);


        if (index !== -1) {

          cleaned =
            cleaned
              .substring(0, index)
              .trim();

        }

      }


      cleaned =
        cleaned
          .replace(
            /^Review:\s*/i,
            ""
          )
          .trim();


      cleaned =
        cleaned
          .replace(/[—–]/g, ", ")
          .replace(/\s+,/g, ",")
          .replace(/,\s*,/g, ",")
          .replace(/\s{2,}/g, " ")
          .trim();


      /*
        Remove accidental surrounding quotation marks.
      */

      if (
        cleaned.startsWith('"') &&
        cleaned.endsWith('"')
      ) {

        cleaned =
          cleaned
            .slice(1, -1)
            .trim();

      }


      if (
        cleaned.startsWith("'") &&
        cleaned.endsWith("'")
      ) {

        cleaned =
          cleaned
            .slice(1, -1)
            .trim();

      }


      return cleaned;

    }


    /*
      ============================================================
      14. GEMINI PRIMARY
      ============================================================
    */

    const generateWithGemini =
      async () => {

        if (!process.env.GEMINI_API_KEY) {

          throw new Error(
            "GEMINI_API_KEY is missing"
          );

        }


        const maxRetries = 3;

        let response;


        for (
          let attempt = 0;
          attempt < maxRetries;
          attempt++
        ) {

          response =
            await fetch(
              "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=" +
              process.env.GEMINI_API_KEY,
              {
                method: "POST",

                headers: {
                  "Content-Type":
                    "application/json"
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
                  ],

                  generationConfig: {
                    temperature: 0.85,
                    maxOutputTokens: 180
                  }

                })
              }
            );


          if (response.ok) {
            break;
          }


          const errorText =
            await response.text();


          console.error(
            `Gemini attempt ${attempt + 1} failed:`,
            errorText
          );


          /*
            Daily quota exceeded:
            retrying will not help.
          */

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


          /*
            Retry only temporary failures.
          */

          if (
            response.status !== 429 &&
            response.status !== 503
          ) {
            break;
          }


          if (
            attempt <
            maxRetries - 1
          ) {

            const delay =
              1000 *
              Math.pow(
                2,
                attempt
              );


            console.log(
              `Retrying Gemini in ${delay}ms...`
            );


            await new Promise(
              resolve =>
                setTimeout(
                  resolve,
                  delay
                )
            );

          }

        }


        if (
          !response ||
          !response.ok
        ) {

          throw new Error(
            "Gemini API request failed"
          );

        }


        const data =
          await response.json();


        const rawReview =
          data
            ?.candidates?.[0]
            ?.content?.parts?.[0]
            ?.text;


        const review =
          cleanReviewText(
            rawReview
          );


        if (!review) {

          throw new Error(
            "Gemini returned no review"
          );

        }


        console.log(
          "AI PROVIDER USED: GEMINI"
        );


        return review;

      };


    /*
      ============================================================
      15. GROQ BACKUP
      ============================================================
    */

    const generateWithGroq =
      async () => {

        if (!process.env.GROQ_API_KEY) {

          throw new Error(
            "GROQ_API_KEY is missing"
          );

        }


        const groqResponse =
          await fetch(
            "https://api.groq.com/openai/v1/chat/completions",
            {
              method: "POST",

              headers: {
                "Content-Type":
                  "application/json",

                "Authorization":
                  `Bearer ${process.env.GROQ_API_KEY}`
              },

              body: JSON.stringify({

                model:
                  "openai/gpt-oss-20b",

                messages: [
                  {
                    role: "user",
                    content: prompt
                  }
                ],

                temperature: 0.8,

                max_completion_tokens:
                  500,

                reasoning_effort:
                  "low",

                include_reasoning:
                  false

              })
            }
          );


        if (!groqResponse.ok) {

          const errorText =
            await groqResponse.text();


          console.error(
            "Groq API error:",
            errorText
          );


          throw new Error(
            "Groq API request failed"
          );

        }


        const groqData =
          await groqResponse.json();


        console.log(
          "Groq response:",
          JSON.stringify(groqData)
        );


        const rawGroqReview =
          groqData
            ?.choices?.[0]
            ?.message?.content;


        const groqReview =
          cleanReviewText(
            rawGroqReview
          );


        if (!groqReview) {

          throw new Error(
            "Groq returned no review"
          );

        }


        console.log(
          "AI PROVIDER USED: GROQ"
        );


        return groqReview;

      };


    /*
      ============================================================
      16. GEMINI FIRST → GROQ FALLBACK
      ============================================================
    */

    try {

      const review =
        await generateWithGemini();


      return res.status(200).json({
        review,
        provider: "gemini"
      });

    } catch (geminiError) {

      console.error(
        "Gemini primary failed. Trying Groq backup...",
        geminiError
      );

    }


    try {

      const review =
        await generateWithGroq();


      return res.status(200).json({
        review,
        provider: "groq"
      });

    } catch (groqError) {

      console.error(
        "Groq backup also failed:",
        groqError
      );


      return res.status(500).json({
        error:
          "Both AI services failed"
      });

    }


  } catch (error) {

    console.error(
      "Server error:",
      error
    );


    return res.status(500).json({
      error:
        "Something went wrong"
    });

  }

}
