import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface ProfileLink {
  id: string;
  user_id: string;
  title: string;
  url: string;
  icon?: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export function useProfileLinks(userId: string | undefined) {
  const queryClient = useQueryClient();

  const linksQuery = useQuery({
    queryKey: ['profile-links', userId],
    queryFn: async (): Promise<ProfileLink[]> => {
      if (!userId) return [];
      
      const { data, error } = await supabase
        .from('profile_links')
        .select('*')
        .eq('user_id', userId)
        .order('sort_order', { ascending: true });

      if (error) throw error;
      return data || [];
    },
    enabled: !!userId,
  });

  const addLinkMutation = useMutation({
    mutationFn: async ({ title, url, icon }: { title: string; url: string; icon?: string }) => {
      if (!userId) throw new Error('User not authenticated');
      
      // Get max sort order
      const { data: existing } = await supabase
        .from('profile_links')
        .select('sort_order')
        .eq('user_id', userId)
        .order('sort_order', { ascending: false })
        .limit(1)
        .maybeSingle();

      const sortOrder = (existing?.sort_order || 0) + 1;

      const { data, error } = await supabase
        .from('profile_links')
        .insert({
          user_id: userId,
          title: title.trim(),
          url: url.startsWith('http') ? url : `https://${url}`,
          icon,
          sort_order: sortOrder
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success('Link added');
      queryClient.invalidateQueries({ queryKey: ['profile-links', userId] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to add link');
    }
  });

  const updateLinkMutation = useMutation({
    mutationFn: async ({ id, title, url }: { id: string; title: string; url: string }) => {
      const { error } = await supabase
        .from('profile_links')
        .update({
          title: title.trim(),
          url: url.startsWith('http') ? url : `https://${url}`,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .eq('user_id', userId);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Link updated');
      queryClient.invalidateQueries({ queryKey: ['profile-links', userId] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update link');
    }
  });

  const deleteLinkMutation = useMutation({
    mutationFn: async (linkId: string) => {
      const { error } = await supabase
        .from('profile_links')
        .delete()
        .eq('id', linkId)
        .eq('user_id', userId);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Link removed');
      queryClient.invalidateQueries({ queryKey: ['profile-links', userId] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to remove link');
    }
  });

  const reorderLinksMutation = useMutation({
    mutationFn: async (links: { id: string; sort_order: number }[]) => {
      const updates = links.map(({ id, sort_order }) =>
        supabase
          .from('profile_links')
          .update({ sort_order })
          .eq('id', id)
          .eq('user_id', userId)
      );

      await Promise.all(updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile-links', userId] });
    }
  });

  return {
    links: linksQuery.data || [],
    isLoading: linksQuery.isPending,
    addLink: addLinkMutation.mutate,
    updateLink: updateLinkMutation.mutate,
    deleteLink: deleteLinkMutation.mutate,
    reorderLinks: reorderLinksMutation.mutate,
    isAdding: addLinkMutation.isPending,
    isDeleting: deleteLinkMutation.isPending,
  };
}
