import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
// Added 'Navigate' to the imports for the redirection logic
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";

// Pages & Layouts
import Index from "./pages/Index";
import Discover from "./pages/Discover";
import Map from "./pages/Map";
import Messages from "./pages/Messages";
import Friends from "./pages/Friends";
import Profile from "./pages/Profile";
import CreateEvent from "./pages/CreateEvent";
import Events from "./pages/Events";
import EventInvite from "./pages/EventInvite";
import EventDetail from "./pages/EventDetail";
import Premium from "./pages/Premium";
import Notifications from "./pages/Notifications";
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

const queryClient = new QueryClient();

const App = () => {
  // 1. Check if we are on the 'try' subdomain
  const hostname = window.location.hostname;
  const isTrySubdomain = hostname === "try.usecorridor.xyz";

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          
          <BrowserRouter>
            {/* 2. Conditional Routing based on Subdomain */}
            {isTrySubdomain ? (
              <Routes>
                {/* CASE A: User visits root 'try.usecorridor.xyz' -> Redirect to '/lynq-africa' */}
                <Route path="/" element={<Navigate to="/lynq-africa" replace />} />
                
                {/* CASE B: User is at '/lynq-africa' -> Show the Index (Landing) page */}
                <Route path="/lynq-africa" element={<Index />} />
                
                {/* CASE C: Catch-all (e.g. 404s on subdomain) -> Redirect back to '/lynq-africa' */}
                <Route path="*" element={<Navigate to="/lynq-africa" replace />} />
              </Routes>
            ) : (
              /* 3. STANDARD ROUTING (Main Domain) */
              <Routes>
                {/* Public Route */}
                <Route path="/" element={<Index />} />

                {/* Admin Routes */}
                <Route path="/admin" element={<AdminLayout />}>
                  <Route index element={<AdminDashboard />} />
                  <Route path="settings" element={<AdminSettings />} />
                  <Route path="users" element={<AdminUsers />} />
                  <Route path="moderation" element={<AdminModeration />} /> 
                  <Route path="events" element={<AdminEvents />} />
                  <Route path="revenue" element={<AdminWallet />} />
                </Route>

                {/* User App Routes */}
                <Route path="/app" element={
                  <ProtectedRoute>
                    <MainLayout />
                  </ProtectedRoute>
                }>
                  <Route index element={<Discover />} />
                  <Route path="discover" element={<Discover />} />
                  <Route path="friends" element={<Friends />} />
                  <Route path="map" element={<Map />} />
                  <Route path="messages" element={<Messages />} />
                  <Route path="events" element={<Events />} />
                  <Route path="events/:eventId" element={<EventDetail />} />
                  <Route path="events/:eventId/invite" element={<EventInvite />} />
                  <Route path="profile" element={<Profile />} />
                  <Route path="notifications" element={<Notifications />} />
                </Route>

                {/* Standalone Protected Routes */}
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

                {/* Catch-all */}
                <Route path="*" element={<NotFound />} />
              </Routes>
            )}
          </BrowserRouter>

        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
};

export default App;
