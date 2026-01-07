import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Tables } from '@/integrations/supabase/types';

type Profile = Pick<Tables<'profiles'>, 'display_name' | 'avatar_url' | 'user_id'>;

export interface Post {
  id: string;
  user_id: string;
  content: string | null;
  image_url?: string | null;
  post_type: string | null;
  likes_count: number | null;
  comments_count: number | null;
  location?: string | null;
  created_at: string | null;
  profiles: Profile;
  is_liked_by_user?: boolean;
  is_premium?: boolean;
}

const POST_LIMIT = 30;
const STALE_TIME = 2 * 60 * 1000; // 2 minutes

/**
 * Optimized hook for fetching posts with premium status
 */
export function useFeedPosts(currentUserId: string | undefined) {
  const queryClient = useQueryClient();

  const postsQuery = useQuery({
    queryKey: ['feed-posts', currentUserId],
    queryFn: async (): Promise<Post[]> => {
      if (!currentUserId) return [];

      const { data: posts, error } = await supabase
        .from('social_posts')
        .select(`
          *,
          profiles!social_posts_user_id_fkey(display_name, avatar_url, user_id),
          post_likes(user_id)
        `)
        .order('created_at', { ascending: false })
        .limit(POST_LIMIT);

      if (error) throw error;
      if (!posts) return [];

      // Extract unique user IDs
      const userIds = Array.from(new Set(posts.map(p => p.user_id).filter(Boolean))) as string[];

      // Batch fetch premium status
      const [premiumFeatures, subscriptions] = await Promise.all([
        supabase
          .from('premium_features')
          .select('user_id')
          .in('user_id', userIds)
          .eq('is_active', true)
          .gt('expires_at', new Date().toISOString()),
        supabase
          .from('subscriptions')
          .select('user_id')
          .in('user_id', userIds)
          .eq('status', 'active')
      ]);

      const premiumUserIds = new Set<string>([
        ...(premiumFeatures.data?.map(p => p.user_id) || []),
        ...(subscriptions.data?.map(s => s.user_id) || [])
      ]);

      // Map posts with premium status and like status
      return posts.map((p: any) => ({
        ...p,
        profiles: p.profiles || { display_name: null, avatar_url: null, user_id: p.user_id },
        is_liked_by_user: p.post_likes?.some((l: any) => l.user_id === currentUserId) || false,
        is_premium: premiumUserIds.has(p.user_id)
      }));
    },
    enabled: !!currentUserId,
    staleTime: STALE_TIME,
  });

  // Like post mutation
  const likePostMutation = useMutation({
    mutationFn: async ({ postId, isLiked }: { postId: string; isLiked: boolean }) => {
      if (isLiked) {
        await supabase.from('post_likes').delete().match({ post_id: postId, user_id: currentUserId });
        await supabase.rpc('decrement_post_likes', { post_id: postId });
      } else {
        await supabase.from('post_likes').insert({ post_id: postId, user_id: currentUserId });
        await supabase.rpc('increment_post_likes', { post_id: postId });
      }
    },
    onMutate: async ({ postId, isLiked }) => {
      // Optimistic update
      await queryClient.cancelQueries({ queryKey: ['feed-posts'] });
      
      const previousPosts = queryClient.getQueryData<Post[]>(['feed-posts', currentUserId]);
      
      queryClient.setQueryData<Post[]>(['feed-posts', currentUserId], (old) =>
        old?.map(p => p.id === postId ? {
          ...p,
          likes_count: (p.likes_count || 0) + (isLiked ? -1 : 1),
          is_liked_by_user: !isLiked
        } : p)
      );

      return { previousPosts };
    },
    onError: (err, variables, context) => {
      // Rollback on error
      if (context?.previousPosts) {
        queryClient.setQueryData(['feed-posts', currentUserId], context.previousPosts);
      }
      toast.error('Failed to update like');
    },
  });

  // Delete post mutation
  const deletePostMutation = useMutation({
    mutationFn: async (postId: string) => {
      const { error } = await supabase
        .from('social_posts')
        .delete()
        .eq('id', postId)
        .eq('user_id', currentUserId);
      if (error) throw error;
    },
    onSuccess: (_, postId) => {
      queryClient.setQueryData<Post[]>(['feed-posts', currentUserId], (old) =>
        old?.filter(p => p.id !== postId)
      );
      toast.success('Post deleted');
    },
    onError: () => toast.error('Failed to delete post'),
  });

  return {
    posts: postsQuery.data || [],
    isLoading: postsQuery.isPending,
    error: postsQuery.error,
    likePost: likePostMutation.mutate,
    deletePost: deletePostMutation.mutate,
    refetch: postsQuery.refetch,
  };
}
