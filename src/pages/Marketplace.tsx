import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Search, MapPin, Phone, Truck, Clock, Store as StoreIcon, Tag, Loader2, Plus, Pencil, Edit, Trash2, Eye, EyeOff } from 'lucide-react';
import { StoreItem, Store, STORE_CATEGORIES, DELIVERY_MODES } from '@/types/marketplace';
import StoreFormDialog from '@/components/StoreFormDialog';
import ItemFormDialog from '@/components/ItemFormDialog';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

export default function Marketplace() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [catalogSearch, setCatalogSearch] = useState('');
  const [category, setCategory] = useState<string>('all');
  const [selectedItem, setSelectedItem] = useState<(StoreItem & { store: Store }) | null>(null);
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

  // ── Browse: all available items ───────────────────────────────────────────
  const { data: items = [], isLoading } = useQuery({
    queryKey: ['marketplace_items', search, category],
    queryFn: async () => {
      let query = (supabase.from('store_items') as any)
        .select('*, store:stores!store_id(*)')
        .eq('is_available', true)
        .order('created_at', { ascending: false });
      if (search) query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%`);
      const { data, error } = await query;
      if (error) throw error;
      let filtered = data || [];
      if (category && category !== 'all')
        filtered = filtered.filter((item: any) => item.store?.category === category);
      return filtered as (StoreItem & { store: Store })[];
    }
  });

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
    staleTime: 60_000,
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

  const isOwner = currentUserId && selectedItem?.store?.owner_id === currentUserId;

  return (
    <div className="container-mobile py-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold">Marketplace</h1>
          <p className="text-sm text-muted-foreground">Discover amazing deals near you</p>
        </div>
        {userType === 'business' && (
          <div className="flex gap-2">
            <StoreFormDialog trigger={
              <Button size="sm" variant="outline"><Plus className="w-4 h-4 mr-1" /> Store</Button>
            } />
            <ItemFormDialog trigger={
              <Button size="sm"><Plus className="w-4 h-4 mr-1" /> Item</Button>
            } />
          </div>
        )}
      </div>

      <Tabs defaultValue="browse">
        <TabsList className="w-full bg-muted/40 rounded-xl">
          <TabsTrigger value="browse" className="flex-1 rounded-lg">Browse</TabsTrigger>
          {userType === 'business' && (
            <TabsTrigger value="catalog" className="flex-1 rounded-lg">My Catalog</TabsTrigger>
          )}
        </TabsList>

        {/* ── BROWSE TAB ─────────────────────────────────────────────────── */}
        <TabsContent value="browse" className="mt-4 space-y-4">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search items..." value={search}
                onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="w-32"><SelectValue placeholder="Category" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {STORE_CATEGORIES.map((cat) => <SelectItem key={cat} value={cat}>{cat}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-12">
              <StoreIcon className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground">No items found</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {items.map((item) => (
                <Card key={item.id} className="overflow-hidden cursor-pointer hover:shadow-lg transition-shadow"
                  onClick={() => setSelectedItem(item)}>
                  <div className="relative aspect-square bg-muted">
                    {item.image_url
                      ? <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                      : <div className="w-full h-full flex items-center justify-center"><Tag className="w-8 h-8 text-muted-foreground" /></div>}
                    {item.discount_percent > 0 && (
                      <Badge className="absolute top-2 right-2 bg-red-500">-{item.discount_percent}%</Badge>
                    )}
                  </div>
                  <CardContent className="p-3 space-y-1">
                    <p className="text-[10px] text-muted-foreground truncate">{item.store?.name || 'Unknown Store'}</p>
                    <h3 className="font-medium text-sm line-clamp-2 leading-tight">{item.name}</h3>
                    <div className="flex items-baseline gap-1">
                      <span className="text-primary font-bold">{formatPrice(discounted(item.price, item.discount_percent))}</span>
                      {item.discount_percent > 0 && (
                        <span className="text-xs text-muted-foreground line-through">{formatPrice(item.price)}</span>
                      )}
                    </div>
                    <Badge variant="outline" className="text-[9px] py-0">{DELIVERY_MODES[item.delivery_mode]}</Badge>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── MY CATALOG TAB (business only) ─────────────────────────────── */}
        {userType === 'business' && (
          <TabsContent value="catalog" className="mt-4 space-y-4">
            {/* No store gate */}
            {!catalogLoading && !hasStore && (
              <div className="text-center py-16 bg-muted/20 rounded-3xl border-2 border-dashed border-muted">
                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <StoreIcon className="w-8 h-8 text-primary/60" />
                </div>
                <h3 className="font-semibold text-lg">Create your store first</h3>
                <p className="text-sm text-muted-foreground mt-1 mb-6 max-w-xs mx-auto">
                  Set up a store to list your services. You'll appear as a discoverable pin on the map.
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
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center overflow-hidden">
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
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                    } />
                    <Button size="sm" variant="outline" className="h-8 text-xs"
                      onClick={() => navigate('/app/map?view=services')}>
                      View on Map
                    </Button>
                  </div>
                </div>

                {/* Search + Add */}
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <Input placeholder="Search your items..." value={catalogSearch}
                      onChange={(e) => setCatalogSearch(e.target.value)} className="pl-9" />
                  </div>
                  <ItemFormDialog onSuccess={() => {}} trigger={
                    <Button size="sm" className="gradient-primary text-white shadow-sm">
                      <Plus className="w-4 h-4 mr-1" /> Add Item
                    </Button>
                  } />
                </div>

                {/* Items grid */}
                {catalogLoading ? (
                  <div className="flex items-center justify-center py-10">
                    <Loader2 className="w-6 h-6 animate-spin text-primary" />
                  </div>
                ) : catalogItems.length === 0 ? (
                  <div className="text-center py-12 bg-muted/20 rounded-2xl border-2 border-dashed border-muted">
                    <Tag className="w-10 h-10 mx-auto text-muted-foreground/40 mb-3" />
                    <p className="font-medium">No items yet</p>
                    <p className="text-sm text-muted-foreground mt-1">Add your first service or product above.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    {(catalogItems as any[])
                      .filter((item) => !catalogSearch || item.name.toLowerCase().includes(catalogSearch.toLowerCase()))
                      .map((item) => (
                        <Card key={item.id} className="overflow-hidden border border-border/50 shadow-sm">
                          <div className="relative aspect-[4/3] bg-muted">
                            {item.image_url
                              ? <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                              : <div className="w-full h-full flex items-center justify-center"><Tag className="w-8 h-8 text-muted-foreground/40" /></div>}
                            {item.discount_percent > 0 && (
                              <Badge className="absolute top-2 left-2 bg-red-500 text-white border-0 text-[10px]">-{item.discount_percent}%</Badge>
                            )}
                            <button
                              onClick={() => toggleAvailabilityMutation.mutate({ itemId: item.id, available: !item.is_available })}
                              className={`absolute top-2 right-2 flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${item.is_available ? 'bg-green-500/90 text-white border-green-600' : 'bg-muted/90 text-muted-foreground border-border'}`}
                            >
                              {item.is_available ? <><Eye className="w-2.5 h-2.5" /> Live</> : <><EyeOff className="w-2.5 h-2.5" /> Hidden</>}
                            </button>
                          </div>
                          <CardContent className="p-3 space-y-1.5">
                            <p className="text-[10px] text-muted-foreground truncate">{item.store?.name}</p>
                            <h3 className="font-semibold text-sm line-clamp-2 leading-tight">{item.name}</h3>
                            <div className="flex items-baseline gap-1.5">
                              <span className="text-primary font-bold text-sm">{formatPrice(discounted(item.price, item.discount_percent))}</span>
                              {item.discount_percent > 0 && (
                                <span className="text-[11px] text-muted-foreground line-through">{formatPrice(item.price)}</span>
                              )}
                            </div>
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

            {catalogLoading && (
              <div className="grid grid-cols-2 gap-3">
                {[1, 2, 3, 4].map((i) => <div key={i} className="aspect-[3/4] rounded-2xl bg-muted/40 animate-pulse" />)}
              </div>
            )}

            {editingItem && (
              <ItemFormDialog editingItem={editingItem} onSuccess={() => setEditingItem(null)}
                trigger={<span className="hidden" />} />
            )}
          </TabsContent>
        )}
      </Tabs>

      {/* Item Detail Modal */}
      <Dialog open={!!selectedItem} onOpenChange={(open) => !open && setSelectedItem(null)}>
        <DialogContent className="sm:max-w-[480px] max-w-[calc(100vw-2rem)] my-auto mx-auto max-h-[85vh] overflow-y-auto">
          {selectedItem && (
            <>
              <DialogHeader>
                <div className="flex items-center justify-between pr-8">
                  <DialogTitle>{selectedItem.name}</DialogTitle>
                  {isOwner && (
                    <ItemFormDialog editingItem={selectedItem} onSuccess={() => setSelectedItem(null)}
                      trigger={<Button variant="outline" size="sm" className="h-8"><Edit className="w-3.5 h-3.5 mr-1.5" /> Edit Item</Button>} />
                  )}
                </div>
              </DialogHeader>
              <div className="space-y-4">
                <div className="aspect-video bg-muted rounded-lg overflow-hidden">
                  {selectedItem.image_url
                    ? <img src={selectedItem.image_url} alt={selectedItem.name} className="w-full h-full object-cover" />
                    : <div className="w-full h-full flex items-center justify-center"><Tag className="w-12 h-12 text-muted-foreground" /></div>}
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-primary">{formatPrice(discounted(selectedItem.price, selectedItem.discount_percent))}</span>
                  {selectedItem.discount_percent > 0 && (
                    <><span className="text-lg text-muted-foreground line-through">{formatPrice(selectedItem.price)}</span>
                    <Badge className="bg-red-500">-{selectedItem.discount_percent}%</Badge></>
                  )}
                </div>
                {selectedItem.description && <p className="text-sm text-muted-foreground">{selectedItem.description}</p>}
                <Card className="bg-muted/50">
                  <CardContent className="p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Avatar className="w-10 h-10">
                          <AvatarImage src={selectedItem.store?.logo_url || undefined} />
                          <AvatarFallback>{selectedItem.store?.name?.[0] || 'S'}</AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium">{selectedItem.store?.name}</p>
                          <p className="text-xs text-muted-foreground">{selectedItem.store?.category}</p>
                        </div>
                      </div>
                      {isOwner && (
                        <StoreFormDialog editingStore={selectedItem.store} onSuccess={() => setSelectedItem(null)}
                          trigger={<Button variant="ghost" size="icon" className="h-7 w-7"><Pencil className="w-3.5 h-3.5" /></Button>} />
                      )}
                    </div>
                    {selectedItem.store?.location && (
                      <div className="flex items-center gap-2 text-sm">
                        <MapPin className="w-4 h-4 text-muted-foreground" /><span>{selectedItem.store.location}</span>
                      </div>
                    )}
                    {selectedItem.store?.contact_phone && (
                      <div className="flex items-center gap-2 text-sm">
                        <Phone className="w-4 h-4 text-muted-foreground" />
                        <a href={`tel:${selectedItem.store.contact_phone}`} className="text-primary underline">{selectedItem.store.contact_phone}</a>
                      </div>
                    )}
                  </CardContent>
                </Card>
                <div className="grid grid-cols-2 gap-3">
                  <Card className="bg-muted/50"><CardContent className="p-3 flex items-center gap-2">
                    <Truck className="w-5 h-5 text-primary" />
                    <div><p className="text-xs text-muted-foreground">Delivery Mode</p><p className="text-sm font-medium">{DELIVERY_MODES[selectedItem.delivery_mode]}</p></div>
                  </CardContent></Card>
                  <Card className="bg-muted/50"><CardContent className="p-3 flex items-center gap-2">
                    <Clock className="w-5 h-5 text-primary" />
                    <div><p className="text-xs text-muted-foreground">Delivery</p><p className="text-sm font-medium">Max {selectedItem.max_delivery_days} days</p></div>
                  </CardContent></Card>
                </div>
                {selectedItem.store?.contact_phone && (
                  <Button className="w-full" asChild>
                    <a href={`tel:${selectedItem.store.contact_phone}`}><Phone className="w-4 h-4 mr-2" />Contact Seller</a>
                  </Button>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Search, MapPin, Phone, Truck, Clock, Store as StoreIcon, Tag, Loader2, Plus, Pencil, Edit } from 'lucide-react';
import { StoreItem, Store, STORE_CATEGORIES, DELIVERY_MODES } from '@/types/marketplace';
import StoreFormDialog from '@/components/StoreFormDialog';
import ItemFormDialog from '@/components/ItemFormDialog';

export default function Marketplace() {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string>('all');
  const [selectedItem, setSelectedItem] = useState<(StoreItem & { store: Store }) | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // Fetch user ID on mount
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setCurrentUserId(data.user?.id || null);
    });
  }, []);

  // Fetch items with store info
  const { data: items = [], isLoading } = useQuery({
    queryKey: ['marketplace_items', search, category],
    queryFn: async () => {
      let query = (supabase.from('store_items') as any)
        .select(`
          *,
          store:stores!store_id(*)
        `)
        .eq('is_available', true)
        .order('created_at', { ascending: false });

      if (search) {
        query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%`);
      }

      const { data, error } = await query;
      if (error) throw error;

      // Filter by category on client if needed
      let filtered = data || [];
      if (category && category !== 'all') {
        filtered = filtered.filter((item: any) => item.store?.category === category);
      }

      return filtered as (StoreItem & { store: Store })[];
    }
  });

  const calculateDiscountedPrice = (price: number, discount: number) => {
    return price - (price * discount / 100);
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
      minimumFractionDigits: 0
    }).format(price);
  };

  // Check if current user is the owner of the selected item's store
  const isOwner = currentUserId && selectedItem?.store?.owner_id === currentUserId;

  return (
    <div className="container-mobile py-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold">Marketplace</h1>
          <p className="text-sm text-muted-foreground">Discover amazing deals near you</p>
        </div>
        <div className="flex gap-2">
          <StoreFormDialog trigger={
            <Button size="sm" variant="outline">
              <Plus className="w-4 h-4 mr-1" /> Store
            </Button>
          } />
          <ItemFormDialog trigger={
            <Button size="sm">
              <Plus className="w-4 h-4 mr-1" /> Item
            </Button>
          } />
        </div>
      </div>

      {/* Search & Filter */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search items..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-32">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            {STORE_CATEGORIES.map((cat) => (
              <SelectItem key={cat} value={cat}>{cat}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Items Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-12">
          <StoreIcon className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">No items found</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {items.map((item) => (
            <Card
              key={item.id}
              className="overflow-hidden cursor-pointer hover:shadow-lg transition-shadow"
              onClick={() => setSelectedItem(item)}
            >
              {/* Image */}
              <div className="relative aspect-square bg-muted">
                {item.image_url ? (
                  <img
                    src={item.image_url}
                    alt={item.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Tag className="w-8 h-8 text-muted-foreground" />
                  </div>
                )}
                {item.discount_percent > 0 && (
                  <Badge className="absolute top-2 right-2 bg-red-500">
                    -{item.discount_percent}%
                  </Badge>
                )}
              </div>

              <CardContent className="p-3 space-y-1">
                {/* Store Name */}
                <p className="text-[10px] text-muted-foreground truncate">
                  {item.store?.name || 'Unknown Store'}
                </p>

                {/* Item Name */}
                <h3 className="font-medium text-sm line-clamp-2 leading-tight">
                  {item.name}
                </h3>

                {/* Price */}
                <div className="flex items-baseline gap-1">
                  <span className="text-primary font-bold">
                    {formatPrice(calculateDiscountedPrice(item.price, item.discount_percent))}
                  </span>
                  {item.discount_percent > 0 && (
                    <span className="text-xs text-muted-foreground line-through">
                      {formatPrice(item.price)}
                    </span>
                  )}
                </div>

                {/* Delivery Mode Badge */}
                <Badge variant="outline" className="text-[9px] py-0">
                  {DELIVERY_MODES[item.delivery_mode]}
                </Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Item Detail Modal */}
      <Dialog open={!!selectedItem} onOpenChange={(open) => !open && setSelectedItem(null)}>
        <DialogContent className="sm:max-w-[480px] max-w-[calc(100vw-2rem)] my-auto mx-auto max-h-[85vh] overflow-y-auto">
          {selectedItem && (
            <>
              <DialogHeader>
                <div className="flex items-center justify-between pr-8">
                  <DialogTitle>{selectedItem.name}</DialogTitle>
                  {isOwner && (
                    <ItemFormDialog
                      editingItem={selectedItem}
                      onSuccess={() => setSelectedItem(null)}
                      trigger={
                        <Button variant="outline" size="sm" className="h-8">
                          <Edit className="w-3.5 h-3.5 mr-1.5" /> Edit Item
                        </Button>
                      }
                    />
                  )}
                </div>
              </DialogHeader>

              <div className="space-y-4">
                {/* Image */}
                <div className="aspect-video bg-muted rounded-lg overflow-hidden">
                  {selectedItem.image_url ? (
                    <img
                      src={selectedItem.image_url}
                      alt={selectedItem.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Tag className="w-12 h-12 text-muted-foreground" />
                    </div>
                  )}
                </div>

                {/* Price Section */}
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-primary">
                    {formatPrice(calculateDiscountedPrice(selectedItem.price, selectedItem.discount_percent))}
                  </span>
                  {selectedItem.discount_percent > 0 && (
                    <>
                      <span className="text-lg text-muted-foreground line-through">
                        {formatPrice(selectedItem.price)}
                      </span>
                      <Badge className="bg-red-500">-{selectedItem.discount_percent}%</Badge>
                    </>
                  )}
                </div>

                {/* Description */}
                {selectedItem.description && (
                  <p className="text-sm text-muted-foreground">{selectedItem.description}</p>
                )}

                {/* Store Info */}
                <Card className="bg-muted/50">
                  <CardContent className="p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Avatar className="w-10 h-10">
                          <AvatarImage src={selectedItem.store?.logo_url || undefined} />
                          <AvatarFallback>
                            {selectedItem.store?.name?.[0] || 'S'}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium">{selectedItem.store?.name}</p>
                          <p className="text-xs text-muted-foreground">{selectedItem.store?.category}</p>
                        </div>
                      </div>
                      {isOwner && (
                        <StoreFormDialog
                          editingStore={selectedItem.store}
                          onSuccess={() => setSelectedItem(null)}
                          trigger={
                            <Button variant="ghost" size="icon" className="h-7 w-7">
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                          }
                        />
                      )}
                    </div>

                    {selectedItem.store?.location && (
                      <div className="flex items-center gap-2 text-sm">
                        <MapPin className="w-4 h-4 text-muted-foreground" />
                        <span>{selectedItem.store.location}</span>
                      </div>
                    )}

                    {selectedItem.store?.contact_phone && (
                      <div className="flex items-center gap-2 text-sm">
                        <Phone className="w-4 h-4 text-muted-foreground" />
                        <a href={`tel:${selectedItem.store.contact_phone}`} className="text-primary underline">
                          {selectedItem.store.contact_phone}
                        </a>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Delivery Info */}
                <div className="grid grid-cols-2 gap-3">
                  <Card className="bg-muted/50">
                    <CardContent className="p-3 flex items-center gap-2">
                      <Truck className="w-5 h-5 text-primary" />
                      <div>
                        <p className="text-xs text-muted-foreground">Delivery Mode</p>
                        <p className="text-sm font-medium">{DELIVERY_MODES[selectedItem.delivery_mode]}</p>
                      </div>
                    </CardContent>
                  </Card>
                  <Card className="bg-muted/50">
                    <CardContent className="p-3 flex items-center gap-2">
                      <Clock className="w-5 h-5 text-primary" />
                      <div>
                        <p className="text-xs text-muted-foreground">Delivery</p>
                        <p className="text-sm font-medium">Max {selectedItem.max_delivery_days} days</p>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Contact Button */}
                {selectedItem.store?.contact_phone && (
                  <Button className="w-full" asChild>
                    <a href={`tel:${selectedItem.store.contact_phone}`}>
                      <Phone className="w-4 h-4 mr-2" />
                      Contact Seller
                    </a>
                  </Button>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
