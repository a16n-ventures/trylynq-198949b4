import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Plus, Loader2, Upload, X } from 'lucide-react';
import { Store, STORE_CATEGORIES } from '@/types/marketplace';

interface StoreFormDialogProps {
  editingStore?: Store | null;
  onSuccess?: () => void;
  trigger?: React.ReactNode;
}

export default function StoreFormDialog({ editingStore, onSuccess, trigger }: StoreFormDialogProps) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string>(editingStore?.logo_url || '');

  const [storeForm, setStoreForm] = useState({
    name: editingStore?.name || '',
    description: editingStore?.description || '',
    logo_url: editingStore?.logo_url || '',
    category: editingStore?.category || 'General',
    location: editingStore?.location || '',
    contact_phone: editingStore?.contact_phone || ''
  });

  const resetForm = () => {
    setStoreForm({ name: '', description: '', logo_url: '', category: 'General', location: '', contact_phone: '' });
    setLogoFile(null);
    setLogoPreview('');
  };

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast.error('Image must be less than 5MB');
        return;
      }
      setLogoFile(file);
      setLogoPreview(URL.createObjectURL(file));
    }
  };

  const uploadLogo = async (): Promise<string | null> => {
    if (!logoFile) return storeForm.logo_url || null;

    setUploading(true);
    try {
      const fileExt = logoFile.name.split('.').pop();
      const fileName = `${Math.random().toString(36).substring(2)}_${Date.now()}.${fileExt}`;
      const filePath = `logos/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('stores')
        .upload(filePath, logoFile);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('stores')
        .getPublicUrl(filePath);

      return publicUrl;
    } catch (error: any) {
      toast.error(error.message || 'Failed to upload logo');
      return null;
    } finally {
      setUploading(false);
    }
  };

  const createStoreMutation = useMutation({
    mutationFn: async (data: Partial<Store>) => {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error('Not authenticated');
      
      const { error } = await (supabase.from('stores') as any).insert({
        ...data,
        owner_id: user.user.id
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin_stores'] });
      queryClient.invalidateQueries({ queryKey: ['marketplace_items'] });
      setOpen(false);
      resetForm();
      toast.success('Store created successfully');
      onSuccess?.();
    },
    onError: (error: any) => toast.error(error.message)
  });

  const updateStoreMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Store> }) => {
      const { error } = await (supabase.from('stores') as any)
        .update(data)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin_stores'] });
      queryClient.invalidateQueries({ queryKey: ['marketplace_items'] });
      setOpen(false);
      resetForm();
      toast.success('Store updated successfully');
      onSuccess?.();
    },
    onError: (error: any) => toast.error(error.message)
  });

  const handleSubmit = async () => {
    if (!storeForm.name.trim()) {
      toast.error('Store name is required');
      return;
    }

    const logoUrl = await uploadLogo();
    if (uploading) return;

    const formData = {
      ...storeForm,
      logo_url: logoUrl || storeForm.logo_url
    };

    if (editingStore) {
      updateStoreMutation.mutate({ id: editingStore.id, data: formData });
    } else {
      createStoreMutation.mutate(formData);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { 
      setOpen(isOpen); 
      if (!isOpen) resetForm(); 
    }}>
      <DialogTrigger asChild>
        {trigger || <Button><Plus className="w-4 h-4 mr-2" /> Add Store</Button>}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editingStore ? 'Edit Store' : 'Add New Store'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
          <div className="space-y-2">
            <Label>Store Logo</Label>
            <div className="flex items-center gap-3">
              {logoPreview ? (
                <div className="relative w-20 h-20 rounded-lg overflow-hidden border">
                  <img src={logoPreview} alt="Logo preview" className="w-full h-full object-cover" />
                  <button
                    onClick={() => {
                      setLogoFile(null);
                      setLogoPreview('');
                      setStoreForm({ ...storeForm, logo_url: '' });
                    }}
                    className="absolute top-1 right-1 bg-destructive text-destructive-foreground rounded-full p-1 hover:bg-destructive/90"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <div className="w-20 h-20 rounded-lg border-2 border-dashed flex items-center justify-center">
                  <Upload className="w-6 h-6 text-muted-foreground" />
                </div>
              )}
              <div className="flex-1">
                <Input
                  type="file"
                  accept="image/*"
                  onChange={handleLogoChange}
                  className="cursor-pointer"
                />
                <p className="text-xs text-muted-foreground mt-1">Max 5MB (PNG, JPG, WEBP)</p>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Store Name *</Label>
            <Input value={storeForm.name} onChange={(e) => setStoreForm({ ...storeForm, name: e.target.value })} placeholder="My Awesome Store" />
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea value={storeForm.description} onChange={(e) => setStoreForm({ ...storeForm, description: e.target.value })} placeholder="What do you sell?" />
          </div>
          <div className="space-y-2">
            <Label>Category</Label>
            <Select value={storeForm.category} onValueChange={(v) => setStoreForm({ ...storeForm, category: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {STORE_CATEGORIES.map((cat) => <SelectItem key={cat} value={cat}>{cat}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Location</Label>
            <Input value={storeForm.location} onChange={(e) => setStoreForm({ ...storeForm, location: e.target.value })} placeholder="Lagos, Nigeria" />
          </div>
          <div className="space-y-2">
            <Label>Contact Phone</Label>
            <Input value={storeForm.contact_phone} onChange={(e) => setStoreForm({ ...storeForm, contact_phone: e.target.value })} placeholder="+234..." />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={handleSubmit} disabled={createStoreMutation.isPending || updateStoreMutation.isPending || uploading}>
            {(createStoreMutation.isPending || updateStoreMutation.isPending || uploading) && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {editingStore ? 'Update' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
