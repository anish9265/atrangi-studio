import { REVIEW_CATEGORY_CONFIG } from "../../experience-config.js";

const HEDGE_DELAY_MS = 5000;
const GROQ_TIMEOUT_MS = 8000;
const GEMINI_TIMEOUT_MS = 12000;
const AI_TEMPERATURE = 0.85;

const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 4 * 60 * 1000;
const requestLog = new Map();

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function getClientIp(request) {
  return (
    request.headers.get("CF-Connecting-IP") ||
    String(request.headers.get("x-forwarded-for") || "").split(",")[0].trim() ||
    "unknown"
  );
}

function isRateLimited(ip) {
  const now = Date.now();

  if (requestLog.size > 1000) {
    for (const [key, times] of requestLog.entries()) {
      const fresh = times.filter(t => now - t < RATE_LIMIT_WINDOW_MS);
      if (fresh.length === 0) {
        requestLog.delete(key);
      } else {
        requestLog.set(key, fresh);
      }
    }
  }

  const recent = (requestLog.get(ip) || []).filter(
    t => now - t < RATE_LIMIT_WINDOW_MS
  );

  if (recent.length >= RATE_LIMIT_MAX) {
    requestLog.set(ip, recent);
    return true;
  }

  recent.push(now);
  requestLog.set(ip, recent);
  return false;
}

function pickRandom(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function shuffleList(list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function getLengthHint(optionCount) {
  if (optionCount <= 2) {
    return pickRandom([
      "Write exactly 2 short sentences. Do not add new facts, only express the selected experiences in a natural way.",
      "Write 2 short sentences. The second one can be a little shorter."
    ]);
  }

  return pickRandom([
    "Write 2 short sentences.",
    "Write 2 sentences. The second one should be shorter than the first.",
    "Write 3 short sentences.",
    "Write 3 very short sentences."
  ]);
}

const TONE_HINTS = [
  "Casual and chatty, like talking to a friend.",
  "Plain and simple, using short everyday words.",
  "Calm and matter-of-fact.",
  "Short and to the point, no fancy words."
];

const OPENING_HINTS = [
  "Start directly with the first item in the mention order.",
  "Start with a very short natural opener of 2 or 3 words, then continue.",
  "Start with the item you are giving the most emphasis to."
];

const ENDING_HINTS = [
  "Do NOT end with a general line about the overall experience. End on a specific point instead.",
  "Do NOT end with a general line about the overall experience. End on a specific point instead.",
  "Do NOT end with a general line about the overall experience. End on a specific point instead.",
  "You may end with one short overall impression, but do not use the usual stock wording."
];

function cleanReviewText(text) {
  if (!text) return "";

  let cleaned = String(text).trim();

  const endMarkers = ["<|endoftext|>", "<|end_of_text|>", "</s>"];

  for (const marker of endMarkers) {
    const index = cleaned.indexOf(marker);
    if (index !== -1) {
      cleaned = cleaned.substring(0, index).trim();
    }
  }

  cleaned = cleaned.replace(/^Review:\s*/i, "").trim();

  cleaned = cleaned
    .replace(/[—–]/g, ", ")
    .replace(/\s+,/g, ",")
    .replace(/,\s*,/g, ",")
    .replace(/\s{2,}/g, " ")
    .trim();

  if (cleaned.startsWith('"') && cleaned.endsWith('"')) {
    cleaned = cleaned.slice(1, -1).trim();
  }

  if (cleaned.startsWith("'") && cleaned.endsWith("'")) {
    cleaned = cleaned.slice(1, -1).trim();
  }

  return cleaned;
}

export async function onRequestPost({ request, env }) {
  if (isRateLimited(getClientIp(request))) {
    return json(
      { error: "Too many requests. Please wait a few minutes and try again." },
      429
    );
  }

  const startedAt = Date.now();

  try {
    let body = {};

    try {
      body = await request.json();
    } catch {
      body = {};
    }

    const { businessId, rating, experiences } = body || {};

    if (
      !businessId ||
      !rating ||
      !Array.isArray(experiences) ||
      experiences.length === 0
    ) {
      return json({ error: "Missing review information" }, 400);
    }

    const numericBusinessId = Number(businessId);
    const numericRating = Number(rating);

    if (!Number.isInteger(numericBusinessId) || numericBusinessId <= 0) {
      return json({ error: "Invalid business" }, 400);
    }

    if (
      !Number.isInteger(numericRating) ||
      numericRating < 1 ||
      numericRating > 5
    ) {
      return json({ error: "Invalid rating" }, 400);
    }

    /* Experience mapping: label -> internal key */

    const experienceMap = {};

    for (const config of Object.values(REVIEW_CATEGORY_CONFIG)) {
      for (const label of [
        ...config.negative,
        ...config.neutral,
        ...config.positive
      ]) {
        experienceMap[label] = label
          .trim()
          .toLowerCase()
          .replace(/&/g, "and")
          .replace(/[^a-z0-9]+/g, "_")
          .replace(/^_+|_+$/g, "");
      }
    }

    Object.assign(experienceMap, {
      "Friendly staff": "friendly_staff",
      "Good service": "good_service",
      "Good quality": "good_quality",
      "Good value": "good_value",
      "Clean": "clean",
      "Great experience": "great_experience",
      "Poor quality": "poor_quality",
      "Slow service": "slow_service",
      "Staff could be better": "staff_could_be_better",
      "Too expensive": "too_expensive",
      "Not clean": "not_clean",
      "Overall disappointing": "overall_disappointing",
      "Average service": "average_service",
      "Average quality": "average_quality",
      "Reasonable price": "reasonable_price",
      "Could be better": "could_be_better"
    });

    const selectedExperienceObjects = [
      ...new Map(
        experiences
          .map(item => String(item || "").trim())
          .map(label => {
            const category = experienceMap[label];
            if (!category) return null;
            return [category, { label, category }];
          })
          .filter(Boolean)
      ).values()
    ];

    if (selectedExperienceObjects.length === 0) {
      return json({ error: "Please select at least one valid experience" }, 400);
    }

    const selectedCategories = selectedExperienceObjects.map(i => i.category);
    const selectedLabels = selectedExperienceObjects.map(i => i.label);

    /* Supabase */

    const supabaseUrl = env.SUPABASE_URL;
    const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return json({ error: "Server configuration is incomplete" }, 500);
    }

    const baseUrl = supabaseUrl
      .trim()
      .replace(/\/+$/, "")
      .replace(/\/rest\/v1$/, "");

    const supabaseRestUrl = `${baseUrl}/rest/v1`;

    const supabaseHeaders = serviceRoleKey.startsWith("sb_")
      ? { apikey: serviceRoleKey, "Content-Type": "application/json" }
      : {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
          "Content-Type": "application/json"
        };

    const businessResponse = await fetch(
      `${supabaseRestUrl}/businesses` +
        `?id=eq.${encodeURIComponent(numericBusinessId)}` +
        `&active=eq.true` +
        `&select=id,name,slug,business_info,category,language`,
      { headers: supabaseHeaders }
    );

    const businessResponseText = await businessResponse.text();

    if (!businessResponse.ok) {
      console.error("Supabase business fetch failed:", businessResponseText);
      return json({ error: "Could not load business information" }, 500);
    }

    let businesses;

    try {
      businesses = JSON.parse(businessResponseText);
    } catch (error) {
      console.error("Invalid Supabase business response:", businessResponseText);
      return json({ error: "Invalid business data" }, 500);
    }

    if (!Array.isArray(businesses) || businesses.length === 0) {
      return json({ error: "Business not found or inactive" }, 404);
    }

    const business = businesses[0];

    /* Review language */

    const businessLanguage = String(business.language || "en")
      .trim()
      .toLowerCase();

    const isEnglish = businessLanguage === "english";

    const reviewLanguageName = isEnglish ? "simple English" : "Hinglish";

    const overuseHint = isEnglish
      ? `Avoid overusing very common words like "really", "very", "overall", "great experience". Also avoid superlatives and stock phrases like "best", "perfect", "amazing", "hassle-free", "smooth experience". Use each word at most once, and prefer different natural words.`
      : `Avoid overusing very common words like "kaafi", "bahut", "bohot", "badhiya", "organized", "overall experience". Also avoid superlatives and stock phrases like "best", "perfect", "ekdum", "hassle-free", "smooth experience", "lajawab", "kamaal", "dil khush". Use each word at most once, and prefer different natural words.`;

    const languageStyleText = isEnglish
      ? `LANGUAGE STYLE:

Write the way a normal customer would type a quick review on their phone.

Use simple, everyday English, like a short text message. Avoid fancy or formal words such as "exquisite", "delightful", "ambience", "impeccable".

Do NOT use Hindi words, Roman-script Hindi or Hindi Devanagari script.

These examples only show the general feel. Do NOT copy their wording or sentence structure:

"Staff was polite and we did not have to wait long."

"Liked the place, it was clean and the prices were fair."

"Nothing special about the food but the service was fine."

The review should sound like a normal Indian customer casually writing in simple everyday English.`
      : `LANGUAGE STYLE:

Write the way a normal customer from a small Indian city would type a quick review on their phone.

Use simple, everyday, spoken Hinglish: Roman-script Hindi mixed with the English words people actually use in daily life.

For common things, prefer the English word people really say, such as staff, behaviour, service, food, taste, place, parking, seating, wait, clean, helpful, friendly, fresh.

Do NOT use formal, bookish or Sanskrit-style Hindi words. Never use words like "milansar", "vyavahar", "sukoon", "laajawab", "kamaal", "swadisht", "dil khush", "seva", "atithi", "prabandhan". If a word sounds like it belongs in a Hindi textbook or a poem, replace it with a simpler everyday word.

These examples only show the everyday feel. Do NOT copy their wording or sentence structure:

"Staff ka behaviour accha tha, jagah bhi clean lagi."

"Khana fresh tha, parking bhi mil gayi."

"Wait nahi karna pada, treatment bhi theek se hua."

Do NOT use Hindi Devanagari script.

Natural English is completely fine when it sounds more natural. Do not force Hindi into every sentence.

The review should sound like a normal Indian customer casually expressing their experience.`;

    /* Business facts */

    const factsResponse = await fetch(
      `${supabaseRestUrl}/business_facts` +
        `?business_id=eq.${encodeURIComponent(numericBusinessId)}` +
        `&active=eq.true` +
        `&select=category,fact,rating_group` +
        `&order=id.asc`,
      { headers: supabaseHeaders }
    );

    const factsResponseText = await factsResponse.text();

    if (!factsResponse.ok) {
      console.error("Supabase business facts fetch failed:", factsResponseText);
      return json({ error: "Could not load business facts" }, 500);
    }

    let businessFacts = [];

    try {
      businessFacts = JSON.parse(factsResponseText);
    } catch (error) {
      console.error("Invalid Supabase business facts response:", factsResponseText);
      return json({ error: "Invalid business facts" }, 500);
    }

    const knownKeys = new Set(Object.values(experienceMap));

    function normalizeCategory(value) {
      if (!value) return "";

      const raw = String(value).trim();

      if (experienceMap[raw]) {
        return experienceMap[raw];
      }

      const cleaned = raw.toLowerCase();

      if (knownKeys.has(cleaned)) {
        return cleaned;
      }

      return cleaned.replace(/[\s-]+/g, "_");
    }

    const ratingGroup =
      numericRating <= 2
        ? "negative"
        : numericRating === 3
          ? "neutral"
          : "positive";

    const relevantFacts = [];

    for (const category of selectedCategories) {
      const categoryFacts = businessFacts.filter(item => {
        if (!item || !item.category || !item.fact) return false;

        if (normalizeCategory(item.category) !== category) {
          return false;
        }

        return !item.rating_group || item.rating_group === ratingGroup;
      });

      for (const item of categoryFacts) {
        const factText = String(item.fact).trim();
        if (!factText) continue;

        relevantFacts.push({ category, fact: factText });
      }
    }

    const factsByCategory = new Map();

    for (const item of relevantFacts) {
      if (!factsByCategory.has(item.category)) {
        factsByCategory.set(item.category, []);
      }
      factsByCategory.get(item.category).push(item);
    }

    const pickedFacts = shuffleList(
      Array.from(factsByCategory.values()).map(group => pickRandom(group))
    ).slice(0, 2);

    const shuffledLabels = shuffleList(selectedLabels);
    const focusLabel = pickRandom(shuffledLabels);

    const styleBlock = `STYLE FOR THIS REVIEW (follow this exactly, it keeps every review different):

- Length: ${getLengthHint(selectedLabels.length)}
- Tone: ${pickRandom(TONE_HINTS)}
- Opening: ${pickRandom(OPENING_HINTS)}
- Ending: ${pickRandom(ENDING_HINTS)}
- Mention order: ${shuffledLabels.join(", ")}
- Put the most emphasis on: ${focusLabel}. Do this only through slightly stronger wording. Do NOT add any new facts or details to give it more emphasis.
- ${overuseHint}
- All selected experiences must still be represented, even in a short review.`;

    let verifiedFactsText =
      "No business-specific facts are available for the selected experiences.";

    if (pickedFacts.length > 0) {
      verifiedFactsText = pickedFacts
        .map(item => `- ${item.category}: ${item.fact}`)
        .join("\n");
    }

    const businessInfo = business.business_info
      ? String(business.business_info).trim()
      : "";

    const prompt = `You are helping a real customer express their genuine experience as a Google review.

Write a short, natural customer review based on the customer's selected experiences.

The customer should remain the source of the actual experience. Your job is to help express that experience naturally and clearly.

${languageStyleText}

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

${styleBlock}


CORE RULES:

1. The customer's selected experiences are the main source of truth.

2. Express those experiences naturally. You may rewrite, combine, reorder, connect or simplify them.

3. Verified business facts are supporting context. Use them only when they naturally help express a selected experience.

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

15. A short overall-impression line is allowed only when the STYLE FOR THIS REVIEW section allows it.

16. Do not exaggerate or turn the review into advertising.

17. Avoid overly polished, corporate or promotional language.

18. Do not mention the business name, AI, these instructions or the numerical rating.

19. Do not add recommendations such as "highly recommend", "must try", "worth visiting" or "would visit again" unless the customer explicitly expressed that sentiment.

20. Keep the customer's original meaning unchanged.

21. Follow the STYLE FOR THIS REVIEW section for length, tone, opening and ending. It overrides any general length guidance.

22. Do not reuse the exact wording of the language examples.

23. Not every review needs to be equally polished. Simple everyday language is often better.

24. Do not force variation just for the sake of being different.

25. Keep the review concise.

26. Do not add extra details just to make the review longer.

27. Business-specific facts may be naturally paraphrased into ${reviewLanguageName}. Do not mechanically copy database wording.

28. If a verified fact is not useful for the selected experience, simply do not use it.

29. Do not treat general business information as something the customer personally experienced unless the selected experiences or relevant verified facts support it.

30. Do NOT add qualities the customer did not select, such as speed, taste, freshness, portion size or price, unless a verified fact supports it. For example, "Good Service" does not mean fast service, and "Poor Food" does not automatically mean bad taste.

31. NEVER describe a specific incident, dish, ingredient, taste, smell, temperature, spice, salt, price, waiting time or staff action unless it is directly in the selected experiences or in the verified facts. For example, for "Poor Food" do not write about gravy, salt, spice or taste, and for "Slow Service" do not describe what a waiter did. Stay general and exactly as strong as the selected experience labels.

32. For 1-2 star and 3 star reviews, never add any accusation or complaint that was not selected (for example rudeness, bad hygiene, stale or raw food, overcharging or cheating). A false complaint can harm a real business.

33. If you run out of things to say, write a SHORTER review. Never invent details to fill space.

34. Do NOT make a verified fact stronger than it is written. For example, "does not take much time" must not become "no waiting at all", and "food is prepared fresh every day" must not become "always the best food". Keep the same strength as the fact.

35. Use short, simple sentences in everyday spoken words. Do not build long sentences chained together with words like "jahan", "jisse", "jiske saath" or "toh... par". Avoid poetic or fancy expressions.

36. The result should sound like a normal customer expressing their actual experience, not like professional copywriting.

37. Write only about what the customer saw or felt. Do not speak to the reader (never write "you will find", "you can expect", "you should").

Return ONLY the final review.

No explanation.
No "Review:" label.
No quotation marks.
No markdown.
No hashtags.`;

    /* AI: Gemini primary */

    const generateWithGemini = async () => {
      if (!env.GEMINI_API_KEY) {
        throw new Error("GEMINI_API_KEY is missing");
      }

      const maxRetries = 3;
      let response;

      for (let attempt = 0; attempt < maxRetries; attempt++) {
        response = await fetchWithTimeout(
          "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=" +
            env.GEMINI_API_KEY,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: {
                temperature: AI_TEMPERATURE,
                maxOutputTokens: 250
              }
            })
          },
          GEMINI_TIMEOUT_MS
        );

        if (response.ok) break;

        const errorText = await response.text();

        console.error(`Gemini attempt ${attempt + 1} failed:`, errorText);

        if (
          response.status === 429 &&
          (errorText.includes("PerDay") ||
            errorText.includes("per_day") ||
            errorText.includes("daily") ||
            errorText.includes("quota"))
        ) {
          console.log("Gemini daily quota exceeded.");
          break;
        }

        if (response.status !== 429 && response.status !== 503) {
          break;
        }

        if (attempt < maxRetries - 1) {
          const delay = 1000 * Math.pow(2, attempt);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }

      if (!response || !response.ok) {
        throw new Error("Gemini API request failed");
      }

      const data = await response.json();
      const review = cleanReviewText(
        data?.candidates?.[0]?.content?.parts?.[0]?.text
      );

      if (!review) {
        throw new Error("Gemini returned no review");
      }

      console.log("AI PROVIDER USED: GEMINI");

      return review;
    };

    /* AI: Groq backup */

    const generateWithGroq = async () => {
      if (!env.GROQ_API_KEY) {
        throw new Error("GROQ_API_KEY is missing");
      }

      const groqResponse = await fetchWithTimeout(
        "https://api.groq.com/openai/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${env.GROQ_API_KEY}`
          },
          body: JSON.stringify({
            model: "openai/gpt-oss-120b",
            messages: [{ role: "user", content: prompt }],
            temperature: AI_TEMPERATURE,
            max_completion_tokens: 500,
            reasoning_effort: "low",
            include_reasoning: false
          })
        },
        GROQ_TIMEOUT_MS
      );

      if (!groqResponse.ok) {
        const errorText = await groqResponse.text();
        console.error("Groq API error:", errorText);
        throw new Error("Groq API request failed");
      }

      const groqData = await groqResponse.json();
      const groqReview = cleanReviewText(
        groqData?.choices?.[0]?.message?.content
      );

      if (!groqReview) {
        throw new Error("Groq returned no review");
      }

      console.log("AI PROVIDER USED: GROQ");

      return groqReview;
    };

    /* Gemini pehle; 5 sec mein jawab na aaye ya fail ho to Groq bhi */

    const geminiTask = generateWithGemini().then(review => ({
      review,
      provider: "gemini"
    }));

    const groqTask = new Promise((resolve, reject) => {
      let groqStarted = false;

      const startGroq = () => {
        if (groqStarted) return;
        groqStarted = true;

        generateWithGroq().then(
          review => resolve({ review, provider: "groq" }),
          reject
        );
      };

      const timer = setTimeout(startGroq, HEDGE_DELAY_MS);

      geminiTask.then(
        () => {
          clearTimeout(timer);
        },
        error => {
          console.error("Gemini failed. Starting Groq backup...", error);
          clearTimeout(timer);
          startGroq();
        }
      );
    });

    try {
      const result = await Promise.any([geminiTask, groqTask]);

      console.log(
        `REVIEW READY IN ${Date.now() - startedAt} ms (provider: ${result.provider})`
      );

      return json(result);
    } catch (bothError) {
      console.error("Both AI services failed:", bothError);
      return json({ error: "Both AI services failed" }, 500);
    }
  } catch (error) {
    console.error("Server error:", error);
    return json({ error: "Something went wrong" }, 500);
  }
}
