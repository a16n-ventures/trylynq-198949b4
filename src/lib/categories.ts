// Unified categories used across InterestSelector, Feed tabs, event creation, and smart-feed
export const CATEGORIES = [
  "Tech & Coding",
  "Business & Startups", 
  "Music & Concerts",
  "Art & Culture",
  "Food & Drink",
  "Nightlife & Parties",
  "Networking",
  "Health & Wellness",
  "Sports & Fitness",
  "Travel & Outdoor",
  "Gaming",
  "Photography",
  "Fashion & Style",
  "Film & Cinema",
  "Education & Learning",
  "Spirituality & Faith",
  "Volunteering & Charity",
  "Comedy & Entertainment",
  "Social Hangouts",
  "Study Groups",
] as const;

export type Category = typeof CATEGORIES[number];

// Feed tab categories (subset for tab UI)
export const FEED_TAB_CATEGORIES = [
  { value: "for_you", label: "For You", icon: "Sparkles" },
  { value: "trending", label: "Trending", icon: "Zap" },
  { value: "communities", label: "Communities", icon: "Users" },
  { value: "music", label: "Music", icon: "Music" },
  { value: "nightlife", label: "Nightlife", icon: "Martini" },
  { value: "tech", label: "Tech", icon: "Monitor" },
  { value: "sports", label: "Sports", icon: "Dumbbell" },
  { value: "food", label: "Food", icon: "UtensilsCrossed" },
  { value: "art", label: "Art", icon: "Palette" },
] as const;
