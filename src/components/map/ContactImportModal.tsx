import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useContactImport } from '@/hooks/useContactImport';
import { Users, Upload } from 'lucide-react';

interface ContactImportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const ContactImportModal = ({ open, onOpenChange }: ContactImportModalProps) => {
  const { importContacts, importing } = useContactImport();
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
    const validContacts = contacts.filter(c => c.name.trim() !== '');
    if (validContacts.length === 0) return;
    
    await importContacts(validContacts);
    onOpenChange(false);
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
            Add your contacts to find friends on the map
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {contacts.map((contact, index) => (
            <div key={index} className="space-y-2 p-3 bg-muted/50 rounded-lg">
              <div>
                <Label>Name</Label>
                <Input
                  value={contact.name}
                  onChange={(e) => updateContact(index, 'name', e.target.value)}
                  placeholder="Barack Musa"
                />
              </div>
              <div>
                <Label>Phone</Label>
                <Input
                  value={contact.phone}
                  onChange={(e) => updateContact(index, 'phone', e.target.value)}
                  placeholder="08117920080"
                />
              </div>
              <div>
                <Label>Email</Label>
                <Input
                  value={contact.email}
                  onChange={(e) => updateContact(index, 'email', e.target.value)}
                  placeholder="barack.m@example.com"
                />
              </div>
            </div>
          ))}

          <Button onClick={addContact} variant="outline" className="w-full">
            Add Another Contact
          </Button>

          <Button 
            onClick={handleImport} 
            disabled={importing}
            className="w-full gradient-primary text-white"
          >
            <Upload className="w-4 h-4 mr-2" />
            {importing ? 'Importing...' : 'Import Contacts'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
