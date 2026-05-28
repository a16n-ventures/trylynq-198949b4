import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import {
  Store as StoreIcon, Package, Edit, Trash2, Loader2,
  Search, Eye, EyeOff, Tag, TrendingUp, MapPin, Phone
} from 'lucide-react';
import { Store, StoreItem, DELIVERY_MODES } from '@/types/marketplace';
import { format } from 'date-fns';
import StoreFormDialog from '@/components/StoreFormDialog';
import ItemFormDialog from '@/components/ItemFormDialog';

// ── Helpers ────────────────────────────────────────────────────────────────────
const formatPrice = (price: number) =>
  new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', minimumFractionDigits: 0 }).format(price);

const discounted = (price: number, pct: number) => price - price * pct / 100;

// ── Stat tile ──────────────────────────────────────────────────────────────────
function StatTile({ icon: Icon, label, value, sub, color = "text-muted-foreground" }: {
  icon: any; label: string; value: string | number; sub?: string; color?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-muted-foreground">{label}</span>
          <Icon className={`w-4 h-4 ${color}`} />
        </div>
        <p className="text-2xl font-bold">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  );
}

export default function AdminMarketplace() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('stores');
  const [storeSearch, setStoreSearch] = useState('');
  const [itemSearch, setItemSearch] = useState('');

  // ── Queries ──────────────────────────────────────────────────────────────────
  const { data: stores = [], isLoading: storesLoading } = useQuery<Store[]>({
    queryKey: ['admin_stores'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('stores')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as Store[];
    },
  });

  const { data: items = [], isLoading: itemsLoading } = useQuery<(StoreItem & { store: Pick<Store, 'name' | 'category'> })[]>({
    queryKey: ['admin_items'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('store_items')
        .select('*, store:stores!store_id(name, category)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as any;
    },
  });

  // ── Mutations ─────────────────────────────────────────────────────────────────
  const deleteStoreMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error, count } = await supabase.from('stores').delete({ count: 'exact' }).eq('id', id);
      if (error) throw error;
      if (count === 0) throw new Error("Permission denied — check RLS policies.");
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin_stores'] }); toast.success('Store deleted'); },
    onError: (e: any) => toast.error(e.message),
  });

  const toggleStoreStatusMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { data, error } = await supabase.from('stores').update({ is_active }).eq('id', id).select();
      if (error) throw error;
      if (!data?.length) throw new Error("Update blocked by RLS.");
      return data[0];
    },
    onMutate: async ({ id, is_active }) => {
      await queryClient.cancelQueries({ queryKey: ['admin_stores'] });
      const prev = queryClient.getQueryData(['admin_stores']);
      queryClient.setQueryData(['admin_stores'], (old: Store[] | undefined) =>
        old ? old.map(s => s.id === id ? { ...s, is_active } : s) : []);
      return { prev };
    },
    onError: (e: any, _, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(['admin_stores'], ctx.prev);
      toast.error(e.message);
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin_stores'] }); toast.success('Store updated'); },
  });

  const deleteItemMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error, count } = await supabase.from('store_items').delete({ count: 'exact' }).eq('id', id);
      if (error) throw error;
      if (count === 0) throw new Error("Permission denied.");
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin_items'] }); toast.success('Item deleted'); },
    onError: (e: any) => toast.error(e.message),
  });

  const toggleItemAvailabilityMutation = useMutation({
    mutationFn: async ({ id, is_available }: { id: string; is_available: boolean }) => {
      const { data, error } = await supabase.from('store_items').update({ is_available }).eq('id', id).select();
      if (error) throw error;
      if (!data?.length) throw new Error("Update blocked by RLS.");
      return data[0];
    },
    onMutate: async ({ id, is_available }) => {
      await queryClient.cancelQueries({ queryKey: ['admin_items'] });
      const prev = queryClient.getQueryData(['admin_items']);
      queryClient.setQueryData(['admin_items'], (old: any[] | undefined) =>
        old ? old.map(i => i.id === id ? { ...i, is_available } : i) : []);
      return { prev };
    },
    onError: (e: any, _, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(['admin_items'], ctx.prev);
      toast.error(e.message);
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin_items'] }); toast.success('Item updated'); },
  });

  // ── Filtered lists ────────────────────────────────────────────────────────────
  const filteredStores = stores.filter(s =>
    !storeSearch || s.name.toLowerCase().includes(storeSearch.toLowerCase()) ||
    s.category.toLowerCase().includes(storeSearch.toLowerCase())
  );
  const filteredItems = items.filter((i: any) =>
    !itemSearch || i.name.toLowerCase().includes(itemSearch.toLowerCase()) ||
    i.store?.name?.toLowerCase().includes(itemSearch.toLowerCase())
  );

  return (
    <div className="space-y-5 pb-20 max-w-5xl">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Marketplace</h2>
        <p className="text-sm text-muted-foreground">Manage stores, listings, availability and visibility.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatTile icon={StoreIcon} label="Total Stores"      value={stores.length}                             sub={`${stores.filter(s => s.is_active).length} active`}     color="text-primary" />
        <StatTile icon={Package}   label="Total Listings"    value={items.length}                              sub={`${items.filter((i: any) => i.is_available).length} available`} color="text-blue-500" />
        <StatTile icon={Tag}       label="Categories"        value={new Set(stores.map(s => s.category)).size} sub="unique"                                                  color="text-purple-500" />
        <StatTile icon={TrendingUp} label="Avg Item Price"   value={items.length ? formatPrice(items.reduce((s: number, i: any) => s + (i.price || 0), 0) / items.length) : '—'} color="text-green-500" />
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex items-center justify-between mb-2">
          <TabsList className="grid grid-cols-2 w-48">
            <TabsTrigger value="stores" className="text-xs">
              <StoreIcon className="w-3.5 h-3.5 mr-1.5" /> Stores
            </TabsTrigger>
            <TabsTrigger value="items" className="text-xs">
              <Package className="w-3.5 h-3.5 mr-1.5" /> Items
            </TabsTrigger>
          </TabsList>
          <div>
            {activeTab === 'stores'
              ? <StoreFormDialog trigger={<Button size="sm" className="text-xs gap-1.5"><StoreIcon className="w-3.5 h-3.5" /> Add Store</Button>} />
              : <ItemFormDialog  trigger={<Button size="sm" className="text-xs gap-1.5"><Package className="w-3.5 h-3.5" /> Add Item</Button>} onSuccess={() => {}} />
            }
          </div>
        </div>

        {/* ── STORES TAB ──────────────────────────────────────────────────── */}
        <TabsContent value="stores">
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search stores or categories..." value={storeSearch}
              onChange={(e) => setStoreSearch(e.target.value)} className="pl-9" />
          </div>
          <div className="rounded-xl border overflow-hidden bg-background shadow-sm">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead>Store</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {storesLoading ? (
                  <TableRow><TableCell colSpan={6} className="h-32 text-center">
                    <Loader2 className="w-5 h-5 animate-spin mx-auto text-primary" />
                  </TableCell></TableRow>
                ) : filteredStores.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="h-32 text-center text-sm text-muted-foreground">
                    No stores found.
                  </TableCell></TableRow>
                ) : filteredStores.map((store) => (
                  <TableRow key={store.id} className="hover:bg-muted/20">
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="w-9 h-9 rounded-xl border">
                          <AvatarImage src={store.logo_url || undefined} className="object-cover" />
                          <AvatarFallback className="rounded-xl text-sm">{store.name[0]}</AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium text-sm">{store.name}</p>
                          {store.contact_phone && (
                            <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                              <Phone className="w-2.5 h-2.5" /> {store.contact_phone}
                            </p>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">{store.category}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        <MapPin className="w-3 h-3 shrink-0" />
                        <span className="truncate max-w-[120px]">{store.location || '—'}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={store.is_active}
                        onCheckedChange={(c) => toggleStoreStatusMutation.mutate({ id: store.id, is_active: c })}
                        disabled={toggleStoreStatusMutation.isPending}
                      />
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(store.created_at), 'MMM d, yyyy')}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <StoreFormDialog
                          editingStore={store}
                          trigger={<Button variant="ghost" size="icon" className="h-8 w-8"><Edit className="w-4 h-4" /></Button>}
                        />
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10"
                          onClick={() => deleteStoreMutation.mutate(store.id)}>
                          {deleteStoreMutation.isPending && deleteStoreMutation.variables === store.id
                            ? <Loader2 className="w-4 h-4 animate-spin" />
                            : <Trash2 className="w-4 h-4" />}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* ── ITEMS TAB ───────────────────────────────────────────────────── */}
        <TabsContent value="items">
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search items or stores..." value={itemSearch}
              onChange={(e) => setItemSearch(e.target.value)} className="pl-9" />
          </div>
          <div className="rounded-xl border overflow-hidden bg-background shadow-sm">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead>Item</TableHead>
                  <TableHead>Store</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead>Delivery</TableHead>
                  <TableHead>Available</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {itemsLoading ? (
                  <TableRow><TableCell colSpan={6} className="h-32 text-center">
                    <Loader2 className="w-5 h-5 animate-spin mx-auto text-primary" />
                  </TableCell></TableRow>
                ) : filteredItems.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="h-32 text-center text-sm text-muted-foreground">
                    No items found.
                  </TableCell></TableRow>
                ) : filteredItems.map((item: any) => (
                  <TableRow key={item.id} className="hover:bg-muted/20">
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="w-11 h-11 rounded-xl bg-muted flex items-center justify-center overflow-hidden shrink-0 border">
                          {item.image_url
                            ? <img src={item.image_url} className="w-full h-full object-cover" alt="" />
                            : <Package className="w-4 h-4 text-muted-foreground" />}
                        </div>
                        <div>
                          <p className="font-medium text-sm line-clamp-1">{item.name}</p>
                          {item.discount_percent > 0 && (
                            <Badge className="text-[9px] bg-red-500 text-white border-0 mt-0.5">-{item.discount_percent}% off</Badge>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        <p className="font-medium">{(item as any).store?.name || '—'}</p>
                        <p className="text-[11px] text-muted-foreground">{(item as any).store?.category}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="font-semibold text-sm text-primary">
                          {formatPrice(discounted(item.price, item.discount_percent))}
                        </p>
                        {item.discount_percent > 0 && (
                          <p className="text-[11px] text-muted-foreground line-through">{formatPrice(item.price)}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">{DELIVERY_MODES[item.delivery_mode]}</Badge>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{item.max_delivery_days}d max</p>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={item.is_available}
                          onCheckedChange={(c) => toggleItemAvailabilityMutation.mutate({ id: item.id, is_available: c })}
                          disabled={toggleItemAvailabilityMutation.isPending}
                        />
                        <span className="text-[11px] text-muted-foreground">
                          {item.is_available
                            ? <span className="flex items-center gap-0.5 text-green-600"><Eye className="w-3 h-3" /> Live</span>
                            : <span className="flex items-center gap-0.5"><EyeOff className="w-3 h-3" /> Hidden</span>}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <ItemFormDialog
                          editingItem={item}
                          onSuccess={() => queryClient.invalidateQueries({ queryKey: ['admin_items'] })}
                          trigger={<Button variant="ghost" size="icon" className="h-8 w-8"><Edit className="w-4 h-4" /></Button>}
                        />
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10"
                          onClick={() => deleteItemMutation.mutate(item.id)}>
                          {deleteItemMutation.isPending && deleteItemMutation.variables === item.id
                            ? <Loader2 className="w-4 h-4 animate-spin" />
                            : <Trash2 className="w-4 h-4" />}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
