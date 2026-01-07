import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface Story {
  id: string;
  content: string | null;
  created_at: string;
  author_id: string;
  media_url?: string | null;
  media_type?: 'image' | 'video' | string | null;
  view_count?: number;
}

export interface StoryUser {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  stories: Story[];
  is_premium?: boolean;
}

const STORY_EXPIRY_HOURS = 24;
const STALE_TIME = 60 * 1000; // 1 minute for stories

/**
 * Optimized hook for fetching stories with premium status
 */
export function useStories(currentUserId: string | undefined) {
  const queryClient = useQueryClient();

  const storiesQuery = useQuery({
    queryKey: ['stories', currentUserId],
    queryFn: async (): Promise<StoryUser[]> => {
      if (!currentUserId) return [];

      const yesterday = new Date();
      yesterday.setHours(yesterday.getHours() - STORY_EXPIRY_HOURS);

      // Fetch stories
      const { data: storyData, error: storyError } = await supabase
        .from('stories')
        .select('*')
        .gte('created_at', yesterday.toISOString())
        .order('created_at', { ascending: false });

      if (storyError) throw storyError;
      if (!storyData?.length) return [];

      // Get unique author IDs
      const authorIds = Array.from(new Set(storyData.map(s => s.author_id).filter(Boolean))) as string[];

      // Batch fetch profiles and premium status
      const [profiles, premiumFeatures, subscriptions] = await Promise.all([
        supabase
          .from('profiles')
          .select('user_id, display_name, avatar_url')
          .in('user_id', authorIds),
        supabase
          .from('premium_features')
          .select('user_id')
          .in('user_id', authorIds)
          .eq('is_active', true)
          .gt('expires_at', new Date().toISOString()),
        supabase
          .from('subscriptions')
          .select('user_id')
          .in('user_id', authorIds)
          .eq('status', 'active')
      ]);

      const profileMap = new Map(profiles.data?.map(p => [p.user_id, p]) || []);
      const premiumUserIds = new Set<string>([
        ...(premiumFeatures.data?.map(p => p.user_id) || []),
        ...(subscriptions.data?.map(s => s.user_id) || [])
      ]);

      // Group stories by user
      const storyMap = new Map<string, StoryUser>();

      storyData.forEach((story: any) => {
        if (!story.author_id) return;
        
        const profile = profileMap.get(story.author_id);
        if (!profile) return;

        if (!storyMap.has(profile.user_id)) {
          storyMap.set(profile.user_id, {
            user_id: profile.user_id,
            display_name: profile.display_name,
            avatar_url: profile.avatar_url,
            stories: [],
            is_premium: premiumUserIds.has(profile.user_id)
          });
        }

        storyMap.get(profile.user_id)!.stories.push(story);
      });

      return Array.from(storyMap.values());
    },
    enabled: !!currentUserId,
    staleTime: STALE_TIME,
  });

  // Upload story mutation
  const uploadStoryMutation = useMutation({
    mutationFn: async ({ file, caption }: { file: File; caption?: string }) => {
      if (!currentUserId) throw new Error('Not authenticated');

      const ext = file.name.split('.').pop();
      const path = `${currentUserId}/${Date.now()}.${ext}`;

      // Upload file
      const { error: uploadError } = await supabase.storage
        .from('stories')
        .upload(path, file);

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('stories')
        .getPublicUrl(path);

      // Create story record
      const { error: insertError } = await supabase
        .from('stories')
        .insert({
          author_id: currentUserId,
          content: caption || null,
          media_url: publicUrl,
          media_type: file.type.startsWith('video') ? 'video' : 'image'
        });

      if (insertError) throw insertError;
    },
    onSuccess: () => {
      toast.success('Story posted! 📸');
      queryClient.invalidateQueries({ queryKey: ['stories'] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to upload story');
    },
  });

  // Delete story mutation
  const deleteStoryMutation = useMutation({
    mutationFn: async ({ storyId, mediaUrl }: { storyId: string; mediaUrl?: string | null }) => {
      if (!currentUserId) throw new Error('Not authenticated');

      // Delete from database
      const { error: dbError } = await supabase
        .from('stories')
        .delete()
        .eq('id', storyId)
        .eq('author_id', currentUserId);

      if (dbError) throw dbError;

      // Delete media from storage
      if (mediaUrl) {
        const path = mediaUrl.split('/').slice(-3).join('/');
        await supabase.storage.from('stories').remove([path]);
      }
    },
    onSuccess: () => {
      toast.success('Story deleted');
      queryClient.invalidateQueries({ queryKey: ['stories'] });
    },
    onError: () => {
      toast.error('Failed to delete story');
    },
  });

  return {
    storyUsers: storiesQuery.data || [],
    isLoading: storiesQuery.isPending,
    error: storiesQuery.error,
    uploadStory: uploadStoryMutation.mutate,
    deleteStory: deleteStoryMutation.mutate,
    isUploading: uploadStoryMutation.isPending,
    isDeleting: deleteStoryMutation.isPending,
  };
}
