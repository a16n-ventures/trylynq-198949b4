// Shared event formatting helpers — single source of truth across Map / Events / Feed.

export const isFreeEvent = (price?: number | null): boolean => {
  return price == null || Number(price) <= 0;
};

export const formatTicketPrice = (price?: number | null): string => {
  if (isFreeEvent(price)) return 'Free';
  return `₦${Number(price).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
};

export const formatTicketPriceLong = (price?: number | null): string => {
  if (isFreeEvent(price)) return 'Free entry';
  return `₦${Number(price).toLocaleString()} ticket`;
};
