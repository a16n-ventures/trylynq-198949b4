import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Search,
  UserPlus,
  Check,
  Loader2,
  Share2,
  Copy,
  Users
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

type Profile = {
  user_id: string;
  display_name?: string | null;
  avatar_url?: string | null;
};

type Friendship = {
  id: string;
  requester_id: string;
  addressee_id: string;
  requester: Profile;
  addressee: Profile;
};

type Event = {
  id: string;
  title: string;
  description: string;
  start_date: string;
  location: string;
  image_url?: string;
};

const EventInvitePage = () => {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  const [search, setSearch] = useState('');
  const [selectedFriends, setSelectedFriends] = useState<Set<string>>(new Set());
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [copied, setCopied] = useState(false);

  // Fetch event details
  const { data: event, isPending: loadingEvent } = useQuery<Event>({
    queryKey: ['event', eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('events')
        .select('id, title, description, start_date, location, image_url')
        .eq('id', eventId)
        .single();
      
      if (error) throw error;
      return data;
    },
    enabled: !!eventId,
  });

  // Fetch friends
  const { data: friendships = [], isPending: loadingFriends } = useQuery<Friendship[]>({
    queryKey: ['friends', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from('friendships')
        .select(`
          id, requester_id, addressee_id,
          requester:profiles!requester_id(user_id, display_name, avatar_url),
          addressee:profiles!addressee_id(user_id, display_name, avatar_url)
        `)
        .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)
        .eq('status', 'accepted');
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id,
  });

  // Fetch already invited friends
  const { data: invitedFriendIds = [], isPending: loadingInvited } = useQuery<string[]>({
    queryKey: ['event-invites', eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('event_invitations')
        .select('invitee_id')
        .eq('event_id', eventId);
      
      if (error) throw error;
      return data.map(inv => inv.invitee_id);
    },
    enabled: !!eventId,
  });

  // Send invitations mutation
  const sendInvitations = useMutation({
    mutationFn: async (friendIds: string[]) => {
      if (!user?.id || !eventId) throw new Error('Missing user or event');

      const invitations = friendIds.map(friendId => ({
        event_id: eventId,
        inviter_id: user.id,
        invitee_id: friendId,
        status: 'pending'
      }));

      const { error } = await supabase
        .from('event_invitations')
        .insert(invitations);

      if (error) throw error;

      // Note: Notifications table not yet implemented
      // TODO: Add notifications when table is created
    },
    onSuccess: () => {
      toast.success('Invitations sent successfully!');
      queryClient.invalidateQueries({ queryKey: ['event-invites', eventId] });
      setSelectedFriends(new Set());
    },
    onError: (error: any) => {
      toast.error('Failed to send invitations: ' + error.message);
    }
  });

  // Get friends list
  const friends = useMemo(() => {
    return friendships.map(f => 
      f.requester_id === user?.id ? f.addressee : f.requester
    );
  }, [friendships, user?.id]);

  // Filter friends
  const filteredFriends = useMemo(() => {
    let result = friends.filter(f => !invitedFriendIds.includes(f.user_id));
    
    if (search) {
      result = result.filter(f =>
        f.display_name?.toLowerCase().includes(search.toLowerCase())
      );
    }
    
    return result;
  }, [friends, invitedFriendIds, search]);

  const toggleFriend = (friendId: string) => {
    setSelectedFriends(prev => {
      const next = new Set(prev);
      if (next.has(friendId)) {
        next.delete(friendId);
      } else {
        next.add(friendId);
      }
      return next;
    });
  };

  const selectAll = () => {
    setSelectedFriends(new Set(filteredFriends.map(f => f.user_id)));
  };

  const deselectAll = () => {
    setSelectedFriends(new Set());
  };

  const handleSendInvites = () => {
    if (selectedFriends.size === 0) {
      toast.error('Please select at least one friend');
      return;
    }
    sendInvitations.mutate(Array.from(selectedFriends));
  };

  const getShareLink = () => {
    return `${window.location.origin}/events/${eventId}`;
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

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <div className="gradient-primary text-white">
        <div className="container-mobile py-4">
          <div className="flex items-center gap-3 mb-4">
            <Button
              variant="ghost"
              size="sm"
              className="text-white hover:bg-white/20 p-2"
              onClick={() => navigate(`/app/events/${eventId}`)}
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div className="flex-1">
              <h1 className="text-xl font-bold">Invite Friends</h1>
              <p className="text-sm text-white/80 truncate">{event.title}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="container-mobile py-6 space-y-4">
        {/* Share Options */}
        <Card className="gradient-card shadow-card border-0">
          <CardContent className="p-4 space-y-3">
            <h3 className="font-semibold flex items-center gap-2">
              <Share2 className="w-4 h-4" />
              Share Event Link
            </h3>
            <div className="flex gap-2">
              <Input
                value={getShareLink()}
                readOnly
                className="flex-1 bg-background/50"
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

        {/* Friend Selection */}
        <div className="flex items-center justify-between">
          <h3 className="font-semibold flex items-center gap-2">
            <Users className="w-5 h-5" />
            Select Friends ({selectedFriends.size})
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
              disabled={filteredFriends.length === 0}
            >
              Select All
            </Button>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search friends..."
            className="pl-10"
          />
        </div>

        {/* Friends List */}
        {loadingFriends ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
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

export default EventInvitePage;
