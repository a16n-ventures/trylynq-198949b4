import React, { useState, useEffect, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Trash2, Check, Loader2, Upload, X, Image as ImageIcon } from 'lucide-react';
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface CommunitySettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  communityId: string;
  currentName: string;
  currentDesc: string;
  currentCoverUrl?: string | null;
}

// Validate image file
const validateImage = (file: File): string | null => {
  const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  if (!validTypes.includes(file.type)) {
    return 'Please upload a valid image (JPEG, PNG, or WebP)';
  }
  if (file.size > 5 * 1024 * 1024) {
    return 'Image must be less than 5MB';
  }
  return null;
};

export const CommunitySettingsDialog: React.FC<CommunitySettingsDialogProps> = ({
  isOpen,
  onClose,
  communityId,
  currentName,
  currentDesc,
  currentCoverUrl
}) => {
  const queryClient = useQueryClient();
  const coverInputRef = useRef<HTMLInputElement | null>(null);
  
  const [name, setName] = useState(currentName);
  const [desc, setDesc] = useState(currentDesc);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [removeCover, setRemoveCover] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  useEffect(() => {
    setName(currentName);
    setDesc(currentDesc);
    setCoverPreview(currentCoverUrl || null);
    setCoverFile(null);
    setRemoveCover(false);
  }, [currentName, currentDesc, currentCoverUrl, isOpen]);

  // Cleanup blob URLs
  useEffect(() => {
    return () => {
      if (coverPreview?.startsWith('blob:')) {
        try {
          URL.revokeObjectURL(coverPreview);
        } catch (e) {
          console.error('Failed to revoke URL:', e);
        }
      }
    };
  }, [coverPreview]);

  const handleCoverSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const error = validateImage(file);
    if (error) {
      toast.error(error);
      return;
    }

    // Clean up previous blob URL
    if (coverPreview?.startsWith('blob:')) {
      try {
        URL.revokeObjectURL(coverPreview);
      } catch (e) {
        console.error('Failed to revoke URL:', e);
      }
    }

    setCoverFile(file);
    setCoverPreview(URL.createObjectURL(file));
    setRemoveCover(false);
  };

  const handleRemoveCover = () => {
    setCoverFile(null);
    if (coverPreview?.startsWith('blob:')) {
      try {
        URL.revokeObjectURL(coverPreview);
      } catch (e) {
        console.error('Failed to revoke URL:', e);
      }
    }
    setCoverPreview(null);
    setRemoveCover(true);
  };

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error('Community name is required');
      
      let finalCoverUrl: string | null = currentCoverUrl || null;

      // Handle cover photo upload
      if (coverFile) {
        try {
          // Delete old cover if exists
          if (currentCoverUrl) {
            const oldPath = currentCoverUrl.split('/').pop();
            if (oldPath) {
              await supabase.storage
                .from('chat-attachments')
                .remove([`community-covers/${oldPath}`]);
            }
          }

          // Upload new cover
          const fileExt = coverFile.name.split('.').pop();
          const filePath = `community-covers/${communityId}-${Date.now()}.${fileExt}`;
          
          const { error: uploadError } = await supabase.storage
            .from('chat-attachments')
            .upload(filePath, coverFile, {
              cacheControl: '3600',
              upsert: false
            });

          if (uploadError) {
            console.error('Upload error:', uploadError);
            throw new Error('Failed to upload cover image');
          }

          const { data: urlData } = supabase.storage
            .from('chat-attachments')
            .getPublicUrl(filePath);

          finalCoverUrl = urlData.publicUrl;
          console.log('✅ New cover uploaded:', finalCoverUrl);
        } catch (uploadErr: any) {
          console.error('Cover upload failed:', uploadErr);
          throw new Error(uploadErr.message || 'Failed to upload cover');
        }
      } else if (removeCover && currentCoverUrl) {
        // Remove cover photo
        try {
          const oldPath = currentCoverUrl.split('/').pop();
          if (oldPath) {
            await supabase.storage
              .from('chat-attachments')
              .remove([`community-covers/${oldPath}`]);
          }
          finalCoverUrl = null;
          console.log('✅ Cover removed');
        } catch (removeErr) {
          console.error('Failed to remove cover:', removeErr);
          // Continue anyway - we'll still update the DB
        }
      }

      // Update community
      const { error } = await supabase
        .from('communities')
        .update({ 
          name: name.trim(), 
          description: desc.trim(),
          cover_url: finalCoverUrl
        })
        .eq('id', communityId);

      if (error) {
        console.error('Update error:', error);
        throw error;
      }

      console.log('✅ Community updated successfully');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comm_list'] });
      queryClient.invalidateQueries({ queryKey: ['messages'] });
      toast.success("Community updated successfully!");
      onClose();
    },
    onError: (error: any) => {
      console.error('❌ Update failed:', error);
      toast.error(error?.message || "Failed to update community");
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      // Delete cover photo if exists
      if (currentCoverUrl) {
        try {
          const oldPath = currentCoverUrl.split('/').pop();
          if (oldPath) {
            await supabase.storage
              .from('chat-attachments')
              .remove([`community-covers/${oldPath}`]);
          }
        } catch (e) {
          console.error('Failed to delete cover:', e);
        }
      }

      // Delete community (cascades to members and messages)
      const { error } = await supabase
        .from('communities')
        .delete()
        .eq('id', communityId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comm_list'] });
      toast.success("Community deleted");
      setShowDeleteDialog(false);
      onClose();
    },
    onError: (error: any) => {
      console.error('❌ Delete failed:', error);
      toast.error(error?.message || "Failed to delete community");
    }
  });

  const hasChanges = name.trim() !== currentName || 
                     desc.trim() !== currentDesc || 
                     coverFile !== null || 
                     removeCover;

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose} modal>
        <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto z-[9999]" style={{ position: 'fixed' }}>
          <DialogHeader>
            <DialogTitle>Community Settings</DialogTitle>
            <DialogDescription>Manage your community's information and appearance</DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {/* Cover Photo Section */}
            <div className="space-y-2">
              <Label>Cover Photo</Label>
              <input 
                type="file" 
                accept="image/jpeg,image/png,image/webp" 
                className="hidden" 
                ref={coverInputRef} 
                onChange={handleCoverSelect} 
              />
              
              {coverPreview && !removeCover ? (
                <div className="relative w-full h-40 rounded-xl overflow-hidden border-2 border-border group">
                  <img 
                    src={coverPreview} 
                    className="w-full h-full object-cover" 
                    alt="Cover preview" 
                  />
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => coverInputRef.current?.click()}
                      type="button"
                    >
                      <Upload className="w-4 h-4 mr-2" />
                      Change
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={handleRemoveCover}
                      type="button"
                    >
                      <X className="w-4 h-4 mr-2" />
                      Remove
                    </Button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => coverInputRef.current?.click()}
                  className="w-full h-40 rounded-xl border-2 border-dashed border-muted-foreground/30 hover:border-primary/50 transition-colors flex flex-col items-center justify-center gap-2 text-muted-foreground hover:text-primary bg-muted/20 hover:bg-muted/40"
                >
                  <ImageIcon className="w-8 h-8" />
                  <span className="text-sm font-medium">
                    {currentCoverUrl && !removeCover ? 'Change cover photo' : 'Upload cover photo'}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    PNG, JPG or WebP (max 5MB)
                  </span>
                </button>
              )}
            </div>

            {/* Community Name */}
            <div className="space-y-2">
              <Label>Community Name <span className="text-red-500">*</span></Label>
              <Input 
                value={name} 
                onChange={(e) => setName(e.target.value)} 
                maxLength={50} 
                placeholder="Enter community name"
              />
              <p className="text-xs text-muted-foreground">
                {name.length}/50 characters
              </p>
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea 
                value={desc} 
                onChange={(e) => setDesc(e.target.value)} 
                rows={4} 
                maxLength={200}
                placeholder="What's this community about?"
                className="resize-none"
              />
              <p className="text-xs text-muted-foreground">
                {desc.length}/200 characters
              </p>
            </div>
          </div>

          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button 
              variant="destructive" 
              className="w-full sm:w-auto" 
              onClick={() => setShowDeleteDialog(true)}
              disabled={updateMutation.isPending || deleteMutation.isPending}
            >
              <Trash2 className="w-4 h-4 mr-2" /> Delete Community
            </Button>
            <div className="flex gap-2 w-full sm:w-auto">
              <Button 
                variant="outline" 
                onClick={onClose} 
                className="flex-1 sm:flex-none"
                disabled={updateMutation.isPending}
              >
                Cancel
              </Button>
              <Button 
                onClick={() => updateMutation.mutate()} 
                disabled={updateMutation.isPending || !name.trim() || !hasChanges} 
                className="flex-1 sm:flex-none"
              >
                {updateMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Check className="w-4 h-4 mr-2" />
                )}
                Save Changes
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent className="z-[10000]" style={{ position: 'fixed' }}>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Community?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <strong>{currentName}</strong> and all its messages. 
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => deleteMutation.mutate()} 
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete Permanently'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
