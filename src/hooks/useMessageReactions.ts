import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface Reaction {
  emoji: string;
  count: number;
  users: string[];
  hasReacted: boolean;
}

export interface MessageReactions {
  [messageId: string]: Reaction[];
}

export function useMessageReactions(
  messageIds: string[],
  userId: string | undefined,
  isComm: boolean = false
) {
  const queryClient = useQueryClient();
  const tableName = isComm ? 'community_message_reactions' : 'message_reactions';

  const reactionsQuery = useQuery({
    queryKey: ['messageReactions', isComm, messageIds.join(',')],
    queryFn: async (): Promise<MessageReactions> => {
      if (!messageIds.length) return {};

      const { data, error } = await supabase
        .from(tableName)
        .select('id, message_id, user_id, emoji')
        .in('message_id', messageIds);

      if (error) throw error;

      const reactions: MessageReactions = {};
      
      messageIds.forEach(id => {
        reactions[id] = [];
      });

      (data || []).forEach(r => {
        if (!reactions[r.message_id]) {
          reactions[r.message_id] = [];
        }
        
        const existing = reactions[r.message_id].find(e => e.emoji === r.emoji);
        if (existing) {
          existing.count++;
          existing.users.push(r.user_id);
          if (r.user_id === userId) {
            existing.hasReacted = true;
          }
        } else {
          reactions[r.message_id].push({
            emoji: r.emoji,
            count: 1,
            users: [r.user_id],
            hasReacted: r.user_id === userId
          });
        }
      });

      return reactions;
    },
    enabled: messageIds.length > 0 && !!userId,
    staleTime: 10000,
  });

  // Real-time subscription
  useEffect(() => {
    if (!messageIds.length || !userId) return;

    const channel = supabase
      .channel(`reactions-${isComm ? 'comm' : 'dm'}-${messageIds.slice(0, 3).join('-')}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: tableName,
        },
        () => {
          queryClient.invalidateQueries({ 
            queryKey: ['messageReactions', isComm, messageIds.join(',')] 
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [messageIds, userId, isComm, queryClient, tableName]);

  const addReaction = useMutation({
    mutationFn: async ({ messageId, emoji }: { messageId: string; emoji: string }) => {
      if (!userId) throw new Error("Not authenticated");

      const { error } = await supabase
        .from(tableName)
        .insert({ message_id: messageId, user_id: userId, emoji });

      if (error) {
        if (error.code === '23505') {
          // Unique violation - reaction already exists, remove it instead
          await supabase
            .from(tableName)
            .delete()
            .eq('message_id', messageId)
            .eq('user_id', userId)
            .eq('emoji', emoji);
        } else {
          throw error;
        }
      }
    },
    onMutate: async ({ messageId, emoji }) => {
      await queryClient.cancelQueries({ 
        queryKey: ['messageReactions', isComm, messageIds.join(',')] 
      });

      const previousReactions = queryClient.getQueryData<MessageReactions>(
        ['messageReactions', isComm, messageIds.join(',')]
      );

      queryClient.setQueryData<MessageReactions>(
        ['messageReactions', isComm, messageIds.join(',')],
        (old) => {
          if (!old) return old;
          const newReactions = { ...old };
          const msgReactions = [...(newReactions[messageId] || [])];
          
          const existingIdx = msgReactions.findIndex(r => r.emoji === emoji);
          if (existingIdx >= 0) {
            const existing = msgReactions[existingIdx];
            if (existing.hasReacted) {
              if (existing.count === 1) {
                msgReactions.splice(existingIdx, 1);
              } else {
                msgReactions[existingIdx] = {
                  ...existing,
                  count: existing.count - 1,
                  hasReacted: false,
                  users: existing.users.filter(u => u !== userId)
                };
              }
            } else {
              msgReactions[existingIdx] = {
                ...existing,
                count: existing.count + 1,
                hasReacted: true,
                users: [...existing.users, userId!]
              };
            }
          } else {
            msgReactions.push({
              emoji,
              count: 1,
              users: [userId!],
              hasReacted: true
            });
          }
          
          newReactions[messageId] = msgReactions;
          return newReactions;
        }
      );

      return { previousReactions };
    },
    onError: (_, __, context) => {
      if (context?.previousReactions) {
        queryClient.setQueryData(
          ['messageReactions', isComm, messageIds.join(',')],
          context.previousReactions
        );
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ 
        queryKey: ['messageReactions', isComm, messageIds.join(',')] 
      });
    },
  });

  return {
    reactions: reactionsQuery.data || {},
    isLoading: reactionsQuery.isPending,
    addReaction: addReaction.mutate,
    isAddingReaction: addReaction.isPending,
  };
}
