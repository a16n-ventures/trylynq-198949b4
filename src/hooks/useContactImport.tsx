import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

interface Contact {
  name: string;
  phone?: string;
  email?: string;
}

export const useContactImport = () => {
  const [importing, setImporting] = useState(false);
  const { user } = useAuth();

  const importContacts = async (contacts: Contact[]) => {
    if (!user) { 
      toast.error('Please sign in to import contacts');
      return; 
    }

    setImporting(true);
    try {
      // Import contacts to database
      const contactsToInsert = contacts.map(contact => ({
        user_id: user.id,
        name: contact.name,
        phone: contact.phone || null,
        email: contact.email || null,
      }));

      const { error } = await supabase
        .from('contacts')
        .insert(contactsToInsert);

      if (error) throw error;

      toast.success(`Imported ${contacts.length} contacts`);
      
      // Trigger friend matching
      await matchContacts();
    } catch (err: any) {
      console.error('Error importing contacts:', err);
      toast.error(`Failed to import contacts: ${err?.message || 'Unknown error'}`);
    } finally {
      setImporting(false);
    }
  };

  const matchContacts = async () => {
    if (!user) return;

    try {
      // Find matching users by email or phone
      const { data: matchedUsers, error } = await supabase
        .from('profiles')
        .select('user_id, email')
        .neq('user_id', user.id);

      if (error) throw error;

      // Get user's imported contacts
      const { data: userContacts } = await supabase
        .from('contacts')
        .select('*')
        .eq('user_id', user.id);

      if (!matchedUsers || !userContacts) return;

      // Match contacts with users by phone
      const matches = userContacts
        .map(contact => {
          const match = matchedUsers.find(
            u => u.email && contact.phone && u.email.includes(contact.phone.slice(-4))
          );
          return match ? { contact_id: contact.id, matched_user_id: match.user_id } : null;
        })
        .filter(Boolean);

      if (matches.length === 0) {
        toast.info('No friends found from your contacts');
        return;
      }

      // Update matched contacts
      for (const match of matches) {
        if (match) {
          await supabase
            .from('contacts')
            .update({ matched_user_id: match.matched_user_id, is_app_user: true })
            .eq('id', match.contact_id);

          // Send friend request
          await supabase
            .from('friendships')
            .insert({
              requester_id: user.id,
              addressee_id: match.matched_user_id,
              status: 'pending'
            })
            .select()
            .single();
        }
      }

      toast.success(`Found ${matches.length} friends! Friend requests sent.`);
    } catch (err: any) {
      console.error('Error matching contacts:', err);
      toast.error('Error matching contacts');
    }
  };

  const requestContactAccess = async () => {
    try {
      // For web, we'll use a simpler approach with manual import
      // In a real mobile app, you'd use Capacitor's Contacts plugin
      toast.info('Contact import feature - upload your contacts file or add friends manually');
      return true;
    } catch (err) {
      toast.error('Contact access denied');
      return false;
    }
  };

  return {
    importContacts,
    requestContactAccess,
    importing,
  };
};
