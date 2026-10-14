/* ============================================================
   OPTIONS KI LIST
   Ye experience-config.js jaisi hi list hai.
   Naya option ya category jodo to dono jagah badlo.
============================================================ */

const CLINIC_OPTIONS = {
  negative: ["Poor Treatment", "Long Wait", "Bad Staff", "Poor Cleanliness", "Poor Service", "Poor Experience"],
  neutral: ["Average Treatment", "Average Wait", "Okay Staff", "Average Cleanliness", "Average Service", "Okay Experience"],
  positive: ["Good Treatment", "Short Wait", "Friendly Staff", "Good Cleanliness", "Good Service", "Good Experience"]
};

const REVIEW_CATEGORY_CONFIG = {
  restaurant_food: {
    negative: ["Poor Food", "Slow Service", "Bad Staff", "Poor Cleanliness", "Poor Value", "Bad Place"],
    neutral: ["Average Food", "Average Service", "Okay Staff", "Average Cleanliness", "Average Value", "Average Place"],
    positive: ["Good Food", "Good Service", "Friendly Staff", "Good Cleanliness", "Good Value", "Nice Place"]
  },
  healthcare_clinic: CLINIC_OPTIONS,
  dental: CLINIC_OPTIONS,
  hospital: CLINIC_OPTIONS,
  diagnostic: {
    negative: ["Poor Testing", "Long Wait", "Bad Staff", "Poor Cleanliness", "Poor Service", "Poor Experience"],
    neutral: ["Average Testing", "Average Wait", "Okay Staff", "Average Cleanliness", "Average Service", "Okay Experience"],
    positive: ["Good Testing", "Short Wait", "Friendly Staff", "Good Cleanliness", "Good Service", "Good Experience"]
  },
  salon_beauty: {
    negative: ["Poor Service", "Long Wait", "Bad Staff", "Poor Cleanliness", "Poor Quality", "Poor Experience"],
    neutral: ["Average Service", "Average Wait", "Okay Staff", "Average Cleanliness", "Average Quality", "Okay Experience"],
    positive: ["Good Service", "Short Wait", "Friendly Staff", "Good Cleanliness", "Good Quality", "Good Experience"]
  },
  hotel_stay: {
    negative: ["Poor Room", "Slow Service", "Bad Staff", "Poor Cleanliness", "Poor Value", "Poor Location"],
    neutral: ["Average Room", "Average Service", "Okay Staff", "Average Cleanliness", "Average Value", "Okay Location"],
    positive: ["Good Room", "Good Service", "Friendly Staff", "Good Cleanliness", "Good Value", "Good Location"]
  },
  gym_fitness: {
    negative: ["Poor Equipment", "Poor Service", "Bad Staff", "Poor Cleanliness", "Poor Space", "Poor Experience"],
    neutral: ["Average Equipment", "Average Service", "Okay Staff", "Average Cleanliness", "Average Space", "Okay Experience"],
    positive: ["Good Equipment", "Good Service", "Friendly Staff", "Good Cleanliness", "Good Space", "Good Experience"]
  },
  coaching_education: {
    negative: ["Poor Teaching", "Poor Classes", "Bad Staff", "Poor Study Material", "Poor Management", "Poor Experience"],
    neutral: ["Average Teaching", "Average Classes", "Okay Staff", "Average Study Material", "Average Management", "Okay Experience"],
    positive: ["Good Teaching", "Good Classes", "Friendly Staff", "Good Study Material", "Good Management", "Good Experience"]
  },
  automobile: {
    negative: ["Poor Service", "Long Wait", "Bad Staff", "Poor Quality", "Poor Value", "Poor Experience"],
    neutral: ["Average Service", "Average Wait", "Okay Staff", "Average Quality", "Average Value", "Okay Experience"],
    positive: ["Good Service", "Short Wait", "Friendly Staff", "Good Quality", "Good Value", "Good Experience"]
  },
  photography_creative: {
    negative: ["Poor Photos", "Slow Service", "Bad Staff", "Poor Quality", "Poor Value", "Poor Experience"],
    neutral: ["Average Photos", "Average Service", "Okay Staff", "Average Quality", "Average Value", "Okay Experience"],
    positive: ["Good Photos", "Good Service", "Friendly Staff", "Good Quality", "Good Value", "Good Experience"]
  },
  real_estate_property: {
    negative: ["Poor Service", "Slow Response", "Bad Staff", "Poor Property", "Poor Value", "Poor Experience"],
    neutral: ["Average Service", "Average Response", "Okay Staff", "Average Property", "Average Value", "Okay Experience"],
    positive: ["Good Service", "Quick Response", "Friendly Staff", "Good Property", "Good Value", "Good Experience"]
  },
  retail_shops: {
    negative: ["Poor Quality", "Poor Variety", "Bad Staff", "Poor Service", "Poor Value", "Poor Experience"],
    neutral: ["Average Quality", "Average Variety", "Okay Staff", "Average Service", "Average Value", "Okay Experience"],
    positive: ["Good Quality", "Good Variety", "Friendly Staff", "Good Service", "Good Value", "Good Experience"]
  },
  mobile_computer: {
    negative: ["Poor Quality", "Poor Service", "Bad Staff", "Poor Variety", "Poor Value", "Poor Experience"],
    neutral: ["Average Quality", "Average Service", "Okay Staff", "Average Variety", "Average Value", "Okay Experience"],
    positive: ["Good Quality", "Good Service", "Friendly Staff", "Good Variety", "Good Value", "Good Experience"]
  }
};

/* ============================================================
   SPEED SETTINGS
   HEDGE_DELAY_MS: Gemini itne millisecond mein jawab na de
                   to Groq bhi saath mein chalu ho jata hai.
   GEMINI_TIMEOUT_MS: Gemini ka maximum intezaar.
   GROQ_TIMEOUT_MS: Groq ka maximum intezaar.
============================================================ */

const HEDGE_DELAY_MS = 3000;
const GEMINI_TIMEOUT_MS = 12000;
const GROQ_TIMEOUT_MS = 10000;

// AI kitna "creative" ho. Kam number = kam jhooti baatein jodta hai.
const AI_TEMPERATURE = 0.85;

// Ek request ko maximum itni der tak rukne do, phir cancel
async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/* ============================================================
   SPAM LIMIT
   Ek IP se 4 minute mein maximum 5 review requests.
   Number badalna ho to sirf RATE_LIMIT_MAX badlo.
============================================================ */

const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 4 * 60 * 1000;
const requestLog = new Map();

function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) {
    return String(forwarded).split(",")[0].trim();
  }
  return req.socket?.remoteAddress || "unknown";
}

function isRateLimited(ip) {
  const now = Date.now();

  // Purani entries saaf karo (memory bhari na ho)
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

/* ============================================================
   VARIETY (har review alag banane ke liye)
   Har review ke liye neeche ki list mein se random cheezein
   chuni jaati hain.
============================================================ */

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

// Lambai options ki ginti ke hisaab se.
// Kam options hon to review chhota, taaki AI ko kuch jodna na pade.
function getLengthHint(optionCount) {
  if (optionCount <= 1) {
    return pickRandom([
      "Write exactly 1 short sentence.",
      "Write 1 short sentence, or 2 very short ones."
    ]);
  }

  if (optionCount === 2) {
    return pickRandom([
      "Write exactly 1 sentence. Join the ideas together naturally.",
      "Write 2 short sentences."
    ]);
  }

  return pickRandom([
    "Write exactly 1 sentence. Join the ideas together naturally.",
    "Write 2 short sentences.",
    "Write 2 sentences. The second one should be shorter than the first.",
    "Write 3 very short sentences."
  ]);
}

const TONE_HINTS = [
  "Casual and chatty, like talking to a friend.",
  "Plain
