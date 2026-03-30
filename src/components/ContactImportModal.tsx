import { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Users, Upload, Loader2, Plus, X, FileSpreadsheet } from 'lucide-react';
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { useQueryClient } from '@tanstack/react-query';

interface ContactImportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const normalizePhone = (phone: string): string => {
  if (!phone) return '';
  return phone.replace(/[^\d+]/g, '');
};

export const ContactImportModal = ({ open, onOpenChange }: ContactImportModalProps) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [contacts, setContacts] = useState<Array<{ name: string; phone: string; username: string }>>([
    { name: '', phone: '', username: '' }
  ]);

  const addContact = () => {
    setContacts([...contacts, { name: '', phone: '', username: '' }]);
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

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const lines = text.split(/\r\n|\n/);
        
        const newContacts: Array<{ name: string; phone: string; username: string }> = [];
        const startRow = lines[0].toLowerCase().includes('name') ? 1 : 0;

        for (let i = startRow; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;
          
          const cols = line.split(',').map(c => c.trim().replace(/^["']|["']$/g, ''));
          
          if (cols.length > 0 && cols[0]) {
            newContacts.push({
              name: cols[0] || '',
              username: cols[1] || '',
              phone: cols[2] || ''
            });
          }
        }

        if (newContacts.length > 0) {
          setContacts(prev => {
            const filteredPrev = prev.filter(c => c.name.trim() !== '');
            return [...filteredPrev, ...newContacts];
          });
          toast.success(`Parsed ${newContacts.length} contacts from CSV`);
        } else {
          toast.error("No valid contacts found in CSV");
        }
      } catch (err) {
        console.error("CSV Parse Error", err);
        toast.error("Failed to parse CSV file");
      }
      
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsText(file);
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
    let errors = 0;

    try {
      await Promise.all(validContacts.map(async (contact) => {
        const conditions: string[] = [];
        
        // 1. Check Username (Exact)
        if (contact.username) conditions.push(`username.eq.${contact.username.trim()}`);
        
        // 2. ✅ FIXED: Check Phone (Last 9 Digits only)
        const digits = contact.phone.replace(/\D/g, ''); // Remove non-digits
        if (digits.length >= 9) {
          const last9 = digits.slice(-9);
          conditions.push(`phone.ilike.%${last9}`);
        }

        let existingUser = null;
        
        // Only run query if we have at least one condition
        if (conditions.length > 0) {
          const { data, error } = await supabase
            .from('profiles')
            .select('user_id, display_name, username, phone, avatar_url')
            .neq('user_id', user?.id)
            .or(conditions.join(',')) // Checks Username OR Phone (Suffix)
            .limit(1)
            .maybeSingle();

          if (!error && data) {
            existingUser = data;
          }
        }

        if (existingUser) {
          // --- SCENARIO A: USER FOUND (Send Friend Request) ---
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
            } else {
              console.error("Friend Request Error:", reqError);
              errors++;
            }
          }
        } else {
          // --- SCENARIO B: USER NOT FOUND (Save to Contacts) ---
          const { error: saveError } = await supabase
            .from('contacts')
            .insert({
              user_id: user?.id,
              name: contact.name,
              phone: contact.phone || null,
              username: contact.username || null
            });

          if (!saveError) {
            contactsSaved++;
          } else {
            console.error("Save Contact Error:", saveError);
            errors++;
          }
        }
      }));

      await queryClient.invalidateQueries({ queryKey: ['friendRequests'] });
      await queryClient.invalidateQueries({ queryKey: ['suggestions'] });
      await queryClient.invalidateQueries({ queryKey: ['contacts'] });

      if (requestsSent === 0 && contactsSaved === 0 && alreadyConnected === 0 && errors > 0) {
        toast.error(`Import failed. ${errors} errors occurred.`);
      } else {
        const parts = [];
        if (requestsSent > 0) parts.push(`${requestsSent} friend request(s)`);
        if (contactsSaved > 0) parts.push(`${contactsSaved} contact(s) saved`);
        if (alreadyConnected > 0) parts.push(`${alreadyConnected} already connected`);
        
        if (parts.length > 0) {
          toast.success(`Import complete: ${parts.join(', ')}`);
          onOpenChange(false);
          setContacts([{ name: '', phone: '', username: '' }]); 
        } else if (errors === 0) {
          toast.info("Import complete. No valid actions taken.");
        } else {
          toast.warning(`Partial import: ${errors} failed.`);
        }
      }

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
            Enter details or upload CSV. If they use the app, we'll send a friend request. If not, we'll save them as a contact.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex gap-2">
             <Input 
               type="file" 
               accept=".csv"
               className="hidden" 
               ref={fileInputRef}
               onChange={handleFileUpload}
             />
             <Button 
               variant="outline" 
               className="w-full border-dashed"
               onClick={() => fileInputRef.current?.click()}
             >
               <FileSpreadsheet className="w-4 h-4 mr-2" />
               Upload CSV (Name, Username, Phone)
             </Button>
          </div>

          <div className="h-px bg-border/50 my-2" />

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
                <Label className="text-xs">Name (Required)</Label>
                <Input
                  value={contact.name}
                  onChange={(e) => updateContact(index, 'name', e.target.value)}
                  placeholder="Barack Musa"
                  className="h-9"
                />
              </div>
              
                <div>
                  <Label className="text-xs">Username (App Users)</Label>
                  <Input
                    value={contact.username}
                    onChange={(e) => updateContact(index, 'username', e.target.value)}
                    placeholder="@username"
                    className="h-9"
                  />
                </div>
                <div>
                  <Label className="text-xs">Phone (Optional)</Label>
                  <Input
                    value={contact.phone}
                    onChange={(e) => updateContact(index, 'phone', e.target.value)}
                    placeholder="08012345678"
                    className="h-9"
                  />
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