import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Search, Store as StoreIcon, Tag, Loader2, Plus, Edit, Trash2, Eye, EyeOff, MapPin } from 'lucide-react';
import { StoreItem, Store, DELIVERY_MODES } from '@/types/marketplace';
import StoreFormDialog from '@/components/StoreFormDialog';
import ItemFormDialog from '@/components/ItemFormDialog';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { useGeolocation } from '@/contexts/LocationContext';

export default function Marketplace() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [catalogSearch, setCatalogSearch] = useState('');
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [userType, setUserType] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<any | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      const uid = data.user?.id || null;
      setCurrentUserId(uid);
      if (uid) {
        const { data: profile } = await (supabase.from('profiles') as any)
          .select('user_type').eq('user_id', uid).maybeSingle();
        setUserType(profile?.user_type || null);
      }
    });
  }, []); 
  
  const { location, requestLocation } = useGeolocation();
  
  useEffect(() => {
    if (!location) {
      requestLocation();
    }
  }, [location]);

  // ── Catalog: owner's store + items ────────────────────────────────────────
  const { data: userStore = null, isLoading: storeLoading } = useQuery({
    queryKey: ['user-catalog-store', currentUserId],
    queryFn: async () => {
      if (!currentUserId) return null;
      const { data, error } = await (supabase.from('stores') as any)
        .select('*').eq('owner_id', currentUserId).eq('is_active', true)
        .order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!currentUserId && userType === 'business',
    staleTime: 60000,
  });

  const { data: catalogItems = [], isLoading: itemsLoading } = useQuery({
    queryKey: ['user-catalog', currentUserId],
    queryFn: async () => {
      if (!currentUserId || !(userStore as any)?.id) return [];
      const { data, error } = await (supabase.from('store_items') as any)
        .select('*, store:stores!store_id(*)')
        .eq('store_id', (userStore as any).id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!currentUserId && !!(userStore as any)?.id,
    staleTime: 60_000,
  });

  const hasStore = !!(userStore as any)?.id;
    const catalogLoading = storeLoading || (hasStore && itemsLoading); 
    
  const deleteStoreMutation = useMutation({
    mutationFn: async () => {
      if (!(userStore as any)?.id) {
        throw new Error('Store not found');
      }
  
      const { error } = await (supabase.from('stores') as any)
        .delete()
        .eq('id', (userStore as any).id);
  
      if (error) throw error;
    },
  
    onSuccess: () => {
      toast.success('Store deleted');
  
      queryClient.invalidateQueries({
        queryKey: ['user-catalog-store', currentUserId]
      });
  
      queryClient.invalidateQueries({
        queryKey: ['marketplace_items']
      });
    },
  
    onError: (err: any) => {
      toast.error(err.message);
    }
  });

  const deleteItemMutation = useMutation({
    mutationFn: async (itemId: string) => {
      const { error } = await (supabase.from('store_items') as any).delete().eq('id', itemId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Item removed');
      queryClient.invalidateQueries({ queryKey: ['user-catalog', currentUserId] });
      queryClient.invalidateQueries({ queryKey: ['marketplace_items'] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const toggleAvailabilityMutation = useMutation({
    mutationFn: async ({ itemId, available }: { itemId: string; available: boolean }) => {
      const { error } = await (supabase.from('store_items') as any)
        .update({ is_available: available }).eq('id', itemId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-catalog', currentUserId] });
      queryClient.invalidateQueries({ queryKey: ['marketplace_items'] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  // ── Helpers ───────────────────────────────────────────────────────────────
  const discounted = (price: number, pct: number) => price - price * pct / 100;
  const formatPrice = (price: number) =>
    new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', minimumFractionDigits: 0 }).format(price);


  return (
    <div className="container-mobile py-4 space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold">My Catalog</h1>
          <p className="text-sm text-muted-foreground">
            Manage your listings — what you publish here appears on the map
          </p>
        </div>
        {userType === 'business' && hasStore && (
          <ItemFormDialog onSuccess={() => {}} trigger={
            <Button size="sm" className="gradient-primary text-white shadow-sm">
              <Plus className="w-4 h-4 mr-1" /> Add Item
            </Button>
          } />
        )}
      </div>

      {/* No-store gate */}
      {!catalogLoading && !hasStore && (
        <div className="text-center py-20 bg-muted/20 rounded-3xl border-2 border-dashed border-muted">
          <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <StoreIcon className="w-8 h-8 text-primary/60" />
          </div>
          <h3 className="font-semibold text-lg">Set up your store first</h3>
          <p className="text-sm text-muted-foreground mt-1 mb-6 max-w-xs mx-auto">
            Create a store to start listing your products and services. You'll appear as a discoverable pin on the map.
          </p>
          <StoreFormDialog trigger={
            <Button className="gradient-primary text-white shadow-lg">
              <Plus className="w-4 h-4 mr-2" /> Create Store
            </Button>
          } />
        </div>
      )}

      {/* Store exists */}
      {!catalogLoading && hasStore && (
        <>
          {/* Store identity strip */}
          <div className="flex items-center justify-between p-3 bg-muted/40 rounded-2xl border border-border/40">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center overflow-hidden shrink-0">
                {(userStore as any)?.logo_url
                  ? <img src={(userStore as any).logo_url} alt="logo" className="w-full h-full object-cover" />
                  : <StoreIcon className="w-5 h-5 text-primary" />}
              </div>
              <div>
                <p className="font-semibold text-sm">{(userStore as any)?.name}</p>
                <p className="text-[10px] text-muted-foreground">{(userStore as any)?.category}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <StoreFormDialog editingStore={userStore as any} trigger={
                <Button variant="outline" size="sm" className="h-8 text-xs">Edit Store</Button>
              } />
              <Button size="sm" variant="outline" className="h-8 text-xs"
                onClick={() => navigate('/app/map?view=marketplace')}>
                <MapPin className="w-3.5 h-3.5 mr-1" /> View on Map
              </Button>
              <Button
                variant="destructive"
                size="sm" className="h-8 text-xs"
                onClick={() => deleteStoreMutation.mutate()}
              >
                Delete Store
              </Button>
            </div>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search your listings..."
              value={catalogSearch}
              onChange={(e) => setCatalogSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Items */}
          {catalogLoading ? (
            <div className="grid grid-cols-2 gap-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="aspect-[3/4] rounded-2xl bg-muted/40 animate-pulse" />
              ))}
            </div>
          ) : catalogItems.length === 0 ? (
            <div className="text-center py-16 bg-muted/20 rounded-2xl border-2 border-dashed border-muted">
              <Tag className="w-10 h-10 mx-auto text-muted-foreground/40 mb-3" />
              <p className="font-medium">No listings yet</p>
              <p className="text-sm text-muted-foreground mt-1 mb-4">
                Add your first product or service to get discovered.
              </p>
              <ItemFormDialog onSuccess={() => {}} trigger={
                <Button size="sm" className="gradient-primary text-white">
                  <Plus className="w-4 h-4 mr-1" /> Add Your First Item
                </Button>
              } />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {(catalogItems as any[])
                .filter((item) =>
                  !catalogSearch || item.name.toLowerCase().includes(catalogSearch.toLowerCase())
                )
                .map((item) => (
                  <Card key={item.id} className="overflow-hidden border border-border/50 shadow-sm">
                    <div className="relative aspect-[4/3] bg-muted">
                      {item.image_url
                        ? <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                        : <div className="w-full h-full flex items-center justify-center">
                            <Tag className="w-8 h-8 text-muted-foreground/40" />
                          </div>}
                      {item.discount_percent > 0 && (
                        <Badge className="absolute top-2 left-2 bg-red-500 text-white border-0 text-[10px]">
                          -{item.discount_percent}%
                        </Badge>
                      )}
                      <button
                        onClick={() => toggleAvailabilityMutation.mutate({ itemId: item.id, available: !item.is_available })}
                        className={`absolute top-2 right-2 flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                          item.is_available
                            ? 'bg-green-500/90 text-white border-green-600'
                            : 'bg-muted/90 text-muted-foreground border-border'
                        }`}
                      >
                        {item.is_available
                          ? <><Eye className="w-2.5 h-2.5" /> Live</>
                          : <><EyeOff className="w-2.5 h-2.5" /> Hidden</>}
                      </button>
                    </div>
                    <CardContent className="p-3 space-y-1.5">
                      <h3 className="font-semibold text-sm line-clamp-2 leading-tight">{item.name}</h3>
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-primary font-bold text-sm">
                          {formatPrice(discounted(item.price, item.discount_percent))}
                        </span>
                        {item.discount_percent > 0 && (
                          <span className="text-[11px] text-muted-foreground line-through">
                            {formatPrice(item.price)}
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-muted-foreground">
                        {DELIVERY_MODES[item.delivery_mode]} · Max {item.max_delivery_days}d
                      </p>
                      <div className="flex gap-2 pt-1">
                        <Button size="sm" variant="outline" className="flex-1 h-8 text-xs"
                          onClick={() => setEditingItem(item)}>
                          <Edit className="w-3 h-3 mr-1" /> Edit
                        </Button>
                        <Button size="sm" variant="ghost"
                          className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10"
                          onClick={() => deleteItemMutation.mutate(item.id)}
                          disabled={deleteItemMutation.isPending}>
                          {deleteItemMutation.isPending
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : <Trash2 className="w-3.5 h-3.5" />}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
            </div>
          )}
        </>
      )}

      {/* Loading skeleton */}
      {catalogLoading && (
        <div className="grid grid-cols-2 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="aspect-[3/4] rounded-2xl bg-muted/40 animate-pulse" />
          ))}
        </div>
      )}

      {/* Edit item dialog */}
      {editingItem && (
        <ItemFormDialog
          editingItem={editingItem}
          onSuccess={() => setEditingItem(null)}
          trigger={<span className="hidden" />}
        />
      )}
    </div>
  );
}
