import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { Store as StoreIcon, Package, Edit, Trash2, Loader2 } from 'lucide-react';
import { Store, StoreItem, DELIVERY_MODES } from '@/types/marketplace';
import { format } from 'date-fns';
import StoreFormDialog from '@/components/StoreFormDialog';
import ItemFormDialog from '@/components/ItemFormDialog';

export default function AdminMarketplace() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('stores');
  const [editingStore, setEditingStore] = useState<Store | null>(null);
  const [editingItem, setEditingItem] = useState<StoreItem | null>(null);

  // Fetch stores
  const { data: stores = [], isLoading: storesLoading } = useQuery({
    queryKey: ['admin_stores'],
    queryFn: async () => {
      const { data, error } = await (supabase.from('stores') as any)
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as Store[];
    }
  });

  // Fetch items
  const { data: items = [], isLoading: itemsLoading } = useQuery({
    queryKey: ['admin_items'],
    queryFn: async () => {
      const { data, error } = await (supabase.from('store_items') as any)
        .select(`*, store:stores!store_id(name, category)`)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as (StoreItem & { store: Pick<Store, 'name' | 'category'> })[];
    }
  });

  // Store mutations
  const deleteStoreMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase.from('stores') as any)
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin_stores'] });
      toast.success('Store deleted');
    },
    onError: (error: any) => toast.error(`Failed to delete store: ${error.message}`)
  });

  const toggleStoreStatusMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await (supabase.from('stores') as any)
        .update({ is_active })
        .eq('id', id)
        .select(); // Added .select() to ensure return and RLS validation
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin_stores'] });
      toast.success('Store status updated');
    },
    onError: (error: any) => {
      toast.error(`Failed to update store: ${error.message}`);
      // Invalidate to revert UI state if optimistic update failed
      queryClient.invalidateQueries({ queryKey: ['admin_stores'] });
    }
  });

  // Item mutations
  const deleteItemMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase.from('store_items') as any)
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin_items'] });
      queryClient.invalidateQueries({ queryKey: ['marketplace_items'] });
      toast.success('Item deleted');
    },
    onError: (error: any) => toast.error(`Failed to delete item: ${error.message}`)
  });

  const toggleItemAvailabilityMutation = useMutation({
    mutationFn: async ({ id, is_available }: { id: string; is_available: boolean }) => {
      const { error } = await (supabase.from('store_items') as any)
        .update({ is_available })
        .eq('id', id)
        .select(); // Added .select() to ensure return and RLS validation
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin_items'] });
      queryClient.invalidateQueries({ queryKey: ['marketplace_items'] });
      toast.success('Item availability updated');
    },
    onError: (error: any) => {
      toast.error(`Failed to update item: ${error.message}`);
      // Invalidate to revert UI state if optimistic update failed
      queryClient.invalidateQueries({ queryKey: ['admin_items'] });
    }
  });

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
      minimumFractionDigits: 0
    }).format(price);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Marketplace</h2>
          <p className="text-muted-foreground">Manage stores and items</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Stores</CardTitle>
            <StoreIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stores.length}</div>
            <p className="text-xs text-muted-foreground">
              {stores.filter(s => s.is_active).length} active
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Items</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{items.length}</div>
            <p className="text-xs text-muted-foreground">
              {items.filter(i => i.is_available).length} available
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Categories</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {new Set(stores.map(s => s.category)).size}
            </div>
            <p className="text-xs text-muted-foreground">unique categories</p>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="stores">Stores</TabsTrigger>
            <TabsTrigger value="items">Items</TabsTrigger>
          </TabsList>
          {activeTab === 'stores' ? (
            <StoreFormDialog editingStore={editingStore} onSuccess={() => setEditingStore(null)} />
          ) : (
            <ItemFormDialog editingItem={editingItem} onSuccess={() => setEditingItem(null)} />
          )}
        </div>

        {/* Stores Tab */}
        <TabsContent value="stores">
          {storesLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-8 h-8 animate-spin" /></div>
          ) : (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Store</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Active</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stores.map((store) => (
                    <TableRow key={store.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="w-8 h-8">
                            <AvatarImage src={store.logo_url || undefined} />
                            <AvatarFallback>{store.name[0]}</AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium">{store.name}</p>
                            {store.contact_phone && <p className="text-xs text-muted-foreground">{store.contact_phone}</p>}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell><Badge variant="outline">{store.category}</Badge></TableCell>
                      <TableCell className="text-sm">{store.location || '-'}</TableCell>
                      <TableCell>
                        <Switch 
                          checked={store.is_active} 
                          onCheckedChange={(checked) => toggleStoreStatusMutation.mutate({ id: store.id, is_active: checked })} 
                          disabled={toggleStoreStatusMutation.isPending}
                        />
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{format(new Date(store.created_at), 'MMM d, yyyy')}</TableCell>
                      <TableCell className="text-right">
                        <StoreFormDialog 
                          editingStore={store} 
                          trigger={<Button variant="ghost" size="icon"><Edit className="w-4 h-4" /></Button>} 
                        />
                        <Button variant="ghost" size="icon" className="text-destructive" onClick={() => deleteStoreMutation.mutate(store.id)}><Trash2 className="w-4 h-4" /></Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {stores.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No stores yet</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>

        {/* Items Tab */}
        <TabsContent value="items">
          {itemsLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-8 h-8 animate-spin" /></div>
          ) : (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead>Store</TableHead>
                    <TableHead>Price</TableHead>
                    <TableHead>Delivery</TableHead>
                    <TableHead>Available</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded bg-muted flex items-center justify-center overflow-hidden">
                            {item.image_url ? (
                              <img src={item.image_url} className="w-full h-full object-cover" alt="" />
                            ) : (
                              <Package className="w-4 h-4 text-muted-foreground" />
                            )}
                          </div>
                          <div>
                            <p className="font-medium">{item.name}</p>
                            {item.discount_percent > 0 && <Badge className="text-[10px] bg-red-500">-{item.discount_percent}%</Badge>}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{(item as any).store?.name || '-'}</TableCell>
                      <TableCell className="font-medium">{formatPrice(item.price)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">{DELIVERY_MODES[item.delivery_mode]}</Badge>
                        <p className="text-xs text-muted-foreground mt-1">{item.max_delivery_days}d max</p>
                      </TableCell>
                      <TableCell>
                        <Switch 
                          checked={item.is_available} 
                          onCheckedChange={(checked) => toggleItemAvailabilityMutation.mutate({ id: item.id, is_available: checked })} 
                          disabled={toggleItemAvailabilityMutation.isPending}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <ItemFormDialog 
                          editingItem={item} 
                          trigger={<Button variant="ghost" size="icon"><Edit className="w-4 h-4" /></Button>} 
                        />
                        <Button variant="ghost" size="icon" className="text-destructive" onClick={() => deleteItemMutation.mutate(item.id)}><Trash2 className="w-4 h-4" /></Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {items.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No items yet</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
