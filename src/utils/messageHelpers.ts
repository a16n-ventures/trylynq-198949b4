// ============= Message Helpers =============

export const validateImage = (file: File): string | null => {
  const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  if (!validTypes.includes(file.type)) return "Only JPEG, PNG, WEBP, and GIF are allowed.";
  if (file.size > 5 * 1024 * 1024) return "File size must be less than 5MB.";
  return null;
};

export const formatTime = (dateString?: string) => {
  if (!dateString) return '';
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '';
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    return isToday 
      ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) 
      : date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
};

export const formatMessageTime = (dateString?: string) => {
  if (!dateString) return '';
  try {
    return new Date(dateString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
};

export const formatDuration = (minutes: number): string => {
  if (minutes < 60) return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
  if (minutes < 1440) {
    const hours = Math.floor(minutes / 60);
    return `${hours} hour${hours !== 1 ? 's' : ''}`;
  }
  const days = Math.floor(minutes / 1440);
  return `${days} day${days !== 1 ? 's' : ''}`;
};
