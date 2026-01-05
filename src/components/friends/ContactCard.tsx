import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Send, Check, X, Loader2 } from "lucide-react";
import { wasInvitedRecently, type Contact } from "@/hooks/useContacts";

interface ContactCardProps {
  contact: Contact;
  onInvite: (contact: Contact) => void;
  onDelete: (contactId: string) => void;
  isInviting?: boolean;
  isDeleting?: boolean;
}

export function ContactCard({ 
  contact, 
  onInvite, 
  onDelete, 
  isInviting, 
  isDeleting 
}: ContactCardProps) {
  const invitedRecently = wasInvitedRecently(contact.invited_at);
  const isOnPlatform = contact.is_app_user || contact.matched_user_id;

  return (
    <div className="flex items-center gap-3 p-3 bg-card rounded-xl border border-border/40">
      <Avatar className="w-12 h-12 border border-border/50">
        <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-500 text-white">
          {contact.name[0]?.toUpperCase() || 'C'}
        </AvatarFallback>
      </Avatar>
      
      <div className="flex-1 min-w-0 text-left">
        <div className="font-semibold truncate">{contact.name}</div>
        <div className="text-xs text-muted-foreground truncate">
          {contact.phone || contact.email || 'No contact info'}
        </div>
      </div>
      
      <div className="flex gap-1">
        {!isOnPlatform && (
          <Button 
            size="sm" 
            variant="outline"
            className={`text-xs h-8 ${invitedRecently ? 'text-green-600 border-green-300' : ''}`}
            onClick={() => onInvite(contact)}
            disabled={isInviting || (!contact.email && !contact.phone)}
          >
            {isInviting ? (
              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
            ) : invitedRecently ? (
              <Check className="w-3 h-3 mr-1" />
            ) : (
              <Send className="w-3 h-3 mr-1" />
            )}
            {invitedRecently ? 'Invited' : 'Invite'}
          </Button>
        )}
        <Button 
          size="sm" 
          variant="ghost"
          className="text-xs h-8 text-red-500 hover:bg-red-50 dark:hover:bg-red-950"
          onClick={() => onDelete(contact.id)}
          disabled={isDeleting}
        >
          {isDeleting ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
        </Button>
      </div>
    </div>
  );
}
