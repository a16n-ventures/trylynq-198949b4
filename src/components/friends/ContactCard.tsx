import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Send, Check, X, Loader2, MessageSquare, Mail } from "lucide-react";
import { wasInvitedRecently, type Contact } from "@/hooks/useContacts";
import { toast } from "sonner";

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

  const handleSMSInvite = () => {
    if (!contact.phone) return;
    
    // Normalize invite message
    const message = encodeURIComponent("Hey! Check out this app: https://try.usecorridor.xyz");
    
    // Use window.location for better mobile compatibility with SMS protocols
    window.location.href = `sms:${contact.phone}?&body=${message}`;
    
    toast.success("Messaging app opened");
  };

  return (
    <div className="flex items-center gap-3 p-3 bg-card rounded-xl border border-border/40 hover:bg-muted/20 transition-colors">
      <Avatar className="w-12 h-12 border border-border/50">
        {/* Attempt to use avatar if matched user, otherwise fallback */}
        {isOnPlatform ? (
           <AvatarImage src={`https://api.dicebear.com/7.x/initials/svg?seed=${contact.name}`} />
        ) : null}
        <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-500 text-white font-medium">
          {contact.name?.[0]?.toUpperCase() || 'C'}
        </AvatarFallback>
      </Avatar>
      
      <div className="flex-1 min-w-0 text-left">
        <div className="font-semibold truncate text-sm">{contact.name}</div>
        <div className="text-xs text-muted-foreground truncate flex items-center gap-1">
          {contact.phone && <span>{contact.phone}</span>}
          {contact.phone && contact.email && <span>•</span>}
          {contact.email && <span>{contact.email}</span>}
          {!contact.phone && !contact.email && <span>No contact info</span>}
        </div>
      </div>
      
      <div className="flex gap-2">
        {!isOnPlatform && (
          <>
            {/* SMS Invite Button - Only if phone exists */}
            {contact.phone ? (
              <Button 
                size="sm" 
                variant="outline"
                className="text-xs h-8 px-2 border-blue-200 hover:bg-blue-50 text-blue-600 dark:border-blue-800 dark:hover:bg-blue-950 dark:text-blue-400"
                onClick={handleSMSInvite}
              >
                <MessageSquare className="w-3.5 h-3.5 mr-1" />
                Invite 
              </Button>
            ) : (
              /* Email Invite Button - Fallback to standard invite */
              <Button 
                size="sm" 
                variant="outline"
                className={`text-xs h-8 px-2 ${invitedRecently ? 'text-green-600 border-green-300' : ''}`}
                onClick={() => onInvite(contact)}
                disabled={isInviting || !contact.email}
              >
                {isInviting ? (
                  <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                ) : invitedRecently ? (
                  <Check className="w-3 h-3 mr-1" />
                ) : (
                  <Mail className="w-3.5 h-3.5 mr-1" />
                )}
                {invitedRecently ? 'Sent' : 'Email'}
              </Button>
            )}
          </>
        )}
        
        <Button 
          size="sm" 
          variant="ghost"
          className="h-8 w-8 p-0 text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950"
          onClick={() => onDelete(contact.id)}
          disabled={isDeleting}
        >
          {isDeleting ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-4 h-4" />}
        </Button>
      </div>
    </div>
  );
}
