import type { TourStep } from '@/hooks/useTour';

// Profile Page Tour
export const profileTourSteps: TourStep[] = [
  {
    id: 'profile-avatar',
    target: '[data-tour="profile-avatar"]',
    title: 'Your Profile Picture',
    description: 'Tap here to change your profile photo. A great photo helps friends recognize you!',
    placement: 'bottom',
  },
  {
    id: 'profile-edit',
    target: '[data-tour="profile-edit"]',
    title: 'Edit Your Profile',
    description: 'Update your bio, display name, and other details to let people know more about you.',
    placement: 'bottom',
  },
  {
    id: 'profile-links',
    target: '[data-tour="profile-links"]',
    title: 'Your Links',
    description: 'Add your social media and website links. These will appear on your profile for friends to see.',
    placement: 'top',
  },
  {
    id: 'profile-settings',
    target: '[data-tour="profile-settings"]',
    title: 'Settings & Privacy',
    description: 'Control your location sharing, notifications, and account settings from here.',
    placement: 'top',
  },
];

// Feed Page Tour
export const feedTourSteps: TourStep[] = [
  {
    id: 'feed-tabs',
    target: '[data-tour="feed-tabs"]',
    title: 'Feed & Spotlight',
    description: 'Switch between your main Feed (posts from friends) and Spotlight (discover events & communities).',
    placement: 'bottom',
  },
  {
    id: 'feed-stories',
    target: '[data-tour="feed-stories"]',
    title: 'Stories',
    description: 'Tap on story circles to view friends\' stories. Tap your own to add a new story!',
    placement: 'bottom',
  },
  {
    id: 'feed-create',
    target: '[data-tour="feed-create"]',
    title: 'Create Post',
    description: 'Share what\'s on your mind! Tap here to create posts, photos, videos, or ads.',
    placement: 'top',
  },
  {
    id: 'spotlight-communities',
    target: '[data-tour="spotlight-communities"]',
    title: 'Communities',
    description: 'Discover and join communities that match your interests. Connect with like-minded people!',
    placement: 'bottom',
  },
  {
    id: 'spotlight-events',
    target: '[data-tour="spotlight-events"]',
    title: 'Events',
    description: 'Find events happening near you. RSVP to events and meet new people!',
    placement: 'top',
  },
];

// Friends Page Tour
export const friendsTourSteps: TourStep[] = [
  {
    id: 'friends-tabs',
    target: '[data-tour="friends-tabs"]',
    title: 'Friends Navigation',
    description: 'View your friends, discover nearby people, and manage friend requests from these tabs.',
    placement: 'bottom',
  },
  {
    id: 'friends-search',
    target: '[data-tour="friends-search"]',
    title: 'Search Friends',
    description: 'Quickly find friends by searching their name or username.',
    placement: 'bottom',
  },
  {
    id: 'friends-nearby',
    target: '[data-tour="friends-nearby"]',
    title: 'Nearby People',
    description: 'Enable location to discover people near you. Send friend requests to connect!',
    placement: 'bottom',
  },
];

// Map Page Tour
export const mapTourSteps: TourStep[] = [
  {
    id: 'map-view',
    target: '[data-tour="map-view"]',
    title: 'Interactive Map',
    description: 'See where your friends are! Friends sharing their location will appear as markers.',
    placement: 'bottom',
  },
  {
    id: 'map-friends',
    target: '[data-tour="map-friends"]',
    title: 'Nearby Friends',
    description: 'Quickly see which friends are nearby. Tap to get directions or send a message.',
    placement: 'top',
  },
  {
    id: 'map-events',
    target: '[data-tour="map-events"]',
    title: 'Nearby Events',
    description: 'Discover events happening around you. Swipe through cards to explore!',
    placement: 'top',
  },
];

// Messages Page Tour
export const messagesTourSteps: TourStep[] = [
  {
    id: 'messages-tabs',
    target: '[data-tour="messages-tabs"]',
    title: 'Direct Messages & Communities',
    description: 'Switch between private messages with friends and group chats in communities.',
    placement: 'bottom',
  },
  {
    id: 'messages-search',
    target: '[data-tour="messages-search"]',
    title: 'Search Conversations',
    description: 'Find specific chats or messages quickly with search.',
    placement: 'bottom',
  },
  {
    id: 'messages-compose',
    target: '[data-tour="messages-compose"]',
    title: 'Start New Chat',
    description: 'Tap here to start a new conversation or create a community group.',
    placement: 'left',
  },
];

// Events Page Tour
export const eventsTourSteps: TourStep[] = [
  {
    id: 'events-tabs',
    target: '[data-tour="events-tabs"]',
    title: 'Explore Events',
    description: 'Browse upcoming events, see what you\'re attending, and check your own events.',
    placement: 'bottom',
  },
  {
    id: 'events-create',
    target: '[data-tour="events-create"]',
    title: 'Create Event',
    description: 'Host your own event! Create physical meetups or virtual events with video calls.',
    placement: 'left',
  },
  {
    id: 'events-card',
    target: '[data-tour="events-card"]',
    title: 'Event Details',
    description: 'Tap on any event to see details, attendees, and RSVP. Don\'t miss out!',
    placement: 'bottom',
  },
];
