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
  Check
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

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

const EventDetail = () => {
  const { eventId } = useParams();
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

  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch event details
  const { data: event, isPending: loadingEvent } = useQuery<Event>({
    queryKey: ['event', eventId],
    queryFn: async () => {
      // FIX 1: Added join query for creator details
      const { data, error } = await supabase
        .from('events')
        .select(`
          *,
          creator:profiles!creator_id (
            user_id,
            display_name,
            avatar_url
          )
        `)
        .eq('id', eventId)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!eventId,
  });

  // Fetch attendees
  const { data: attendees = [] } = useQuery<Attendee[]>({
    queryKey: ['event-attendees', eventId],
    queryFn: async () => {
      // FIX 2: Added join query for profile details of attendees
      const { data, error } = await supabase
        .from('event_attendees')
        .select(`
          status,
          profiles:user_id (
            user_id,
            display_name,
            avatar_url
          )
        `)
        .eq('event_id', eventId)
        .eq('status', 'confirmed');

      if (error) throw error;
      // Map the nested profile object to flat Attendee type
      return data.map((a: any) => a.profiles) as Attendee[];
    },
    enabled: !!eventId,
  });

  // Check if user is attending
  const { data: isAttending } = useQuery({
    queryKey: ['is-attending', eventId, user?.id],
    queryFn: async () => {
      if (!user?.id) return false;
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
      </div>
    );
  }

  const isCreator = user?.id === event.creator_id;
  const eventDate = new Date(event.start_date);
  const isUpcoming = eventDate > new Date();

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header with Image */}
      <div className="relative h-64 bg-gradient-to-br from-purple-600 to-blue-600">
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
          onClick={() => navigate('/events')}
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
                <Badge className="mb-2">{event.category}</Badge>
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
                    onClick={() => navigate(`/events/${eventId}/invite`)}
                  >
                    <UserPlus className="w-4 h-4 mr-2" />
                    Invite Friends
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
                variant={isVideoOff ? "destructive" : "secondary"}sName="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : filteredFriends.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            {search ? 'No friends found' : 'No friends available to invite'}
          </div>
        ) : (
          <div className="space-y-2">
            {filteredFriends.map((friend) => {
              const isSelected = selectedFriends.has(friend.user_id);
              return (
                <Card
                  key={friend.user_id}
                  className={`cursor-pointer transition-all ${
                    isSelected
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:bg-accent/5'
                  }`}
                  onClick={() => toggleFriend(friend.user_id)}
                >
                  <CardContent className="p-3 flex items-center gap-3">
                    <Avatar className="w-12 h-12">
                      <AvatarImage src={friend.avatar_url || undefined} />
                      <AvatarFallback>
                        {friend.display_name?.[0]?.toUpperCase() || 'U'}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold truncate">
                        {friend.display_name || 'Unknown User'}
                      </p>
                    </div>
                    <div
                      className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                        isSelected
                          ? 'bg-primary border-primary'
                          : 'border-muted-foreground/30'
                      }`}
                    >
                      {isSelected && <Check className="w-4 h-4 text-white" />}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Invited Friends Count */}
        {invitedFriendIds.length > 0 && (
          <div className="bg-muted/30 p-3 rounded-lg text-sm text-muted-foreground text-center">
            {invitedFriendIds.length} friend{invitedFriendIds.length !== 1 ? 's' : ''} already invited
          </div>
        )}

        {/* Send Button */}
        {selectedFriends.size > 0 && (
          <div className="fixed bottom-4 left-0 right-0 px-4 z-10">
            <Button
              className="w-full gradient-primary text-white shadow-lg"
              size="lg"
              onClick={handleSendInvites}
              disabled={sendInvitations.isPending}
            >
              {sendInvitations.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <UserPlus className="w-4 h-4 mr-2" />
                  Send {selectedFriends.size} Invitation{selectedFriends.size !== 1 ? 's' : ''}
                </>
              )}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default EventInvite;
