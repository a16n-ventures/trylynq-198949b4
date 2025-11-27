import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Users, Upload, Loader2, Plus } from 'lucide-react';
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

interface ContactImportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const ContactImportModal = ({ open, onOpenChange }: ContactImportModalProps) => {
  const { user } = useAuth();
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

  const handleImport = async () => {
    const validContacts = contacts.filter(c => c.name.trim() !== '' && (c.email || c.phone));
    
    if (validContacts.length === 0) {
      toast.error("Please fill in a name and at least one contact method (email or phone)");
      return;
    }

    setLoading(true);
    let requestsSent = 0;
    let contactsSaved = 0;
    let alreadyFriends = 0;

    try {
      // Process contacts in parallel for speed
      await Promise.all(validContacts.map(async (contact) => {
        // 1. Search for existing user in profiles
        let query = supabase
          .from('profiles')
          .select('id, user_id, display_name, email, phone')
          .neq('user_id', user?.id); // Don't find yourself

        // Construct OR query for email OR phone
        const conditions = [];
        if (contact.email) conditions.push(`email.eq.${contact.email.trim()}`);
        if (contact.phone) {
             const phoneRaw = contact.phone.trim();
             // Try strict match if DB is clean
             conditions.push(`phone.eq.${phoneRaw}`);
        }
        
        // Apply the OR filter if we have conditions
        let existingUser = null;
        if (conditions.length > 0) {
          query = query.or(conditions.join(','));
          const { data, error } = await query.maybeSingle();
          if (!error && data) {
              existingUser = data;
          } else if (error) {
              console.log("Import Search Error (likely RLS):", error);
          }
        }

        if (existingUser) {
          // --- SCENARIO A: MATCH FOUND -> Check Friendship status first ---
          
          // Check if we are already friends or have a pending request
          const { data: existingFriendship } = await supabase
            .from('friendships')
            .select('status')
            .or(`and(requester_id.eq.${user?.id},addressee_id.eq.${existingUser.user_id}),and(requester_id.eq.${existingUser.user_id},addressee_id.eq.${user?.id})`)
            .maybeSingle();

          if (existingFriendship) {
            alreadyFriends++;
          } else {
             // Send Friend Request
            const { error: reqError } = await supabase
              .from('friendships')
              .insert({ 
                requester_id: user?.id,
                addressee_id: existingUser.user_id,
                status: 'pending'
              });

            if (!reqError) requestsSent++;
            
            // Send notification
            supabase.from('notifications').insert({
                user_id: existingUser.user_id,
                type: 'friend_request',
                title: 'New Friend Request',
                content: `You have a new friend request from a contact import.`,
                data: { requester_id: user?.id },
            });
          }
        } else {
          // --- SCENARIO B: NO MATCH -> Save to Contacts ---
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

      let message = `Complete: Saved ${contactsSaved} contacts.`;
      if (requestsSent > 0) message += ` Sent ${requestsSent} friend requests.`;
      if (alreadyFriends > 0) message += ` Found ${alreadyFriends} existing friends.`;
      
      toast.success(message);
      onOpenChange(false);
      setContacts([{ name: '', phone: '', email: '' }]); // Reset form

    } catch (error) {
      console.error(error);
      toast.error("Failed to process imports");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            Import Contacts
          </DialogTitle>
          <DialogDescription>
            We'll check if your contact(s) are already on the app. If so, we'll connect you automatically. If not, we'll save them to your list.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {contacts.map((contact, index) => (
            <div key={index} className="space-y-3 p-4 bg-muted/40 border border-border/50 rounded-lg">
              <div className="flex justify-between items-center mb-1">
                 <h4 className="text-xs font-semibold uppercase text-muted-foreground">Contact {index + 1}</h4>
                 {index > 0 && (
                   <Button variant="ghost" size="sm" className="h-5 text-red-500 hover:text-red-600 text-[10px]" onClick={() => {
                     const newContacts = [...contacts];
                     newContacts.splice(index, 1);
                     setContacts(newContacts);
                   }}>Remove</Button>
                 )}
              </div>
              <div>
                <Label className="text-xs">Name</Label>
                <Input
                  value={contact.name}
                  onChange={(e) => updateContact(index, 'name', e.target.value)}
                  placeholder="e.g. David Mark"
                  className="h-9"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Phone</Label>
                  <Input
                    value={contact.phone}
                    onChange={(e) => updateContact(index, 'phone', e.target.value)}
                    placeholder="080..."
                    className="h-9"
                  />
                </div>
                <div>
                  <Label className="text-xs">Email</Label>
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
