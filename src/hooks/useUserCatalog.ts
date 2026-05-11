/**
 * useUserCatalog
 *
 * Single source of truth for a business user's store + items.
 * Used by:
 *   - Profile.tsx  → Catalog tab (owner view: edit / delete)
 *   - Map.tsx      → Services view (discovery view: contact / directions)
 *
 * Query key shape: ['user-catalog', ownerId]
 * Invalidate with:  queryClient.invalidateQueries({ queryKey: ['user-catalog', userId] })
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { Store, StoreItem } from '@/types/marketplace';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface CatalogItem extends StoreItem {
  store: Store;
}

export interface UserCatalog {
  store: Store | null;
  items: CatalogItem[];
}

// ── Hook ───────────────────────────────────────────────────────────────────────

export function useUserCatalog(ownerId: string | null | undefined) {
  const queryClient = useQueryClient();

  // ── Fetch store owned by this user ─────────────────────────────────────────
  const {
    data: store = null,
    isLoading: storeLoading,
  } = useQuery<Store | null>({
    queryKey: ['user-catalog-store', ownerId],
    queryFn: async () => {
      if (!ownerId) return null;
      const { data, error } = await (supabase.from('stores') as any)
        .select('*')
        .eq('owner_id', ownerId)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as Store | null;
    },
    enabled: !!ownerId,
    staleTime: 60_000,
  });

  // ── Fetch items scoped to this store ───────────────────────────────────────
  const {
    data: items = [],
    isLoading: itemsLoading,
  } = useQuery<CatalogItem[]>({
    queryKey: ['user-catalog', ownerId],
    queryFn: async () => {
      if (!ownerId || !store?.id) return [];
      const { data, error } = await (supabase.from('store_items') as any)
        .select(`*, store:stores!store_id(*)`)
        .eq('store_id', store.id)       // ← scoped to owner's store
        .eq('is_available', true)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as CatalogItem[];
    },
    enabled: !!ownerId && !!store?.id,
    staleTime: 60_000,
  });

  // ── Delete item mutation ───────────────────────────────────────────────────
  const deleteItemMutation = useMutation({
    mutationFn: async (itemId: string) => {
      const { error } = await (supabase.from('store_items') as any)
        .delete()
        .eq('id', itemId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Item removed');
      queryClient.invalidateQueries({ queryKey: ['user-catalog', ownerId] });
      queryClient.invalidateQueries({ queryKey: ['marketplace_items'] });
    },
    onError: (err: any) => toast.error(err.message || 'Failed to delete item'),
  });

  // ── Toggle item availability ───────────────────────────────────────────────
  const toggleAvailabilityMutation = useMutation({
    mutationFn: async ({ itemId, available }: { itemId: string; available: boolean }) => {
      const { error } = await (supabase.from('store_items') as any)
        .update({ is_available: available })
        .eq('id', itemId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-catalog', ownerId] });
      queryClient.invalidateQueries({ queryKey: ['marketplace_items'] });
    },
    onError: (err: any) => toast.error(err.message || 'Failed to update availability'),
  });

  return {
    store,
    items,
    isLoading: storeLoading || (!!store?.id && itemsLoading),
    hasStore: !!store,
    deleteItem: deleteItemMutation.mutate,
    toggleAvailability: toggleAvailabilityMutation.mutate,
    isDeletingItem: deleteItemMutation.isPending,
  };
}
