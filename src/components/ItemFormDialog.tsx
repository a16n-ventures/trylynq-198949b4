import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Plus, Loader2, Upload, X } from 'lucide-react';
import { StoreItem, Store } from '@/types/marketplace';

interface ItemFormDialogProps {
  editingItem?: StoreItem | null;
  onSuccess?: () => void;
  trigger?: React.ReactNode;
}

export default function ItemFormDialog({ editingItem, onSuccess, trigger }: ItemFormDialogProps) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>(editingItem?.image_url || '');

  const [itemForm, setItemForm] = useState({
    store_id: editingItem?.store_id || '',
    name: editingItem?.name || '',
    description: editingItem?.description || '',
    image_url: editingItem?.image_url || '',
    price: editingItem?.price || 0,
    discount_percent: editingItem?.discount_percent || 0,
    delivery_mode: (editingItem?.delivery_mode || 'onsite') as 'onsite' | 'payment_before_delivery',
    max_delivery_days: editingItem?.max_delivery_days || 3
  });

  // Fetch only stores owned by the current user
  const { data: stores = [], isLoading: storesLoading } = useQuery({
    queryKey: ['user_stores'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await (supabase.from('stores') as any)
        .select('*')
        .eq('owner_id', user.id)
        .eq('is_active', true)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as Store[];
    },
    enabled: open // Only fetch when dialog is open
  });

  const resetForm = () => {
    setItemForm({ store_id: '', name: '', description: '', image_url: '', price: 0, discount_percent: 0, delivery_mode: 'onsite', max_delivery_days: 3 });
    setImageFile(null);
    setImagePreview('');
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast.error('Image must be less than 5MB');
        return;
      }
      setImageFile(file);
      setImagePreview(URL.createObjectURL(file));
    }
  };

  const uploadImage = async (): Promise<string | null> => {
    if (!imageFile) return itemForm.image_url || null;

    setUploading(true);
    try {
      const fileExt = imageFile.name.split('.').pop();
      const fileName = `${Math.random().toString(36).substring(2)}_${Date.now()}.${fileExt}`;
      const filePath = `items/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('stores')
        .upload(filePath, imageFile);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('stores')
        .getPublicUrl(filePath);

      return publicUrl;
    } catch (error: any) {
      toast.error(error.message || 'Failed to upload image');
      return null;
    } finally {
      setUploading(false);
    }
  };

  const createItemMutation = useMutation({
    mutationFn: async (data: Partial<StoreItem>) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data: store, error: storeError } = await (supabase.from('stores') as any)
        .select('owner_id')
        .eq('id', data.store_id)
        .single();

      if (storeError) throw storeError;
      if (store.owner_id !== user.id) throw new Error('You can only add items to your own stores');

      const { error } = await (supabase.from('store_items') as any).insert(data);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin_items'] });
      queryClient.invalidateQueries({ queryKey: ['marketplace_items'] });
      setOpen(false);
      resetForm();
      toast.success('Item created successfully');
      onSuccess?.();
    },
    onError: (error: any) => toast.error(error.message)
  });

  const updateItemMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<StoreItem> }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data: store, error: storeError } = await (supabase.from('stores') as any)
        .select('owner_id')
        .eq('id', data.store_id)
        .single();

      if (storeError) throw storeError;
      if (store.owner_id !== user.id) throw new Error('You can only edit items in your own stores');

      const { error } = await (supabase.from('store_items') as any)
        .update(data)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin_items'] });
      queryClient.invalidateQueries({ queryKey: ['marketplace_items'] });
      setOpen(false);
      resetForm();
      toast.success('Item updated successfully');
      onSuccess?.();
    },
    onError: (error: any) => toast.error(error.message)
  });

  const handleSubmit = async () => {
    if (!itemForm.name.trim() || !itemForm.store_id) {
      toast.error('Item name and store are required');
      return;
    }

    if (stores.length === 0) {
      toast.error('You need to create a store first before adding items');
      return;
    }

    const imageUrl = await uploadImage();
    if (uploading) return;

    const formData = {
      ...itemForm,
      image_url: imageUrl || itemForm.image_url
    };

    if (editingItem) {
      updateItemMutation.mutate({ id: editingItem.id, data: formData });
    } else {
      createItemMutation.mutate(formData);
    }
  };

  const handleOpenChange = (isOpen: boolean) => {
    // ✅ FIXED: Removed the premature stores.length check here.
    // We let the dialog open first so useQuery can actually fetch the data.
    setOpen(isOpen);
    if (!isOpen) resetForm();
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {trigger || <Button><Plus className="w-4 h-4 mr-2" /> Add Item</Button>}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editingItem ? 'Edit Item' : 'Add New Item'}</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
          {/* ✅ ADDED: Loading state handling */}
          {storesLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : stores.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground">
              <p>You need to create a store first before adding items.</p>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <Label>Item Image</Label>
                <div className="flex items-center gap-3">
                  {imagePreview ? (
                    <div className="relative w-24 h-24 rounded-lg overflow-hidden border">
                      <img src={imagePreview} alt="Item preview" className="w-full h-full object-cover" />
                      <button
                        onClick={() => {
                          setImageFile(null);
                          setImagePreview('');
                          setItemForm({ ...itemForm, image_url: '' });
                        }}
                        className="absolute top-1 right-1 bg-destructive text-destructive-foreground rounded-full p-1 hover:bg-destructive/90"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <div className="w-24 h-24 rounded-lg border-2 border-dashed flex items-center justify-center">
                      <Upload className="w-6 h-6 text-muted-foreground" />
                    </div>
                  )}
                  <div className="flex-1">
                    <Input
                      type="file"
                      accept="image/*"
                      onChange={handleImageChange}
                      className="cursor-pointer"
                    />
                    <p className="text-xs text-muted-foreground mt-1">Max 5MB (PNG, JPG, WEBP)</p>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Your Store *</Label>
                <Select value={itemForm.store_id} onValueChange={(v) => setItemForm({ ...itemForm, store_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select your store" /></SelectTrigger>
                  <SelectContent>
                    {stores.map((store) => (
                      <SelectItem key={store.id} value={store.id}>{store.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Item Name *</Label>
                <Input value={itemForm.name} onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })} placeholder="Product name" />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea value={itemForm.description} onChange={(e) => setItemForm({ ...itemForm, description: e.target.value })} placeholder="Item details" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Price (NGN)</Label>
                  <Input type="number" value={itemForm.price} onChange={(e) => setItemForm({ ...itemForm, price: Number(e.target.value) })} min={0} />
                </div>
                <div className="space-y-2">
                  <Label>Discount %</Label>
                  <Input type="number" value={itemForm.discount_percent} onChange={(e) => setItemForm({ ...itemForm, discount_percent: Number(e.target.value) })} min={0} max={100} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Delivery Mode</Label>
                <Select value={itemForm.delivery_mode} onValueChange={(v: 'onsite' | 'payment_before_delivery') => setItemForm({ ...itemForm, delivery_mode: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="onsite">Pay on Delivery</SelectItem>
                    <SelectItem value="payment_before_delivery">Pay Before Delivery</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Max Delivery Days (1-7)</Label>
                <Input type="number" value={itemForm.max_delivery_days} onChange={(e) => setItemForm({ ...itemForm, max_delivery_days: Math.min(7, Math.max(1, Number(e.target.value))) })} min={1} max={7} />
              </div>
            </>
          )}
        </div>
        
        {/* Only show Footer if not loading and stores exist */}
        {!storesLoading && stores.length > 0 && (
          <DialogFooter>
            <Button onClick={handleSubmit} disabled={createItemMutation.isPending || updateItemMutation.isPending || uploading}>
              {(createItemMutation.isPending || updateItemMutation.isPending || uploading) && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editingItem ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
