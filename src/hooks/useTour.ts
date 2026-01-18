import { useState, useEffect } from 'react';

export interface TourStep {
  id: string;
  target: string; // CSS selector for the element to highlight
  title: string;
  description: string;
  placement?: 'top' | 'bottom' | 'left' | 'right';
}

export interface TourConfig {
  id: string; // Unique tour identifier (e.g., 'profile', 'feed', 'friends')
  steps: TourStep[];
}

const TOUR_STORAGE_KEY = 'completed_tours';

export function useTour(tourId: string) {
  const [isActive, setIsActive] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [hasSeenTour, setHasSeenTour] = useState(true);

  useEffect(() => {
    const completedTours = JSON.parse(localStorage.getItem(TOUR_STORAGE_KEY) || '[]');
    setHasSeenTour(completedTours.includes(tourId));
  }, [tourId]);

  const startTour = () => {
    setCurrentStep(0);
    setIsActive(true);
  };

  const nextStep = (totalSteps: number) => {
    if (currentStep < totalSteps - 1) {
      setCurrentStep(prev => prev + 1);
    } else {
      endTour();
    }
  };

  const prevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    }
  };

  const skipTour = () => {
    endTour();
  };

  const endTour = () => {
    setIsActive(false);
    setCurrentStep(0);
    
    // Mark tour as completed
    const completedTours = JSON.parse(localStorage.getItem(TOUR_STORAGE_KEY) || '[]');
    if (!completedTours.includes(tourId)) {
      completedTours.push(tourId);
      localStorage.setItem(TOUR_STORAGE_KEY, JSON.stringify(completedTours));
    }
    setHasSeenTour(true);
  };

  const resetTour = () => {
    const completedTours = JSON.parse(localStorage.getItem(TOUR_STORAGE_KEY) || '[]');
    const filtered = completedTours.filter((id: string) => id !== tourId);
    localStorage.setItem(TOUR_STORAGE_KEY, JSON.stringify(filtered));
    setHasSeenTour(false);
  };

  return {
    isActive,
    currentStep,
    hasSeenTour,
    startTour,
    nextStep,
    prevStep,
    skipTour,
    endTour,
    resetTour,
  };
}

// Reset all tours (for development/testing)
export function resetAllTours() {
  localStorage.removeItem(TOUR_STORAGE_KEY);
}
