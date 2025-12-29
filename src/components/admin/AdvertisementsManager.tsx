import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { Plus, Edit, Trash2, Loader2, ExternalLink } from 'lucide-react';

interface Advertisement {
  id: string;
  title: string;
  description: string | null;
  image_url: string | null;
  link_url: string;
  placement: string;
  is_active: boolean;
  created_at: string;
}

export default function AdvertisementsManager() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAd, setEditingAd] = useState<Advertisement | null>(null);
  
  const [adForm, setAdForm] = useState({
    title: '',
    description: '',
    image_url: '',
    link_url: '',
    placement: 'bottom_banner',
    is_active: true
  });

  // Fetch advertisements
  const { data: ads = [], isLoading } = useQuery({
    queryKey: ['advertisements'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('advertisements')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as Advertisement[];
    }
  });

  // Create/Update advertisement mutation
  const saveAdMutation = useMutation({
    mutationFn: async (adData: typeof adForm) => {
      if (editingAd) {
        const { error } = await supabase
          .from('advertisements')
          .update(adData)
          .eq('id', editingAd.id);
        
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('advertisements')
          .insert(adData);
        
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editingAd ? 'Advertisement updated' : 'Advertisement created');
      queryClient.invalidateQueries({ queryKey: ['advertisements'] });
      resetForm();
      setDialogOpen(false);
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to save advertisement');
    }
  });

  // Delete advertisement mutation
  const deleteAdMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('advertisements')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Advertisement deleted');
      queryClient.invalidateQueries({ queryKey: ['advertisements'] });
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to delete advertisement');
    }
  });

  // Toggle active status mutation
  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const { error } = await supabase
        .from('advertisements')
        .update({ is_active: isActive })
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Advertisement status updated');
      queryClient.invalidateQueries({ queryKey: ['advertisements'] });
    }
  });

  const resetForm = () => {
    setAdForm({
      title: '',
      description: '',
      image_url: '',
      link_url: '',
      placement: 'bottom_banner',
      is_active: true
    });
    setEditingAd(null);
  };

  const openEditDialog = (ad: Advertisement) => {
    setEditingAd(ad);
    setAdForm({
      title: ad.title,
      description: ad.description || '',
      image_url: ad.image_url || '',
      link_url: ad.link_url,
      placement: ad.placement,
      is_active: ad.is_active
    });
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!adForm.title.trim() || !adForm.link_url.trim()) {
      toast.error('Title and Link URL are required');
      return;
    }

    saveAdMutation.mutate(adForm);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Advertisements</h2>
          <p className="text-muted-foreground">Manage ad banners displayed to non-premium users</p>
        </div>
        
        <Dialog open={dialogOpen} onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) resetForm();
        }}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              New Advertisement
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{editingAd ? 'Edit' : 'Create'} Advertisement</DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Title *</Label>
                <Input
                  value={adForm.title}
                  onChange={(e) => setAdForm({ ...adForm, title: e.target.value })}
                  placeholder="Upgrade to Premium"
                />
              </div>

              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea
                  value={adForm.description}
                  onChange={(e) => setAdForm({ ...adForm, description: e.target.value })}
                  placeholder="Get unlimited access to all features..."
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label>Image URL</Label>
                <Input
                  value={adForm.image_url}
                  onChange={(e) => setAdForm({ ...adForm, image_url: e.target.value })}
                  placeholder="https://example.com/image.jpg"
                />
                {adForm.image_url && (
                  <div className="mt-2 w-24 h-24 rounded-lg overflow-hidden border">
                    <img 
                      src={adForm.image_url} 
                      alt="Preview" 
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = '';
                        toast.error('Invalid image URL');
                      }}
                    />
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label>Link URL *</Label>
                <Input
                  value={adForm.link_url}
                  onChange={(e) => setAdForm({ ...adForm, link_url: e.target.value })}
                  placeholder="/premium or https://example.com"
                />
              </div>

              <div className="space-y-2">
                <Label>Placement</Label>
                <Input
                  value={adForm.placement}
                  onChange={(e) => setAdForm({ ...adForm, placement: e.target.value })}
                  placeholder="bottom_banner"
                  disabled
                />
                <p className="text-xs text-muted-foreground">Currently only bottom_banner is supported</p>
              </div>

              <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                <Label>Active</Label>
                <Switch
                  checked={adForm.is_active}
                  onCheckedChange={(checked) => setAdForm({ ...adForm, is_active: checked })}
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSubmit} disabled={saveAdMutation.isPending}>
                {saveAdMutation.isPending ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...</>
                ) : (
                  editingAd ? 'Update' : 'Create'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Advertisements Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Advertisements ({ads.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : ads.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">No advertisements yet</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Preview</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Link</TableHead>
                  <TableHead>Placement</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ads.map((ad) => (
                  <TableRow key={ad.id}>
                    <TableCell>
                      {ad.image_url ? (
                        <img 
                          src={ad.image_url} 
                          alt={ad.title}
                          className="w-12 h-12 rounded object-cover"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded bg-muted flex items-center justify-center text-muted-foreground text-xs">
                          No Image
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium">{ad.title}</p>
                        {ad.description && (
                          <p className="text-xs text-muted-foreground line-clamp-1">
                            {ad.description}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <a 
                        href={ad.link_url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-xs text-primary flex items-center gap-1 hover:underline"
                      >
                        {ad.link_url.substring(0, 30)}...
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </TableCell>
                    <TableCell className="text-xs">{ad.placement}</TableCell>
                    <TableCell>
                      <Switch
                        checked={ad.is_active}
                        onCheckedChange={(checked) => 
                          toggleActiveMutation.mutate({ id: ad.id, isActive: checked })
                        }
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEditDialog(ad)}
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive"
                        onClick={() => deleteAdMutation.mutate(ad.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
