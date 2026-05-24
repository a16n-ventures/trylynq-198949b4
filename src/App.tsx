import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
// 1. ADD 'Navigate' HERE
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { LocationProvider } from "@/contexts/LocationContext";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";

// Pages & Layouts
import Index from "./pages/Index";
import Onboarding from "./pages/Onboarding";
import Discover from "./pages/Discover";
import Feed from "./pages/Feed";
import Map from "./pages/Map";
import Messages from "./pages/Messages";
import Friends from "./pages/Friends";
import Profile from "./pages/Profile";
import CreateEvent from "./pages/CreateEvent";
import Events from "./pages/Events";
import Marketplace from "./pages/Marketplace";
import TrustCenter from "./pages/TrustCenter";
import EventInvite from "./pages/EventInvite";
import EventDetail from "./pages/EventDetail";
import Premium from "./pages/Premium";
import Notifications from "./pages/Notifications";
import Terms from "./pages/legal/Terms";
import Privacy from "./pages/legal/Privacy";
import MainLayout from "./components/layout/MainLayout";
import NotFound from "./pages/NotFound";

// Admin Components
import AdminLayout from "./components/layout/AdminLayout";
import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminSettings from "./pages/admin/AdminSettings";
import AdminUsers from "./pages/admin/AdminUsers";
import AdminModeration from "./pages/admin/AdminModeration";
import AdminEvents from "./pages/admin/AdminEvents";
import AdminWallet from "./pages/admin/AdminWallet";
import AdminSubscriptions from "./pages/admin/AdminSubscriptions";
import AdminMarketplace from "./pages/admin/AdminMarketplace";

const queryClient = new QueryClient();

const App = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <LocationProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          
          <BrowserRouter>
              {/* 2. ONLY ONE <Routes> BLOCK */}
              <Routes>
                
                {/* --- Public Routes --- */}
                {/* The Landing Page */}
                <Route path="/ahmia" element={<Index />} />
                
                {/* Redirect root (/) to landing page */}
                <Route path="/" element={<Navigate to="/ahmia" replace />} />

                {/* --- Onboarding (Protected but standalone) --- */}
  <Route path="/onboarding" element={
    <ProtectedRoute requireInterests={false}>
      <Onboarding />
    </ProtectedRoute>
  } />

                {/* --- Admin Routes --- */}
                <Route path="/admin" element={<AdminLayout />}>
                  <Route index element={<AdminDashboard />} />
                  <Route path="settings" element={<AdminSettings />} />
                  <Route path="users" element={<AdminUsers />} />
                  <Route path="moderation" element={<AdminModeration />} /> 
                  <Route path="events" element={<AdminEvents />} />
                  <Route path="subscriptions" element={<AdminSubscriptions />} />
                  <Route path="marketplace" element={<AdminMarketplace />} />
                  <Route path="revenue" element={<AdminWallet />} />
                </Route>

                {/* --- User App Routes (Protected) --- */}
                <Route path="/app" element={
                  <ProtectedRoute>
                    <MainLayout />
                  </ProtectedRoute>
                }>
                  <Route index element={<Feed />} />
                  <Route path="discover" element={<Discover />} />
                  <Route path="feed" element={<Feed />} />
                  <Route path="friends" element={<Friends />} />
                  <Route path="map" element={<Map />} />
                  <Route path="messages" element={<Messages />} />
                  <Route path="events" element={<Events />} />
                  <Route path="events/:eventId" element={<EventDetail />} />
                  <Route path="events/:eventId/invite" element={<EventInvite />} />
                  <Route path="profile" element={<Profile />} />
                  <Route path="notifications" element={<Notifications />} />
                  <Route path="legal/terms-conditions" element={<Terms />} />
                  <Route path="legal/privacy-policy" element={<Privacy />} />
                  <Route path="marketplace" element={<Marketplace />} />
                  <Route path="trust-center" element={<TrustCenter />} />
                </Route>

                {/* --- Standalone Protected Routes --- */}
                <Route path="/create-event" element={
                  <ProtectedRoute>
                    <CreateEvent />
                  </ProtectedRoute>
                } />
                <Route path="/premium" element={
                  <ProtectedRoute>
                    <Premium />
                  </ProtectedRoute>
                } />

                {/* --- Catch-all (404) --- */}
                <Route path="*" element={<NotFound />} />
              </Routes>
          </BrowserRouter>

        </TooltipProvider>
        </LocationProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
};

export default App;
