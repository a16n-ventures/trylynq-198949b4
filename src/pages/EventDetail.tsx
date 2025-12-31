import { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Calendar,
  MapPin,
  Users,
  DollarSign,
  Share2,
  Video,
  VideoOff,
  Mic,
  MicOff,
  PhoneOff,
  Camera,
  StopCircle,
  Play,
  Download,
  Loader2,
  UserPlus,
  ExternalLink,
  Clock,
  Check,
  Trash2, 
  AlertCircle,
  Megaphone,
  Search,
  Copy,
  Pencil
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from '@/components/ui/textarea';
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";

type Event = {
  id: string;
  title: string;
  description: string;
  category: string;
  location: string;
  start_date: string;
  end_date?: string | null;
  max_attendees?: number | null;
  ticket_price: number;
  is_public: boolean;
  requires_approval: boolean;
  creator_id: string;
  image_url?: string | null;
  event_type: 'physical' | 'virtual';
  meeting_link?: string | null;
  is_sponsored?: boolean; // [MODIFIED: Added is_sponsored]
  creator: {
    user_id: string;
    display_name: string;
    avatar_url?: string;
  };
};

type Attendee = {
  user_id: string;
  display_name: string;
  avatar_url?: string;
};

// [MODIFIED: Added Friend Type]
type Friend = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
};

const EventDetail = () => {
  // FIXED: Handle both 'id' (standard) and 'eventId' (custom) parameter names
  const params = useParams();
  const eventId = params.eventId || params.id;
  
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Video Call States
  const [isInCall, setIsInCall] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [showVideoDialog, setShowVideoDialog] = useState(false);

  // Recording States
  const [isRecording, setIsRecording] = useState(false);
  const [recordedChunks, setRecordedChunks] = useState<Blob[]>([]);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [showRecordingDialog, setShowRecordingDialog] = useState(false);
  
  // NEW: Delete Dialog State
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  // [MODIFIED: Invite Dialog States]
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFriends, setSelectedFriends] = useState<Set<string>>(new Set());
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [copied, setCopied] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editLocation, setEditLocation] = useState('');
  const [editStartDate, setEditStartDate] = useState('');
  const [editTicketPrice, setEditTicketPrice] = useState('');
  const [editMaxAttendees, setEditMaxAttendees] = useState('');

  // Fetch event details (Robust Version)
  const { data: event, isPending: loadingEvent } = useQuery({
    queryKey: ['event', eventId],
    queryFn: async (): Promise<Event> => {
      if (!eventId) throw new Error("No event ID");

      // 1. Fetch Event first (No Joins to avoid FK errors)
      const { data: eventData, error: eventError } = await supabase
        .from('events')
        .select('*')
        .eq('id', eventId)
        .single();

      if (eventError) throw eventError;

      // 2. Fetch Creator Profile Separately
      let creatorProfile = { 
        user_id: eventData.creator_id, 
        display_name: 'Unknown Host', 
        avatar_url: undefined 
      };

      if (eventData.creator_id) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('id, display_name, avatar_url')
          .eq('id', eventData.creator_id) // check against id
          .maybeSingle(); // maybeSingle prevents error if profile missing
        
        if (!profile) {
             // Fallback check for user_id if id didn't match
             const { data: profileAlt } = await supabase
              .from('profiles')
              .select('user_id, display_name, avatar_url')
              .eq('user_id', eventData.creator_id)
              .maybeSingle();
             
             if (profileAlt) {
                 creatorProfile = {
                    user_id: eventData.creator_id,
                    display_name: profileAlt.display_name || 'Unknown Host',
                    avatar_url: profileAlt.avatar_url
                 };
             }
        } else {
             creatorProfile = {
                user_id: eventData.creator_id,
                display_name: profile.display_name || 'Unknown Host',
                avatar_url: profile.avatar_url
             };
        }
      }
      
      return {
        ...eventData,
        event_type: (eventData.event_type as 'physical' | 'virtual') || 'physical',
        creator: creatorProfile
      } as Event;
    },
    enabled: !!eventId,
  });

  // Fetch attendees
  const { data: attendees = [] } = useQuery<Attendee[]>({
    queryKey: ['event-attendees', eventId],
    queryFn: async () => {
      if (!eventId) return [];

      // 1. Get attendee IDs
      const { data: rawAttendees, error } = await supabase
        .from('event_attendees')
        .select('user_id, status')
        .eq('event_id', eventId)
        .eq('status', 'confirmed');

      if (error) throw error;
      if (!rawAttendees?.length) return [];

      const userIds = rawAttendees.map(a => a.user_id);

      // 2. Fetch Profiles safely
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, user_id, display_name, avatar_url')
        .or(`id.in.(${userIds.join(',')}),user_id.in.(${userIds.join(',')})`); // Check both ID columns

      // Map back to format
      return userIds.map(uid => {
        const profile = profiles?.find(p => p.id === uid || p.user_id === uid);
        return {
            user_id: uid,
            display_name: profile?.display_name || 'Attendee',
            avatar_url: profile?.avatar_url
        };
      });
    },
    enabled: !!eventId,
  });

    // [MODIFIED: Fetch Friends for Invite]
    const { data: friends = [] } = useQuery<Friend[]>({
    queryKey: ['my-friends', user?.id],
    queryFn: async () => {
      if (!user) return [];
      
      // Get accepted friendships first
      const { data: friendships } = await supabase
        .from('friendships')
        .select('addressee_id, requester_id')
        .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)
        .eq('status', 'accepted');
      
      if (!friendships || friendships.length === 0) return [];
      
      // Get the friend IDs (the other person in each friendship)
      const friendIds = friendships.map(f => 
        f.requester_id === user.id ? f.addressee_id : f.requester_id
      );
      
      // Fetch friend profiles
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, display_name, avatar_url')
        .in('user_id', friendIds);
      
      return profiles || [];
    },
    enabled: !!user && showInviteDialog
  });
  
  const { data: existingInvites = [] } = useQuery<string[]>({
  queryKey: ['event-invites', eventId],
  queryFn: async () => {
    if (!eventId) return [];
    // Use consistent table name - check your database schema
    const { data } = await supabase
      .from('event_invitations') // or 'event_invites' - match your schema
      .select('invitee_id') // or 'receiver_id' - match your schema
      .eq('event_id', eventId)
      .in('status', ['pending', 'accepted']);
    return data?.map(inv => inv.invitee_id) || [];
  },
  enabled: !!eventId && showInviteDialog
});

const invitedFriendIds = existingInvites;

const filteredFriends = friends.filter(f => 
  f.display_name?.toLowerCase().includes(searchQuery.toLowerCase())
);

  const handleSendInvites = () => {
    if (selectedFriends.size === 0) {
      toast.error('Please select at least one friend');
      return;
    }
    sendInvitations.mutate(Array.from(selectedFriends));
  };

  const getShareLink = () => {
    return `${window.location.origin}/app/events/${eventId}`;
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(getShareLink());
      setCopied(true);
      toast.success('Link copied!');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy link');
    }
  };

  const handleExternalShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: event?.title,
          text: `Join me at ${event?.title}`,
          url: getShareLink(),
        });
      } catch (err) {
        console.error('Share failed:', err);
      }
    } else {
      await copyToClipboard();
    }
  };

  // Check if user is attending
  const { data: isAttending } = useQuery({
    queryKey: ['is-attending', eventId, user?.id],
    queryFn: async () => {
      if (!user?.id || !eventId) return false;
      const { data } = await supabase
        .from('event_attendees')
        .select('id')
        .eq('event_id', eventId)
        .eq('user_id', user.id)
        .eq('status', 'confirmed')
        .single();
      return !!data;
    },
    enabled: !!eventId && !!user?.id,
  });

  // RSVP Mutation
  const rsvpMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id || !eventId) throw new Error('Missing user or event');

      const { error } = await supabase
        .from('event_attendees')
        .insert({
          event_id: eventId,
          user_id: user.id,
          status: event?.requires_approval ? 'pending' : 'confirmed'
        });

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(event?.requires_approval 
        ? 'RSVP sent! Waiting for approval' 
        : 'Successfully registered!'
      );
      queryClient.invalidateQueries({ queryKey: ['event-attendees', eventId] });
      queryClient.invalidateQueries({ queryKey: ['is-attending', eventId] });
    },
    onError: (error: any) => {
      toast.error('Failed to RSVP: ' + error.message);
    }
  });

  // NEW: Delete Event Mutation
  const deleteEventMutation = useMutation({
    mutationFn: async () => {
      if (!eventId || !user?.id) return;
      const { error } = await supabase
        .from('events')
        .delete()
        .eq('id', eventId)
        .eq('creator_id', user.id); // Security: Ensure only creator can delete

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Event deleted successfully');
      navigate('/app/events'); // Redirect to main events list
    },
    onError: (error: any) => {
      toast.error('Failed to delete event: ' + error.message);
    }
  });
  
  const editEventMutation = useMutation({
      mutationFn: async () => {
        if (!eventId || !user?.id) throw new Error('Missing data');
        
        const updates = {
          title: editTitle.trim(),
          description: editDescription.trim(),
          location: editLocation.trim(),
          start_date: new Date(editStartDate).toISOString(),
          ticket_price: parseFloat(editTicketPrice) || 0,
          max_attendees: editMaxAttendees ? parseInt(editMaxAttendees) : null,
        };
        
        const { error } = await supabase
          .from('events')
          .update(updates)
          .eq('id', eventId)
          .eq('creator_id', user.id); // Security: Only creator can edit
        
        if (error) throw error;
      },
      onSuccess: () => {
        toast.success('Event updated successfully!');
        setShowEditDialog(false);
        queryClient.invalidateQueries({ queryKey: ['event', eventId] });
      },
      onError: (error: any) => {
        toast.error('Failed to update event: ' + error.message);
      }
    });
    
    const toggleFriendSelection = (friendId: string) => {
      setSelectedFriends(prev => {
        const newSet = new Set(prev);
        if (newSet.has(friendId)) {
          newSet.delete(friendId);
        } else {
          newSet.add(friendId);
        }
        return newSet;
      });
    };
    
    const selectAll = () => {
      const availableFriends = filteredFriends.filter(f => !invitedFriendIds.includes(f.id));
      setSelectedFriends(new Set(availableFriends.map(f => f.id)));
    };
    
    const deselectAll = () => {
      setSelectedFriends(new Set());
    };

    // [MODIFIED: Invite Friends Mutation]
    const inviteFriendsMutation = useMutation({
    mutationFn: async (friendIds: string[]) => {
      if (!eventId || !user) throw new Error('Missing data');
      
      const invites = friendIds.map(friendId => ({
        event_id: eventId,
        inviter_id: user.id, // Match Notifications schema
        invitee_id: friendId, // Match Notifications schema
        status: 'pending'
      }));
      
      // Use consistent table name
      const { error } = await supabase
        .from('event_invitations') // Match Notifications.tsx
        .insert(invites);
        
      if (error) throw error;
      return friendIds.length;
    },
    onSuccess: (count) => {
      toast.success(`Invites sent to ${count} friend${count !== 1 ? 's' : ''}!`);
      setShowInviteDialog(false);
      setSelectedFriends(new Set()); // Clear as Set
      queryClient.invalidateQueries({ queryKey: ['event-invites', eventId] });
    },
    onError: (err: any) => {
      toast.error("Failed to send invites: " + err.message);
    }
  }); 
  
  const sendInvitations = inviteFriendsMutation;

  // Video Call Functions
  const startVideoCall = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
      });

      mediaStreamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      setIsInCall(true);
      setShowVideoDialog(true);
      toast.success('Video call started');
    } catch (error) {
      console.error('Error starting video call:', error);
      toast.error('Failed to start video call. Please check camera permissions.');
    }
  };

  const endVideoCall = () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setIsInCall(false);
    setShowVideoDialog(false);
    setIsMuted(false);
    setIsVideoOff(false);
    toast.info('Call ended');
  };

  const toggleMute = () => {
    if (mediaStreamRef.current) {
      const audioTrack = mediaStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
      }
    }
  };

  const toggleVideo = () => {
    if (mediaStreamRef.current) {
      const videoTrack = mediaStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoOff(!videoTrack.enabled);
      }
    }
  };

  // Recording Functions
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 1920, height: 1080 },
        audio: true
      });

      mediaStreamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'video/webm;codecs=vp9'
      });

      const chunks: Blob[] = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        setRecordedChunks(chunks);
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
      setIsRecording(true);
      setShowRecordingDialog(true);
      setRecordingDuration(0);

      // Start duration counter
      recordingIntervalRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);

      toast.success('Recording started');
    } catch (error) {
      console.error('Error starting recording:', error);
      toast.error('Failed to start recording. Please check camera permissions.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);

      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
        recordingIntervalRef.current = null;
      }

      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(track => track.stop());
      }

      toast.success('Recording stopped');
    }
  };

  const downloadRecording = () => {
    if (recordedChunks.length === 0) {
      toast.error('No recording available');
      return;
    }

    const blob = new Blob(recordedChunks, { type: 'video/webm' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${event?.title || 'event'}-recording-${Date.now()}.webm`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast.success('Recording downloaded');
  };

  const closeRecordingDialog = () => {
    if (isRecording) {
      stopRecording();
    }
    setShowRecordingDialog(false);
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  // Format duration
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };
  
  useEffect(() => {
    if (showEditDialog && event) {
      setEditTitle(event.title);
      setEditDescription(event.description);
      setEditLocation(event.location);
      setEditStartDate(event.start_date.slice(0, 16)); // Format for datetime-local input
      setEditTicketPrice(event.ticket_price.toString());
      setEditMaxAttendees(event.max_attendees?.toString() || '');
    }
  }, [showEditDialog, event]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(track => track.stop());
      }
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
      }
    };
  }, []);

  if (loadingEvent) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!event) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Event not found</p>
        <Button variant="link" onClick={() => navigate('/app/events')}>Go back to Events</Button>
      </div>
    );
  }

  const isCreator = user?.id === event.creator_id;
  const eventDate = new Date(event.start_date);
  const isUpcoming = eventDate > new Date();

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header with Image */}
      <div className="relative h-64 bg-gradient-to-br from-purple-600 to-blue-600 mb-8">
        {event.image_url ? (
          <img
            src={event.image_url}
            alt={event.title}
            className="w-full h-full object-cover"
          />
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
        
        <Button
          variant="ghost"
          size="sm"
          className="absolute top-4 left-4 text-white hover:bg-white/20"
          onClick={() => navigate('/app/events')}
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>

        <Button
          variant="ghost"
          size="sm"
          className="absolute top-4 right-4 text-white hover:bg-white/20"
          onClick={() => {
            if (navigator.share) {
              navigator.share({
                title: event.title,
                url: window.location.href
              });
            } else {
              navigator.clipboard.writeText(window.location.href);
              toast.success("Link copied!");
            }
          }}
        >
          <Share2 className="w-5 h-5" />
        </Button>
      </div>

      <div className="container-mobile -mt-8 space-y-4">
        {/* Main Info Card */}
        <Card className="gradient-card shadow-card border-0">
          <CardContent className="p-6 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                {/* [MODIFIED: Add Sponsored Badge] */}
                <div className="flex gap-2 mb-2">
                  <Badge>{event.category}</Badge>
                  {event.is_sponsored && (
                     <Badge variant="outline" className="border-yellow-500 text-yellow-600 bg-yellow-50 dark:bg-yellow-950/20">
                       <Megaphone className="w-3 h-3 mr-1" /> Sponsored
                     </Badge>
                  )}
                </div>
                <h1 className="text-2xl font-bold mb-2">{event.title}</h1>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Avatar className="w-6 h-6">
                    <AvatarImage src={event.creator?.avatar_url} />
                    <AvatarFallback>
                      {event.creator?.display_name?.[0]?.toUpperCase() || '?'}
                    </AvatarFallback>
                  </Avatar>
                  <span>Hosted by {event.creator?.display_name || 'Unknown'}</span>
                </div>
              </div>
              <Badge variant={event.event_type === 'virtual' ? 'default' : 'secondary'}>
                {event.event_type === 'virtual' ? (
                  <><Video className="w-3 h-3 mr-1" /> Virtual</>
                ) : (
                  <><MapPin className="w-3 h-3 mr-1" /> Physical</>
                )}
              </Badge>
            </div>

            <div className="space-y-3 pt-4 border-t border-border">
              <div className="flex items-center gap-3 text-sm">
                <Calendar className="w-4 h-4 text-primary" />
                <span>{eventDate.toLocaleDateString('en-US', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric'
                })}</span>
              </div>

              <div className="flex items-center gap-3 text-sm">
                <Clock className="w-4 h-4 text-primary" />
                <span>{eventDate.toLocaleTimeString('en-US', {
                  hour: '2-digit',
                  minute: '2-digit'
                })}</span>
              </div>

              <div className="flex items-center gap-3 text-sm">
                <MapPin className="w-4 h-4 text-primary" />
                <span>{event.location}</span>
              </div>

              {event.event_type === 'virtual' && event.meeting_link && (
                <div className="flex items-center gap-3 text-sm">
                  <Video className="w-4 h-4 text-primary" />
                  <a
                    href={event.meeting_link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline flex items-center gap-1"
                  >
                    Join Meeting <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}

              <div className="flex items-center gap-3 text-sm">
                <Users className="w-4 h-4 text-primary" />
                <span>
                  {attendees.length} attending
                  {event.max_attendees && ` • ${event.max_attendees} max`}
                </span>
              </div>

              {event.ticket_price > 0 && (
                <div className="flex items-center gap-3 text-sm">
                  <DollarSign className="w-4 h-4 text-primary" />
                  <span className="font-semibold">₦{event.ticket_price.toFixed(2)}</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Tabs */}
        <Tabs defaultValue="about" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="about">About</TabsTrigger>
            <TabsTrigger value="attendees">Attendees ({attendees.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="about" className="space-y-4 mt-4">
            <Card>
              <CardContent className="p-4">
                <h3 className="font-semibold mb-2">Description</h3>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {event.description}
                </p>
              </CardContent>
            </Card>

            {/* Event Type Specific Features */}
            {isCreator && (
              <Card>
                <CardContent className="p-4 space-y-3">
                  <h3 className="font-semibold mb-2">Host Controls</h3>
                  
                  {/* Edit Event Button - NEW */}
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => setShowEditDialog(true)}
                  >
                    <Pencil className="w-4 h-4 mr-2" />
                    Edit Event
                  </Button>
                  
                  {event.event_type === 'virtual' ? (
                    <Button
                      className="w-full"
                      onClick={startVideoCall}
                      disabled={isInCall}
                    >
                      <Video className="w-4 h-4 mr-2" />
                      {isInCall ? 'In Call' : 'Start Video Call'}
                    </Button>
                  ) : (
                    <Button
                      className="w-full"
                      onClick={startRecording}
                      disabled={isRecording}
                    >
                      <Camera className="w-4 h-4 mr-2" />
                      {isRecording ? 'Recording...' : 'Start Recording Event'}
                    </Button>
                  )}
            
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => setShowInviteDialog(true)}
                  >
                    <UserPlus className="w-4 h-4 mr-2" />
                    Invite Friends
                  </Button>
            
                  <Button
                    variant="destructive"
                    className="w-full"
                    onClick={() => setShowDeleteDialog(true)}
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete Event
                  </Button>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="attendees" className="space-y-2 mt-4">
            {attendees.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No attendees yet
              </div>
            ) : (
              attendees.map((attendee) => (
                <Card key={attendee.user_id}>
                  <CardContent className="p-3 flex items-center gap-3">
                    <Avatar className="w-10 h-10">
                      <AvatarImage src={attendee.avatar_url} />
                      <AvatarFallback>
                        {attendee.display_name?.[0]?.toUpperCase() || 'U'}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <p className="font-semibold text-sm">{attendee.display_name || 'Unknown User'}</p>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>
        </Tabs>

        {/* RSVP Button */}
        {!isCreator && isUpcoming && (
          <div className="fixed bottom-4 left-0 right-0 px-4 z-10">
            <Button
              className="w-full gradient-primary text-white shadow-lg"
              size="lg"
              onClick={() => rsvpMutation.mutate()}
              disabled={rsvpMutation.isPending || isAttending}
            >
              {rsvpMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : isAttending ? (
                <>
                  <Check className="w-4 h-4 mr-2" />
                  Registered
                </>
              ) : (
                <>
                  <UserPlus className="w-4 h-4 mr-2" />
                  RSVP Now
                </>
              )}
            </Button>
          </div>
        )}
      </div>

      {/* Video Call Dialog */}
      <Dialog open={showVideoDialog} onOpenChange={setShowVideoDialog}>
        <DialogContent className="max-w-4xl h-[80vh] p-0">
          <div className="relative w-full h-full bg-black rounded-lg overflow-hidden">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />
            
            {/* Call Controls */}
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-4">
              <Button
                size="icon"
                variant={isMuted ? "destructive" : "secondary"}
                className="rounded-full w-14 h-14"
                onClick={toggleMute}
              >
                {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
              </Button>

              <Button
                size="icon"
                variant={isVideoOff ? "destructive" : "secondary"}
                className="rounded-full w-14 h-14"
                onClick={toggleVideo}
              >
                {isVideoOff ? <VideoOff className="w-6 h-6" /> : <Video className="w-6 h-6" />}
              </Button>

              <Button
                size="icon"
                variant="destructive"
                className="rounded-full w-16 h-16"
                onClick={endVideoCall}
              >
                <PhoneOff className="w-6 h-6" />
              </Button>
            </div>

            {/* Call Info */}
            <div className="absolute top-4 left-4 bg-black/50 backdrop-blur-sm rounded-lg px-4 py-2">
              <p className="text-white text-sm font-semibold">{event.title}</p>
              <p className="text-white/70 text-xs">Video Call Active</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Recording Dialog */}
      <Dialog open={showRecordingDialog} onOpenChange={closeRecordingDialog}>
        <DialogContent className="max-w-4xl h-[80vh] p-0">
          <div className="relative w-full h-full bg-black rounded-lg overflow-hidden">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />

            {/* Recording Indicator */}
            {isRecording && (
              <div className="absolute top-4 left-4 bg-red-600 backdrop-blur-sm rounded-lg px-4 py-2 flex items-center gap-2 animate-pulse">
                <div className="w-3 h-3 bg-white rounded-full" />
                <p className="text-white text-sm font-semibold">
                  REC {formatDuration(recordingDuration)}
                </p>
              </div>
            )}

            {/* Recording Controls */}
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-4">
              {isRecording ? (
                <Button
                  size="icon"
                  variant="destructive"
                  className="rounded-full w-16 h-16"
                  onClick={stopRecording}
                >
                  <StopCircle className="w-6 h-6" />
                </Button>
              ) : recordedChunks.length > 0 ? (
                <>
                  <Button
                    size="icon"
                    variant="secondary"
                    className="rounded-full w-14 h-14"
                    onClick={downloadRecording}
                  >
                    <Download className="w-6 h-6" />
                  </Button>
                  <Button
                    size="icon"
                    variant="default"
                    className="rounded-full w-14 h-14"
                    onClick={startRecording}
                  >
                    <Play className="w-6 h-6" />
                  </Button>
                </>
              ) : null}
            </div>

            {/* Event Info */}
            <div className="absolute top-4 right-4 bg-black/50 backdrop-blur-sm rounded-lg px-4 py-2">
              <p className="text-white text-sm font-semibold">{event.title}</p>
              <p className="text-white/70 text-xs">
                {isRecording ? 'Recording in progress' : 'Ready to record'}
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* NEW: Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent className="sm:max-w-[480px] max-w-[calc(100vw-2rem)] my-auto mx-auto">
          <AlertDialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-3 bg-red-100 dark:bg-red-900/30 rounded-full">
                <AlertCircle className="w-6 h-6 text-red-600 dark:text-red-400" />
              </div>
              <AlertDialogTitle className="text-xl">Delete Event?</AlertDialogTitle>
            </div>
            <AlertDialogDescription className="text-base leading-relaxed">
              Are you sure you want to delete this event? This action cannot be undone.
              All attendees will be removed and the event page will no longer be accessible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={() => deleteEventMutation.mutate()}
              disabled={deleteEventMutation.isPending}
            >
              {deleteEventMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete Event
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      
      {/* [MODIFIED: Invite Friends Dialog] */}
      <Dialog open={showInviteDialog} onOpenChange={setShowInviteDialog}>
        <DialogContent className="sm:max-w-[500px] max-w-[calc(100vw-2rem)] h-[80vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-6 pt-6 pb-4 border-b flex-shrink-0">
            <DialogTitle className="space-y-4">
              {/* Share Link Section */}
              <Card className="gradient-card shadow-card border-0">
                <CardContent className="p-4 space-y-3">
                  <h3 className="font-semibold flex items-center gap-2 text-base">
                    <Share2 className="w-4 h-4" />
                    Share Event Link
                  </h3>
                  <div className="flex gap-2">
                    <Input
                      value={getShareLink()}
                      readOnly
                      className="flex-1 bg-background/50 text-sm"
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={copyToClipboard}
                    >
                      {copied ? (
                        <Check className="w-4 h-4 text-green-500" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={handleExternalShare}
                  >
                    <Share2 className="w-4 h-4 mr-2" />
                    Share via Apps
                  </Button>
                </CardContent>
              </Card>
      
              {/* Friend Selection Header */}
              <div className="flex items-center justify-between pt-2">
                <h3 className="font-semibold flex items-center gap-2 text-base">
                  <Users className="w-5 h-5" />
                  Invite Friends ({selectedFriends.size} selected)
                </h3>
                <div className="flex gap-2">
                  {selectedFriends.size > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={deselectAll}
                    >
                      Clear
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={selectAll}
                    disabled={filteredFriends.filter(f => !invitedFriendIds.includes(f.id)).length === 0}
                  >
                    Select All
                  </Button>
                </div>
              </div>
            </DialogTitle>
          </DialogHeader>
      
          {/* Search Bar */}
          <div className="px-6 py-4 border-b flex-shrink-0">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input 
                placeholder="Search friends..." 
                className="pl-9 bg-muted/50" 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
      
          {/* Scrollable Friends List */}
          <div className="flex-1 min-h-0 overflow-y-auto px-6 py-2">
            <div className="space-y-2 pb-4">
              {filteredFriends.length === 0 ? (
                <div className="text-center py-12">
                  <Users className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
                  <p className="text-sm text-muted-foreground">
                    {friends.length === 0 ? 'No friends to invite' : 'No friends match your search'}
                  </p>
                </div>
              ) : (
                filteredFriends.map((friend) => {
                  const isInvited = invitedFriendIds.includes(friend.id);
                  const isSelected = selectedFriends.has(friend.id);
                  
                  return (
                    <div 
                      key={friend.id} 
                      className={`flex items-center gap-3 p-3 rounded-xl transition-all ${
                        isInvited 
                          ? 'bg-muted/30 opacity-60 cursor-not-allowed' 
                          : isSelected
                          ? 'bg-primary/10 border-2 border-primary'
                          : 'hover:bg-muted/50 border-2 border-transparent cursor-pointer'
                      }`}
                      onClick={() => !isInvited && toggleFriendSelection(friend.id)}
                    >
                      <Checkbox 
                        id={`friend-${friend.id}`}
                        checked={isSelected}
                        disabled={isInvited}
                        onCheckedChange={() => !isInvited && toggleFriendSelection(friend.id)}
                        className="pointer-events-none"
                      />
                      <Avatar className="h-10 w-10 ring-2 ring-background">
                        <AvatarImage src={friend.avatar_url || ''} />
                        <AvatarFallback className="text-sm">
                          {friend.display_name?.[0]?.toUpperCase() || 'U'}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {friend.display_name || 'Unknown User'}
                        </p>
                        {isInvited && (
                          <p className="text-xs text-muted-foreground">Already invited</p>
                        )}
                      </div>
                      {isSelected && !isInvited && (
                        <Check className="w-5 h-5 text-primary flex-shrink-0" />
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
      
          {/* Footer with info and buttons */}
          <div className="border-t flex-shrink-0">
            {invitedFriendIds.length > 0 && (
              <div className="px-6 py-3 bg-muted/30">
                <p className="text-sm text-muted-foreground flex items-center gap-2">
                  <Check className="w-4 h-4" />
                  {invitedFriendIds.length} friend{invitedFriendIds.length !== 1 ? 's' : ''} already invited
                </p>
              </div>
            )}
            
            <DialogFooter className="px-6 py-4">
              <Button 
                variant="outline" 
                onClick={() => {
                  setShowInviteDialog(false);
                  setSelectedFriends(new Set());
                  setSearchQuery('');
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSendInvites}
                disabled={sendInvitations.isPending || selectedFriends.size === 0}
                className="min-w-[140px]"
              >
                {sendInvitations.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <UserPlus className="w-4 h-4 mr-2" />
                    Send {selectedFriends.size > 0 ? `(${selectedFriends.size})` : ''}
                  </>
                )}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
      
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="sm:max-w-[600px] max-w-[calc(100vw-2rem)] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="w-5 h-5" />
              Edit Event
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {/* Title */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Event Title *</label>
              <Input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                placeholder="Enter event title"
                maxLength={100}
              />
            </div>
      
            {/* Description */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Description *</label>
              <Textarea
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                placeholder="Describe your event..."
                rows={4}
                maxLength={500}
              />
            </div>
      
            {/* Location */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Location *</label>
              <Input
                value={editLocation}
                onChange={(e) => setEditLocation(e.target.value)}
                placeholder="Event location or address"
              />
            </div>
      
            {/* Date & Time */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Start Date & Time *</label>
              <Input
                type="datetime-local"
                value={editStartDate}
                onChange={(e) => setEditStartDate(e.target.value)}
              />
            </div>
      
            {/* Ticket Price */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Ticket Price (₦)</label>
              <Input
                type="number"
                value={editTicketPrice}
                onChange={(e) => setEditTicketPrice(e.target.value)}
                placeholder="0.00"
                min="0"
                step="0.01"
              />
            </div>
      
            {/* Max Attendees */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Max Attendees (Optional)</label>
              <Input
                type="number"
                value={editMaxAttendees}
                onChange={(e) => setEditMaxAttendees(e.target.value)}
                placeholder="Unlimited"
                min="1"
              />
            </div>
          </div>
      
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setShowEditDialog(false)}
              disabled={editEventMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={() => editEventMutation.mutate()}
              disabled={
                editEventMutation.isPending || 
                !editTitle.trim() || 
                !editDescription.trim() || 
                !editLocation.trim() ||
                !editStartDate
              }
            >
              {editEventMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Check className="w-4 h-4 mr-2" />
                  Save Changes
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default EventDetail;
