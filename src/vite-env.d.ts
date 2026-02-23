/// <reference types="vite/client" />

declare global {
  interface Window {
    FlutterwaveCheckout?: (config: any) => void;
  }
}

export {};
