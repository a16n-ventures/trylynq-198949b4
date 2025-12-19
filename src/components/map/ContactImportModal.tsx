import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Users, Upload, Loader2, Plus, X } from 'lucide-react';
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { useQueryClient } from '@tanstack/react-query';

interface ContactImportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const ContactImportModal = ({ open, onOpenChange }: ContactImportModalProps) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [contacts, setContacts] = useState<Array<{ name: string; phone: string; email: string }>>([
    { name: '', phone: '', email: '' }
  ]);

  const addContact = () => {
    setContacts([...contacts, { name: '', phone: '', email: '' }]);
  };

  const updateContact = (index: number, field: string, value: string) => {
    const updated = [...contacts];
    updated[index] = { ...updated[index], [field]: value };
    setContacts(updated);
  };

  const removeContact = (index: number) => {
    const newContacts = [...contacts];
    newContacts.splice(index, 1);
    setContacts(newContacts);
  };

  const handleImport = async () => {
    const validContacts = contacts.filter(c => c.name.trim() !== '');
    
    if (validContacts.length === 0) {
      toast.error("Please add at least one contact with a name.");
      return;
    }

    setLoading(true);
    let requestsSent = 0;
    let contactsSaved = 0;
    let alreadyConnected = 0;

    try {
      await Promise.all(validContacts.map(async (contact) => {
        // Search by display_name or email (profiles doesn't have phone column)
        const conditions: string[] = [];
        
        if (contact.name) conditions.push(`display_name.ilike.%${contact.name.trim()}%`);
        if (contact.email) conditions.push(`email.eq.${contact.email.trim().toLowerCase()}`);

        let existingUser = null;
        
        if (conditions.length > 0) {
          const { data, error } = await supabase
            .from('profiles')
            .select('user_id, display_name, email, avatar_url')
            .neq('user_id', user?.id)
            .or(conditions.join(','))
            .limit(1)
            .maybeSingle();

          if (!error && data) {
            existingUser = data;
          }
        }

        if (existingUser) {
          // USER FOUND - Check for existing friendship
          const { data: existingFriendship } = await supabase
            .from('friendships')
            .select('status')
            .or(`and(requester_id.eq.${user?.id},addressee_id.eq.${existingUser.user_id}),and(requester_id.eq.${existingUser.user_id},addressee_id.eq.${user?.id})`)
            .maybeSingle();

          if (existingFriendship) {
            alreadyConnected++;
          } else {
            const { error: reqError } = await supabase
              .from('friendships')
              .insert({ 
                requester_id: user?.id,
                addressee_id: existingUser.user_id,
                status: 'pending'
              });

            if (!reqError) {
              requestsSent++;
            }
          }
        } else if (contact.email || contact.phone) {
          // USER NOT FOUND - Save as contact
          const { error: saveError } = await supabase
            .from('contacts')
            .insert({
              user_id: user?.id,
              name: contact.name,
              phone: contact.phone ? contact.phone.replace(/[\s\-\(\)]/g, '') : null,
              email: contact.email || null 
            });

          if (!saveError) contactsSaved++;
        }
      }));

      // Invalidate queries to refresh data
      await queryClient.invalidateQueries({ queryKey: ['friendRequests'] });
      await queryClient.invalidateQueries({ queryKey: ['suggestions'] });
      await queryClient.invalidateQueries({ queryKey: ['contacts'] });

      let msg = "Import complete.";
      if (requestsSent > 0) msg += ` Sent ${requestsSent} friend request${requestsSent > 1 ? 's' : ''}.`;
      if (contactsSaved > 0) msg += ` Saved ${contactsSaved} contact${contactsSaved > 1 ? 's' : ''}.`;
      if (alreadyConnected > 0) msg += ` ${alreadyConnected} already connected.`;
      
      toast.success(msg);
      onOpenChange(false);
      setContacts([{ name: '', phone: '', email: '' }]); 

    } catch (error) {
      console.error(error);
      toast.error("Failed to process imports");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px] max-w-[calc(100vw-2rem)] my-auto mx-auto max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            Import Contacts
          </DialogTitle>
          <DialogDescription>
            Enter details below. If they use the app (username/email/phone match), we'll send a friend request. If not, we'll save them as a contact.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {contacts.map((contact, index) => (
            <div key={index} className="space-y-3 p-4 bg-muted/40 border border-border/50 rounded-lg relative group">
               {index > 0 && (
                   <Button 
                    variant="ghost" 
                    size="icon" 
                    className="absolute top-2 right-2 h-6 w-6 text-muted-foreground hover:text-red-500" 
                    onClick={() => removeContact(index)}
                   >
                     <X className="w-3 h-3" />
                   </Button>
               )}
              
              <div>
                <Label className="text-xs">Name / Username</Label>
                <Input
                  value={contact.name}
                  onChange={(e) => updateContact(index, 'name', e.target.value)}
                  placeholder="e.g. johndoe"
                  className="h-9"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Phone (Optional)</Label>
                  <Input
                    value={contact.phone}
                    onChange={(e) => updateContact(index, 'phone', e.target.value)}
                    placeholder="080..."
                    className="h-9"
                  />
                </div>
                <div>
                  <Label className="text-xs">Email (Optional)</Label>
                  <Input
                    value={contact.email}
                    onChange={(e) => updateContact(index, 'email', e.target.value)}
                    placeholder="mail@..."
                    className="h-9"
                  />
                </div>
              </div>
            </div>
          ))}

          <Button onClick={addContact} variant="outline" className="w-full border-dashed">
            <Plus className="w-4 h-4 mr-2" /> Add Another Row
          </Button>

          <Button 
            onClick={handleImport} 
            disabled={loading}
            className="w-full gradient-primary text-white"
          >
            {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
            {loading ? 'Processing...' : 'Import & Connect'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
