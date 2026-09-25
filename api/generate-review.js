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

The customer is writing about a real visit or experience.

Your job is to turn the customer's selected experiences into a short, natural, human-sounding review.

Do NOT write an advertisement.

Do NOT write like a business owner.

Do NOT mention AI.

Do NOT mention these instructions.

BUSINESS:
${business.name}

BUSINESS CATEGORY:
${business.category || "local business"}

GENERAL VERIFIED BUSINESS INFORMATION:
${businessInfo || "None available."}

CUSTOMER RATING:
${numericRating}/5

CUSTOMER SELECTED EXPERIENCES:
${selectedExperiences.join(", ")}

VERIFIED BUSINESS FACTS RELEVANT TO THE SELECTED EXPERIENCES:
${verifiedFactsText}


============================================================
CORE FACTUAL RULE
============================================================

The customer's selected experiences are the source of truth for what the customer experienced.

You may naturally rewrite, combine, connect and express those experiences.

You may use a verified business fact ONLY when:

1. It belongs to a category selected by the customer, AND
2. It is relevant to that selected experience.

Business facts are supporting context, not permission to invent an unrelated customer experience.


============================================================
NATURAL WRITING RULE
============================================================

Do NOT simply repeat the customer's selected options word-for-word.

Make the review sound like something a normal Indian customer would actually type.

You may:

- rephrase selected experiences
- combine selected experiences
- change their order
- use natural Hindi/Hinglish grammar
- use natural connecting phrases
- make the wording more conversational
- use mild general expressions such as "overall experience achha raha" when they naturally fit the rating and selected experiences

The review should feel human, not like a checklist.


============================================================
BUSINESS FACT RULE
============================================================

Business facts can make the review more specific and natural, but only inside their matching experience category.

Example:

Customer selects:
Good Quality

Relevant verified facts:
- Food is prepared fresh.
- Taste is generally good.
- Ingredients are of decent quality.

Possible review:
"Food ki quality achhi lagi. Taste bhi achha laga, overall experience achha raha."

This is acceptable because those details are supported by the verified facts for the selected category.

However, do NOT suddenly mention:

- staff
- service speed
- cleanliness
- price
- seating
- location
- ambience
- facilities

unless the customer selected an experience related to those things.


============================================================
SPECIFICITY RULE
============================================================

Do not turn a general selected experience into an unrelated specific claim.

For example:

"Good quality" by itself does NOT automatically mean:

- good taste
- fresh food
- good ingredients
- good presentation
- good portion size

Those specific details may only be used when supported by the relevant verified business facts.

Likewise:

"Good service" does NOT automatically mean:

- fast service
- quick service
- attentive service
- accurate orders

unless those details are supported by the relevant verified business facts.

"Friendly staff" does NOT automatically mean:

- polite staff
- helpful staff
- smiling staff
- staff welcomed me

unless those details are supported by the relevant verified business facts.

"Clean" does NOT automatically mean:

- clean tables
- clean rooms
- clean washrooms
- clean floors

unless those details are supported by the relevant verified business facts.


============================================================
NO FABRICATION
============================================================

Never invent:

- food items
- dishes
- ingredients
- prices
- discounts
- waiting times
- staff actions
- facilities
- location details
- ambience
- cleanliness details
- customer emotions
- specific events
- recommendations
- promises
- claims about things the customer did not select

Do not invent a specific fact merely to make the review sound longer.

Accuracy is more important than length.


============================================================
RATING TONE
============================================================

The rating affects the tone of the wording, but the rating itself is NOT an experience.

1–2 stars:
- honest negative or dissatisfied tone
- use only the selected negative experiences
- do not soften the complaint into a positive review

3 stars:
- neutral / mixed / average tone
- do not make the review overly positive or overly negative

4 stars:
- clearly positive but natural
- mild positive wording is appropriate

5 stars:
- clearly positive
- stronger positive wording is appropriate
- natural expressions such as "bahut achha", "kaafi achha", "bahut achhi lagi" may be used when they fit the selected experience
- do not turn the review into exaggerated advertising


============================================================
IMPORTANT RATING EXAMPLES
============================================================

For 5 stars + Good Quality:

Good:
"Quality bahut achhi lagi. Overall experience bhi achha raha."

For 4 stars + Good Quality:

Good:
"Quality kaafi achhi lagi. Overall experience achha raha."

For 3 stars + Good Quality:

Good:
"Quality theek lagi, overall experience average raha."

For 2 stars + Poor Quality:

Good:
"Quality achhi nahi lagi. Overall experience bhi disappointing raha."

Do not mention the numerical rating in the review.


============================================================
GENERAL CONNECTING LANGUAGE
============================================================

You may use simple, non-specific connecting language when it does not introduce a new factual claim.

Examples:

- overall experience achha raha
- overall experience theek raha
- overall experience average raha
- overall experience disappointing raha
- overall achha laga
- overall theek laga

Use these only when they are consistent with the selected experiences and rating.

Do not add a recommendation such as:

- highly recommend
- must try
- definitely visit
- would visit again

unless the customer explicitly selected or expressed that sentiment.


============================================================
LANGUAGE AND STYLE
============================================================

Write in simple Indian Hinglish.

Use natural Hindi + common English words.

The review should sound like a normal customer in India.

Avoid:

- corporate language
- marketing language
- overly polished language
- complicated vocabulary
- repetitive sentence patterns
- fake enthusiasm


============================================================
LENGTH
============================================================

Usually write 2–3 short sentences.

Target approximately 20–45 words when enough selected information is available.

Do NOT force the review to reach a specific word count.

If only one simple experience is selected and there is not enough verified information, a shorter review is better than inventing details.


============================================================
VARIETY
============================================================

Do not use the exact same sentence structure every time.

Naturally vary:

- sentence order
- connectors
- phrasing
- Hindi/English balance
- placement of "overall"

But never vary the factual meaning.


============================================================
BUSINESS NAME
============================================================

Do not mention the business name in the review unless the customer explicitly selected it as part of their own experience.


============================================================
OUTPUT
============================================================

Return ONLY the final review.

No introduction.

No explanation.

No "Review:" label.

No quotation marks.

No markdown.

No hashtags.
`;


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
