const REVIEW_CATEGORY_CONFIG = {
  restaurant_food: {
    label: "Restaurant / Café / Food",
    aliases: ["restaurant", "cafe", "food", "restaurant_food"],
    negative: ["Poor Food", "Slow Service", "Bad Staff", "Poor Cleanliness", "Poor Value", "Poor Ambience"],
    neutral: ["Average Food", "Average Service", "Okay Staff", "Average Cleanliness", "Average Value", "Average Ambience"],
    positive: ["Good Food", "Good Service", "Friendly Staff", "Good Cleanliness", "Good Value", "Nice Ambience"]
  },
  healthcare_clinic: {
    label: "Healthcare / Clinic",
    aliases: ["clinic", "doctor", "healthcare", "healthcare_clinic"],
    negative: ["Poor Treatment", "Long Wait", "Bad Staff", "Poor Cleanliness", "Poor Service", "Poor Experience"],
    neutral: ["Average Treatment", "Average Wait", "Okay Staff", "Average Cleanliness", "Average Service", "Okay Experience"],
    positive: ["Good Treatment", "Short Wait", "Friendly Staff", "Good Cleanliness", "Good Service", "Good Experience"]
  },
  dental: {
    label: "Dental",
    aliases: ["dental", "dental_clinic"],
    negative: ["Poor Treatment", "Long Wait", "Bad Staff", "Poor Cleanliness", "Poor Service", "Poor Experience"],
    neutral: ["Average Treatment", "Average Wait", "Okay Staff", "Average Cleanliness", "Average Service", "Okay Experience"],
    positive: ["Good Treatment", "Short Wait", "Friendly Staff", "Good Cleanliness", "Good Service", "Good Experience"]
  },
  diagnostic: {
    label: "Diagnostic & Pathology",
    aliases: ["diagnostic", "pathology", "diagnostic_pathology"],
    negative: ["Poor Testing", "Long Wait", "Bad Staff", "Poor Cleanliness", "Poor Service", "Poor Experience"],
    neutral: ["Average Testing", "Average Wait", "Okay Staff", "Average Cleanliness", "Average Service", "Okay Experience"],
    positive: ["Good Testing", "Short Wait", "Friendly Staff", "Good Cleanliness", "Good Service", "Good Experience"]
  },
  salon_beauty: {
    label: "Salon & Beauty",
    aliases: ["salon", "beauty", "beauty_parlour", "makeup_artist", "bridal_makeup", "spa", "salon_beauty"],
    negative: ["Poor Service", "Long Wait", "Bad Staff", "Poor Cleanliness", "Poor Quality", "Poor Experience"],
    neutral: ["Average Service", "Average Wait", "Okay Staff", "Average Cleanliness", "Average Quality", "Okay Experience"],
    positive: ["Good Service", "Short Wait", "Friendly Staff", "Good Cleanliness", "Good Quality", "Good Experience"]
  },
  hotel_stay: {
    label: "Hotel & Stay",
    aliases: ["hotel", "guest_house", "lodge", "resort", "hotel_stay"],
    negative: ["Poor Room", "Slow Service", "Bad Staff", "Poor Cleanliness", "Poor Value", "Poor Location"],
    neutral: ["Average Room", "Average Service", "Okay Staff", "Average Cleanliness", "Average Value", "Okay Location"],
    positive: ["Good Room", "Good Service", "Friendly Staff", "Good Cleanliness", "Good Value", "Good Location"]
  },
  gym_fitness: {
    label: "Gym & Fitness",
    aliases: ["gym", "fitness", "yoga", "gym_fitness"],
    negative: ["Poor Equipment", "Poor Service", "Bad Staff", "Poor Cleanliness", "Poor Space", "Poor Experience"],
    neutral: ["Average Equipment", "Average Service", "Okay Staff", "Average Cleanliness", "Average Space", "Okay Experience"],
    positive: ["Good Equipment", "Good Service", "Friendly Staff", "Good Cleanliness", "Good Space", "Good Experience"]
  },
  coaching_education: {
    label: "Coaching & Education",
    aliases: ["coaching", "education", "tuition", "coaching_education"],
    negative: ["Poor Teaching", "Poor Classes", "Bad Staff", "Poor Study Material", "Poor Management", "Poor Experience"],
    neutral: ["Average Teaching", "Average Classes", "Okay Staff", "Average Study Material", "Average Management", "Okay Experience"],
    positive: ["Good Teaching", "Good Classes", "Friendly Staff", "Good Study Material", "Good Management", "Good Experience"]
  },
  hospital: {
    label: "Hospital",
    aliases: ["hospital", "nursing_home"],
    negative: ["Poor Treatment", "Long Wait", "Bad Staff", "Poor Cleanliness", "Poor Service", "Poor Experience"],
    neutral: ["Average Treatment", "Average Wait", "Okay Staff", "Average Cleanliness", "Average Service", "Okay Experience"],
    positive: ["Good Treatment", "Short Wait", "Friendly Staff", "Good Cleanliness", "Good Service", "Good Experience"]
  },
  automobile: {
    label: "Automobile",
    aliases: ["automobile", "car_service", "bike_service", "showroom", "car_wash", "automobile_service"],
    negative: ["Poor Service", "Long Wait", "Bad Staff", "Poor Quality", "Poor Value", "Poor Experience"],
    neutral: ["Average Service", "Average Wait", "Okay Staff", "Average Quality", "Average Value", "Okay Experience"],
    positive: ["Good Service", "Short Wait", "Friendly Staff", "Good Quality", "Good Value", "Good Experience"]
  },
  photography_creative: {
    label: "Photography & Creative",
    aliases: ["photography", "photographer", "videographer", "photography_creative"],
    negative: ["Poor Photos", "Slow Service", "Bad Staff", "Poor Quality", "Poor Value", "Poor Experience"],
    neutral: ["Average Photos", "Average Service", "Okay Staff", "Average Quality", "Average Value", "Okay Experience"],
    positive: ["Good Photos", "Good Service", "Friendly Staff", "Good Quality", "Good Value", "Good Experience"]
  },
  real_estate_property: {
    label: "Real Estate & Property",
    aliases: ["real_estate", "property", "builder", "real_estate_property"],
    negative: ["Poor Service", "Slow Response", "Bad Staff", "Poor Property", "Poor Value", "Poor Experience"],
    neutral: ["Average Service", "Average Response", "Okay Staff", "Average Property", "Average Value", "Okay Experience"],
    positive: ["Good Service", "Quick Response", "Friendly Staff", "Good Property", "Good Value", "Good Experience"]
  },
  retail_shops: {
    label: "Retail / Shops",
    aliases: ["shop", "retail", "retail_shop", "retail_shops"],
    negative: ["Poor Quality", "Poor Variety", "Bad Staff", "Poor Service", "Poor Value", "Poor Experience"],
    neutral: ["Average Quality", "Average Variety", "Okay Staff", "Average Service", "Average Value", "Okay Experience"],
    positive: ["Good Quality", "Good Variety", "Friendly Staff", "Good Service", "Good Value", "Good Experience"]
  },
  mobile_computer: {
    label: "Mobile & Computer / Laptop",
    aliases: ["mobile", "laptop", "computer", "mobile_computer", "mobile_laptop"],
    negative: ["Poor Quality", "Poor Service", "Bad Staff", "Poor Variety", "Poor Value", "Poor Experience"],
    neutral: ["Average Quality", "Average Service", "Okay Staff", "Average Variety", "Average Value", "Okay Experience"],
    positive: ["Good Quality", "Good Service", "Friendly Staff", "Good Variety", "Good Value", "Good Experience"]
  }
};

function getReviewCategoryKey(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (REVIEW_CATEGORY_CONFIG[raw]) return raw;
  for (const [key, config] of Object.entries(REVIEW_CATEGORY_CONFIG)) {
    if (config.aliases.includes(raw)) return key;
  }
  return "restaurant_food";
}

if (typeof window !== "undefined") {
  window.REVIEW_CATEGORY_CONFIG = REVIEW_CATEGORY_CONFIG;
  window.getReviewCategoryKey = getReviewCategoryKey;
}

export { REVIEW_CATEGORY_CONFIG, getReviewCategoryKey };
