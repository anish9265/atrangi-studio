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
      3. EXPERIENCE MAPPING
      ============================================================

      Customer-facing labels come from the review page.

      Example:
      "Good quality"

      Internally:
      "good_quality"

      We support BOTH formats so the backend remains flexible.
    */

    const experienceMap = {

      // Positive
      "Friendly staff": "friendly_staff",
      "Good service": "good_service",
      "Good quality": "good_quality",
      "Good value": "good_value",
      "Clean": "clean",
      "Great experience": "great_experience",

      // Negative / neutral
      "Poor quality": "poor_quality",
      "Slow service": "slow_service",
      "Staff could be better": "staff_could_be_better",
      "Too expensive": "too_expensive",
      "Not clean": "not_clean",
      "Overall disappointing": "overall_disappointing",

      "Average service": "average_service",
      "Average quality": "average_quality",
      "Reasonable price": "reasonable_price",
      "Could be better": "could_be_better",

      // Also accept internal names directly
      "friendly_staff": "friendly_staff",
      "good_service": "good_service",
      "good_quality": "good_quality",
      "good_value": "good_value",
      "clean": "clean",
      "great_experience": "great_experience",

      "poor_quality": "poor_quality",
      "slow_service": "slow_service",
      "staff_could_be_better": "staff_could_be_better",
      "too_expensive": "too_expensive",
      "not_clean": "not_clean",
      "overall_disappointing": "overall_disappointing",

      "average_service": "average_service",
      "average_quality": "average_quality",
      "reasonable_price": "reasonable_price",
      "could_be_better": "could_be_better"

    };


    /*
      ============================================================
      4. CLEAN CUSTOMER EXPERIENCES
      ============================================================
    */

    const selectedExperienceObjects = [
      ...new Map(

        experiences
          .map(item =>
            String(item || "").trim()
          )
          .map(label => {

            const category =
              experienceMap[label];

            if (!category) {
              return null;
            }

            return [
              category,
              {
                label,
                category
              }
            ];

          })
          .filter(Boolean)

      ).values()
    ];


    if (
      selectedExperienceObjects.length === 0
    ) {
      return res.status(400).json({
        error: "Please select at least one valid experience"
      });
    }


    const selectedCategories =
      selectedExperienceObjects.map(
        item => item.category
      );


    const selectedLabels =
      selectedExperienceObjects.map(
        item => item.label
      );


    /*
      ============================================================
      5. SUPABASE CONFIGURATION
      ============================================================
    */

    const supabaseUrl =
      process.env.SUPABASE_URL;

    const serviceRoleKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY;


    if (
      !supabaseUrl ||
      !serviceRoleKey
    ) {
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
      6. FETCH BUSINESS
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
        error:
          "Could not load business information"
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
        error:
          "Invalid business data"
      });

    }


    if (
      !Array.isArray(businesses) ||
      businesses.length === 0
    ) {

      return res.status(404).json({
        error:
          "Business not found or inactive"
      });

    }


    const business =
      businesses[0];


    /*
      ============================================================
      7. FETCH BUSINESS-SPECIFIC FACTS
      ============================================================

      We fetch all active facts for this business.

      Then we normalize their categories in JavaScript.

      This allows the database to contain either:

      good_quality

      OR

      Good quality

      without breaking the system.
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
        error:
          "Could not load business facts"
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
        error:
          "Invalid business facts"
      });

    }


    /*
      ============================================================
      8. NORMALIZE FACT CATEGORY
      ============================================================
    */

    function normalizeCategory(value) {

      if (!value) {
        return "";
      }

      const cleaned =
        String(value)
          .trim()
          .toLowerCase();

      /*
        Direct internal category
      */

      if (
        Object.values(experienceMap)
          .includes(cleaned)
      ) {
        return cleaned;
      }


      /*
        Customer-facing category
      */

      if (
        experienceMap[value]
      ) {
        return experienceMap[value];
      }


      /*
        Normalize common formatting
      */

      const normalized =
        cleaned
          .replace(/[\s-]+/g, "_");


      if (
        Object.values(experienceMap)
          .includes(normalized)
      ) {
        return normalized;
      }


      return normalized;
    }


    /*
      ============================================================
      9. ORGANIZE FACTS BY NORMALIZED CATEGORY
      ============================================================
    */

    const factsByCategory = {};


    for (
      const item of businessFacts
    ) {

      if (
        !item ||
        !item.category ||
        !item.fact
      ) {
        continue;
      }


      const category =
        normalizeCategory(
          item.category
        );


      const fact =
        String(item.fact)
          .trim();


      if (
        !category ||
        !fact
      ) {
        continue;
      }


      if (
        !factsByCategory[category]
      ) {

        factsByCategory[category] = [];

      }


      factsByCategory[category].push(
        fact
      );

    }


    /*
      ============================================================
      10. FIND RELEVANT BUSINESS FACTS
      ============================================================
    */

    const relevantFacts = [];


    for (
      const category of selectedCategories
    ) {

      const categoryFacts =
        factsByCategory[category] || [];


      for (
        const fact of categoryFacts
      ) {

        relevantFacts.push({
          category,
          fact
        });

      }

    }


    /*
      ============================================================
      11. FORMAT VERIFIED FACTS
      ============================================================
    */

    let verifiedFactsText =
      "No business-specific facts are available for the selected experiences.";


    if (
      relevantFacts.length > 0
    ) {

      verifiedFactsText =
        relevantFacts
          .map(item =>
            `- ${item.category}: ${item.fact}`
          )
          .join("\n");

    }


    /*
      ============================================================
      12. BUSINESS INFORMATION
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
      13. BUILD AI PROMPT
      ============================================================
    */

    const prompt = `You are helping a real customer express their genuine experience as a Google review.

Write a short, natural customer review based on the customer's selected experiences.

The customer should remain the source of the actual experience. Your job is to help express that experience naturally and clearly.

LANGUAGE STYLE:

Use natural Hinglish as the default.

Hinglish means Roman-script Hindi naturally mixed with English.

Examples:

"Service kaafi achhi thi aur staff bhi friendly tha."

"Overall experience accha raha, aur prices bhi reasonable the."

"Place clean tha aur service bhi quick thi."

Do NOT use Hindi Devanagari script.

Natural English is completely fine when it sounds more natural. Do not force Hindi into every sentence.

The review should sound like a normal Indian customer casually expressing their experience.

BUSINESS:
${business.name}

BUSINESS CATEGORY:
${business.category || "local business"}

GENERAL BUSINESS INFORMATION:
${businessInfo || "None available."}

CUSTOMER RATING:
${numericRating}/5

CUSTOMER SELECTED EXPERIENCES:
${selectedLabels.join(", ")}

INTERNAL EXPERIENCE CATEGORIES:
${selectedCategories.join(", ")}

VERIFIED BUSINESS FACTS:
${verifiedFactsText}


CORE RULES:

1. The customer's selected experiences are the main source of truth.

2. Express those experiences naturally. You may rewrite, combine, reorder, connect or simplify them.

3. Verified business facts are supporting context. Use them when they naturally help express a selected experience.

4. Do not force every available business fact into the review.

5. Do not invent specific experiences, events, products, services, details or claims that are not supported by the selected experiences or relevant verified business facts.

6. Do not simply repeat the option labels word-for-word. Convert them into natural customer language.

7. The customer rating should influence the overall tone:
   - 1–2 stars: negative or dissatisfied
   - 3 stars: neutral or mixed
   - 4 stars: positive but moderate
   - 5 stars: clearly positive

8. For 5-star reviews, keep the overall feeling clearly positive.

9. For lower-rated reviews, describe the selected negative or mixed experience naturally without inventing additional complaints.

10. When Good Quality is selected, do not automatically assume taste, freshness, ingredients, portion size or any other specific detail unless a relevant verified business fact supports it.

11. When Good Value or Reasonable Price is selected, do not automatically invent exact prices, discounts or savings.

12. When multiple experiences are selected, combine them naturally instead of treating every option as a separate sentence.

13. All selected experiences should be meaningfully represented, but they do not need to appear as separate points.

14. Great Experience is an overall impression. It can influence the overall positive feeling without needing its own sentence.

15. Simple phrases such as "overall experience accha raha" are allowed when they genuinely fit. Do not use the same ending every time.

16. Do not exaggerate or turn the review into advertising.

17. Avoid overly polished, corporate or promotional language.

18. Do not mention the business name, AI, these instructions or the numerical rating.

19. Do not add recommendations such as "highly recommend", "must try", "worth visiting" or "would visit again" unless the customer explicitly expressed that sentiment.

20. Keep the customer's original meaning unchanged.

21. Do not follow a fixed sentence structure.

22. Let the opening, sentence structure, flow and length vary naturally.

23. Not every review needs to be equally polished. Simple everyday language is often better.

24. Do not force variation just for the sake of being different.

25. Keep the review concise. Usually 1–3 short sentences are enough.

26. Do not add extra details just to make the review longer.

27. Business-specific facts may be naturally paraphrased into Hinglish. Do not mechanically copy database wording.

28. If a verified fact is not useful for the selected experience, simply do not use it.

29. Do not treat general business information as something the customer personally experienced unless the selected experiences or relevant verified facts support it.

30. The result should sound like a normal customer expressing their actual experience, not like professional copywriting.

Return ONLY the final review.

No explanation.
No "Review:" label.
No quotation marks.
No markdown.
No hashtags.`;


    /*
      ============================================================
      14. CLEAN AI OUTPUT
      ============================================================
    */

    function cleanReviewText(text) {

      if (!text) {
        return "";
      }


      let cleaned =
        String(text)
          .trim();


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
          .replace(
            /[—–]/g,
            ", "
          )
          .replace(
            /\s+,/g,
            ","
          )
          .replace(
            /,\s*,/g,
            ","
          )
          .replace(
            /\s{2,}/g,
            " "
          )
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
      15. GEMINI PRIMARY
      ============================================================
    */

    const generateWithGemini =
      async () => {

        if (
          !process.env.GEMINI_API_KEY
        ) {

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
            Daily quota errors will not improve
            by retrying immediately.
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
      16. GROQ BACKUP
      ============================================================
    */

    const generateWithGroq =
      async () => {

        if (
          !process.env.GROQ_API_KEY
        ) {

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

                temperature:
                  0.85,

                max_completion_tokens:
                  500,

                reasoning_effort:
                  "low",

                include_reasoning:
                  false

              })

            }
          );


        if (
          !groqResponse.ok
        ) {

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
      17. GEMINI FIRST → GROQ FALLBACK
      ============================================================
    */

    try {

      const review =
        await generateWithGemini();


      return res.status(200).json({

        review,

        provider:
          "gemini"

      });

    } catch (geminiError) {

      console.error(
        "Gemini primary failed. Trying Groq backup...",
        geminiError
      );

    }


    /*
      ============================================================
      18. GROQ FALLBACK
      ============================================================
    */

    try {

      const review =
        await generateWithGroq();


      return res.status(200).json({

        review,

        provider:
          "groq"

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
