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
      "good_quality",
      "good_service",
      "friendly_staff",
      "good_value",
      "clean",
      "great_experience",

      /*
        Negative / neutral categories that may already exist
        in the customer interface.
      */

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
      Remove duplicates and invalid values.
    */

    const selectedExperiences =
      [...new Set(
        experiences
          .map(item =>
            String(item || "").trim()
          )
          .filter(Boolean)
      )];


    if (!selectedExperiences.length) {

      return res.status(400).json({
        error: "Please select at least one experience"
      });

    }


    /*
      ============================================================
      4. SUPABASE CONFIGURATION
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
      5. FETCH BUSINESS FROM DATABASE
      ============================================================

      IMPORTANT:

      We no longer trust businessName/businessInfo sent
      by the browser.

      The server gets the real business directly from
      Supabase.
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
      6. FETCH BUSINESS-SPECIFIC FACTS
      ============================================================

      Facts are stored in:

      public.business_facts

      The AI receives only active facts belonging to
      this particular business.
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
      7. ORGANIZE FACTS BY CATEGORY
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
      8. FIND RELEVANT BUSINESS FACTS
      ============================================================

      Only facts belonging to selected categories are supplied
      to the AI.

      This is important.

      A customer selecting "Good Service" should not suddenly
      receive food-quality facts.
    */

    const relevantFacts = [];


    for (
      const experience of selectedExperiences
    ) {

      if (
        !allowedCategories.includes(
          experience
        )
      ) {
        continue;
      }


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
      9. FORMAT FACTS FOR AI
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
      10. BUSINESS INFORMATION
      ============================================================

      General business information is NOT automatically treated
      as a customer experience.

      It is only background context.
    */

    const businessInfo =
      business.business_info
        ? String(
            business.business_info
          ).trim()
        : "";


    /*
      ============================================================
      11. BUILD AI PROMPT
      ============================================================
    */

const prompt = `You are helping a real customer write a genuine Google review.

Write a short, natural review based on the customer's selected experiences.

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

1. The customer's selected experiences are the source of truth.

2. Use the selected experiences naturally. You may rewrite, combine, reorder and connect them so the review sounds like a real customer wrote it.

3. Verified business facts may be used to make a selected experience more specific, but only when the fact is relevant to that selected experience.
Keep elaboration natural and moderate. Do not add several extra specific details when a simple expression of the selected experience is enough.

4. Do not invent new specific experiences or details that the customer did not select and that are not supported by the verified facts.

5. Do not simply repeat the option labels word-for-word. Turn them into natural sentences.

6. The rating should control the overall tone:
   - 1–2 stars: negative or dissatisfied
   - 3 stars: neutral or mixed
   - 4 stars: positive but moderate
   - 5 stars: clearly positive

7. For 1–2 star reviews, general business information and verified business facts should not be turned into negative claims. If the customer has a negative experience, describe the selected negative experience itself rather than criticizing the business's general description, specialty, positioning or other background information.

  

8. When a customer selects a positive experience with a 5-star rating, keep that experience clearly positive.
   For example:
   "Good Service" should sound like "service achhi thi" or "service kaafi achhi rahi", not "service theek-thak thi".

9. When a customer selects "Good Quality", do not automatically assume taste, freshness, ingredients or any other specific detail unless it is supported by a relevant verified business fact.

10. When a customer selects multiple experiences, combine them naturally into one review instead of listing them like a checklist.

11. Simple connecting phrases such as "overall experience achha raha" are allowed when they fit the rating and selected experiences.

12. Do not exaggerate. Do not turn the review into advertising.

13. Do not mention the business name, AI, these instructions, or the numerical rating.

14. Do not add recommendations such as "highly recommend", "must try" or "would visit again" unless the customer has explicitly expressed that sentiment.

15. Write in simple, natural language. English is perfectly acceptable. Use natural Indian English or Hinglish depending on what sounds more natural for the review.

16. Usually write 2–3 short sentences. Keep it concise. Do not add unnecessary details just to make it longer.

The review should feel natural and human while keeping the customer's actual meaning unchanged.

Return ONLY the final review.
No explanation.
No "Review:" label.
No quotation marks.
No markdown.
No hashtags.`;


    /*
      ============================================================
      12. CLEAN AI OUTPUT
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
        cleaned.replace(
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
      13. GROQ PRIMARY
      ============================================================
    */

    const generateWithGroq =
      async () => {

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

                temperature: 0.7,

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
            "Groq returned no review. Check Vercel logs for the full response."
          );

        }


        console.log(
          "AI PROVIDER USED: GROQ"
        );


        return groqReview;

      };


    /*
      ============================================================
      14. GEMINI BACKUP
      ============================================================
    */

    const generateWithGemini =
      async () => {

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
                  ]

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
      15. GROQ PRIMARY
      ============================================================
    */

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


    /*
      ============================================================
      16. GEMINI BACKUP
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
        "Gemini backup also failed:",
        geminiError
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
