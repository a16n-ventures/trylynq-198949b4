import React, { useState, memo, useMemo } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger,
  DropdownMenuSeparator
} from "@/components/ui/dropdown-menu";
import { 
  MoreVertical, MessageSquare, Edit2, Trash2, Pin, 
  Check, CheckCheck, Loader2, X, Copy, Forward, Smile, Heart
} from 'lucide-react';
import { formatDistanceToNow } from "date-fns";
import { Message } from '@/types/messages';
import { formatMessageTime } from '@/utils/messageHelpers';
import { LazyImage } from './LazyImage';
import { UrlPreview, extractUrls, renderTextWithLinks } from './UrlPreview';
import { QuickReactionBar } from './EmojiPicker';
import { PremiumBadge } from '@/components/PremiumBadge';
import BusinessBadge from '@/components/BusinessBadge';
import { toast } from "sonner";

export interface Reaction {
  emoji: string;
  count: number;
  hasReacted: boolean;
}

interface MessageBubbleProps {
  msg: Message;
  prevMsg: Message | null;
  isComm: boolean;
  canModerate: boolean;
  onDelete: (msgId: string) => void;
  onReply: (msg: Message) => void;
  onEdit: (msg: Message, newContent: string) => Promise<void>;
  onPin?: (msg: Message) => void;
  onImageLoad?: () => void;
  scrollToId: (id: string) => void;
  onForward?: (msg: Message) => void;
  onReact?: (msgId: string, emoji: string) => void;
  reactions?: Reaction[];
}

// Helper to check if URL is a direct image link
const isImageUrl = (url: string) => {
  return /\.(jpg|jpeg|png|webp|gif|bmp)$/i.test(url.split('?')[0]);
};

export const MessageBubble = memo(function MessageBubbleInner({
  msg,
  prevMsg,
  isComm,
  canModerate,
  onDelete,
  onReply,
  onEdit,
  onPin,
  onImageLoad,
  scrollToId,
  onForward,
  onReact,
  reactions = []
}: MessageBubbleProps) {
  const [showFullImage, setShowFullImage] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(msg.content || "");
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [isReactionOpen, setIsReactionOpen] = useState(false);

  const isSequence = !!prevMsg && prevMsg.sender_id === msg.sender_id;
  const timeDiff = prevMsg ? new Date(msg.created_at).getTime() - new Date(prevMsg.created_at).getTime() : 0;
  const showTimestamp = !prevMsg || timeDiff > 300000;

  // Extract URLs and determine preview type
  const urls = useMemo(() => msg.content ? extractUrls(msg.content) : [], [msg.content]);
  const primaryUrl = urls[0];
  const isLinkImage = primaryUrl && isImageUrl(primaryUrl);

  const handleSaveEdit = async () => {
    if (!editContent.trim()) return;
    setIsSavingEdit(true);
    try {
      await onEdit(msg, editContent);
      setIsEditing(false);
    } catch (e) {
      toast.error("Failed to edit message");
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleCopyMessage = () => {
    if (msg.content) {
      navigator.clipboard.writeText(msg.content);
      toast.success("Message copied!");
    }
  };

  const handleReact = (emoji: string) => {
    setIsReactionOpen(false);
    if (onReact) {
      onReact(msg.id, emoji);
    }
  };

  if (msg.is_deleted) {
    return (
      <div className="flex w-full mb-2 justify-center animate-in fade-in zoom-in-95">
        <div className="flex items-center gap-2 text-muted-foreground text-xs italic py-1.5 px-3 bg-muted/30 rounded-full border border-border/40">
          <Trash2 className="w-3 h-3" />
          <span>Message deleted</span>
        </div>
      </div>
    );
  }

  return (
    <div id={`msg-${msg.id}`} className="group/row relative">
      <div className={`animate-in fade-in-50 slide-in-from-bottom-2 duration-200 ${msg.pending ? 'opacity-70' : ''}`}>
        
        {/* Timestamp Divider */}
        {showTimestamp && (
          <div className="flex justify-center my-6">
            <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground/70 bg-muted/30 px-3 py-1 rounded-full border border-border/40 backdrop-blur-sm">
              {formatDistanceToNow(new Date(msg.created_at), { addSuffix: true })}
            </span>
          </div>
        )}

        {/* Pinned indicator */}
        {msg.is_pinned && (
          <div className="flex items-center gap-1 text-xs text-primary mb-1 ml-12 opacity-80">
            <Pin className="w-3 h-3 fill-current" />
            <span>Pinned message</span>
          </div>
        )}

        {/* Reply Context (if this message is a reply) */}
        {msg.reply_to && (
          <div className={`flex w-full mb-1 ${msg.is_me ? 'justify-end' : 'justify-start ml-10'}`}>
            <div 
              className="flex items-center gap-2 px-3 py-1 rounded-2xl bg-muted/40 text-xs text-muted-foreground max-w-[60%] cursor-pointer hover:bg-muted/60 transition-colors border border-transparent hover:border-border/50"
              onClick={() => msg.reply_to?.id && scrollToId(msg.reply_to.id)}
            >
              <div className="w-0.5 h-6 bg-primary/40 rounded-full" />
              <div className="flex flex-col min-w-0">
                <span className="font-semibold text-primary/80 truncate">Reply to message</span>
                <span className="truncate opacity-80">{msg.reply_to.content || 'Photo'}</span>
              </div>
            </div>
          </div>
        )}

        <div className={`flex w-full mb-1 group ${msg.is_me ? 'justify-end' : 'justify-start'}`}>
          {/* Avatar (Left side) */}
          {!msg.is_me && isComm && (
            <div className="w-8 mr-2 flex-shrink-0 flex flex-col justify-end">
              {!isSequence ? (
                <Avatar className="w-8 h-8 ring-2 ring-background shadow-sm hover:scale-105 transition-transform cursor-pointer">
                  <AvatarImage src={msg.sender_avatar} />
                  <AvatarFallback className="text-[10px] bg-primary/10 text-primary">{msg.sender_name?.[0]?.toUpperCase() ?? '?'}</AvatarFallback>
                </Avatar>
              ) : <div className="w-8" />}
            </div>
          )}

          <div className={`flex flex-col max-w-[85%] md:max-w-[70%] ${msg.is_me ? 'items-end' : 'items-start'}`}>
            {/* Sender Name */}
            {!msg.is_me && isComm && !isSequence && (
              <span className="text-[11px] ml-1 mb-1 text-muted-foreground font-semibold">
                {msg.sender_name ?? 'Unknown'}
              </span>
            )}

            <div className="relative group/message flex items-end gap-2">
              {/* Action Buttons (Left side for ME, Right side for OTHERS) */}
              {msg.is_me && !msg.pending && !isEditing && (
                <div className="opacity-0 group-hover/message:opacity-100 transition-opacity flex items-center gap-1 mb-1">
                   {/* React Popover */}
                   <Popover open={isReactionOpen} onOpenChange={setIsReactionOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-6 w-6 rounded-full hover:bg-muted text-muted-foreground">
                        <Smile className="w-3.5 h-3.5" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent side="top" align="end" className="p-0 border-none bg-transparent shadow-none w-auto">
                      <QuickReactionBar onReact={handleReact} />
                    </PopoverContent>
                  </Popover>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-6 w-6 rounded-full hover:bg-muted text-muted-foreground">
                        <MoreVertical className="w-3.5 h-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    {/* Reuse Menu Content */}
                    <MessageActionsMenu 
                      msg={msg} 
                      onReply={onReply} 
                      onCopy={handleCopyMessage} 
                      onForward={onForward} 
                      onEdit={() => { setIsEditing(true); setEditContent(msg.content || ""); }}
                      onPin={onPin}
                      onDelete={onDelete}
                      canModerate={canModerate}
                      handleReact={handleReact}
                    />
                  </DropdownMenu>
                </div>
              )}

              {/* Message Content Bubble */}
              <div 
                className={`
                  relative overflow-hidden transition-all shadow-sm
                  ${msg.is_me 
                    ? 'bg-primary text-primary-foreground' 
                    : 'bg-card border border-border/60 text-card-foreground'
                  }
                  ${(msg.image_url || isLinkImage) ? 'p-1' : 'px-4 py-2.5'}
                  ${msg.is_me ? 'rounded-2xl rounded-tr-sm' : 'rounded-2xl rounded-tl-sm'}
                  ${msg.is_pinned ? 'ring-2 ring-primary/30' : ''}
                `}
                style={{ overflowWrap: 'break-word', wordBreak: 'break-word' }}
              >
                {/* Uploaded Image */}
                {msg.image_url && (
                  <div className="relative">
                    <LazyImage
                      src={msg.image_url}
                      alt="Attachment"
                      className="rounded-xl object-cover cursor-pointer hover:opacity-95 max-h-[350px] w-auto max-w-full"
                      onClick={() => setShowFullImage(true)}
                      onLoad={onImageLoad}
                    />
                    {msg.content && !isEditing && (
                      <div className={`p-2 pt-3 ${msg.is_me ? 'text-primary-foreground' : ''}`}>
                        <p className="text-sm leading-relaxed whitespace-pre-wrap">{renderTextWithLinks(msg.content)}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Edit Mode */}
                {isEditing ? (
                  <div className="min-w-[200px] p-2">
                    <Textarea 
                      value={editContent} 
                      onChange={(e) => setEditContent(e.target.value)} 
                      className="text-foreground bg-background/90 min-h-[60px] text-sm mb-2 focus-visible:ring-offset-0"
                      autoFocus
                    />
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="ghost" onClick={() => setIsEditing(false)} className="h-7 text-xs px-2 hover:bg-black/10 hover:text-foreground">
                        Cancel
                      </Button>
                      <Button size="sm" onClick={handleSaveEdit} disabled={isSavingEdit} className="h-7 text-xs px-3 bg-background/20 hover:bg-background/30 text-foreground">
                        {isSavingEdit ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Save'}
                      </Button>
                    </div>
                  </div>
                ) : (
                  // Normal Text Content
                  !msg.image_url && msg.content && (
                    <div className="space-y-2">
                      <p className="text-[15px] leading-relaxed whitespace-pre-wrap">
                        {renderTextWithLinks(msg.content, msg.is_me ? "text-primary-foreground underline decoration-primary-foreground/50" : "text-primary")}
                      </p>
                      
                      {/* Link Image Preview (Custom Logic) */}
                      {isLinkImage && (
                         <div className="mt-2 rounded-lg overflow-hidden border border-border/20">
                            <LazyImage 
                                src={primaryUrl} 
                                alt="Link Preview" 
                                className="w-full max-h-[250px] object-cover" 
                                onClick={() => {
                                    setShowFullImage(true); // Re-use the modal for link images too? Or just open link.
                                    // For now, let's open link in new tab, but standard implementation implies preview
                                    window.open(primaryUrl, '_blank');
                                }}
                            />
                         </div>
                      )}

                      {/* Standard URL Preview (OG Tags) - Only show if NOT an image link */}
                      {!isLinkImage && urls.length > 0 && (
                        <UrlPreview url={urls[0]} className={msg.is_me ? 'bg-primary-foreground/10 border-primary-foreground/20 text-primary-foreground hover:bg-primary-foreground/20' : ''} />
                      )}
                    </div>
                  )
                )}
              </div>

              {/* Action Buttons (Right side for OTHERS) */}
              {!msg.is_me && !msg.pending && !isEditing && (
                <div className="opacity-0 group-hover/message:opacity-100 transition-opacity flex items-center gap-1 mb-1">
                  {/* React Popover */}
                  <Popover open={isReactionOpen} onOpenChange={setIsReactionOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-6 w-6 rounded-full hover:bg-muted text-muted-foreground">
                        <Smile className="w-3.5 h-3.5" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent side="top" align="start" className="p-0 border-none bg-transparent shadow-none w-auto">
                      <QuickReactionBar onReact={handleReact} />
                    </PopoverContent>
                  </Popover>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-6 w-6 rounded-full hover:bg-muted text-muted-foreground">
                        <MoreVertical className="w-3.5 h-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <MessageActionsMenu 
                      msg={msg} 
                      onReply={onReply} 
                      onCopy={handleCopyMessage} 
                      onForward={onForward}
                      onEdit={undefined} // Others can't edit
                      onPin={onPin}
                      onDelete={onDelete}
                      canModerate={canModerate}
                      handleReact={handleReact}
                    />
                  </DropdownMenu>
                </div>
              )}
            </div>

            {/* Footer: Reactions & Status */}
            <div className="flex flex-wrap items-center gap-2 mt-1 px-1">
              {/* Reactions */}
              {reactions.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {reactions.map(r => (
                    <button
                      key={r.emoji}
                      onClick={(e) => { e.stopPropagation(); handleReact(r.emoji); }}
                      className={`
                        flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] border shadow-sm transition-all active:scale-95
                        ${r.hasReacted 
                          ? 'bg-primary/15 border-primary/30 text-primary font-medium' 
                          : 'bg-muted/50 border-border/50 text-muted-foreground hover:bg-muted'
                        }
                      `}
                    >
                      <span className="text-sm leading-none">{r.emoji}</span>
                      {r.count > 1 && <span>{r.count}</span>}
                    </button>
                  ))}
                </div>
              )}

              {/* Time & Status */}
              <div className="flex items-center gap-1 ml-auto">
                 <span className="text-[10px] text-muted-foreground/60 font-medium">
                  {msg.pending ? 'Sending...' : formatMessageTime(msg.created_at)}
                </span>
                {msg.updated_at && !msg.pending && (
                  <span className="text-[9px] text-muted-foreground/50 italic">Edited</span>
                )}
                {msg.is_me && !msg.pending && (
                  msg.read ? (
                    <CheckCheck className="w-3.5 h-3.5 text-blue-500 animate-in zoom-in duration-300" />
                  ) : (
                    <Check className="w-3.5 h-3.5 text-muted-foreground/50" />
                  )
                )}
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* Full Screen Image Viewer */}
      {showFullImage && (msg.image_url || isLinkImage) && (
        <Dialog open={showFullImage} onOpenChange={setShowFullImage}>
          <DialogContent className="max-w-screen-xl w-full h-[90vh] p-0 overflow-hidden bg-transparent border-none shadow-none flex items-center justify-center">
            <div className="relative w-full h-full flex items-center justify-center">
              <img 
                src={msg.image_url || primaryUrl} 
                alt="Full size" 
                className="max-h-full max-w-full object-contain animate-in zoom-in-95 duration-200" 
              />
              <button 
                onClick={() => setShowFullImage(false)}
                className="absolute top-4 right-4 p-2 bg-black/50 rounded-full text-white hover:bg-black/70 transition-colors backdrop-blur-sm"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
});

// Extracted Menu Content for reusability and cleanness
const MessageActionsMenu = ({ 
  msg, onReply, onCopy, onForward, onEdit, onPin, onDelete, canModerate, handleReact 
}: any) => (
  <DropdownMenuContent align={msg.is_me ? "end" : "start"} className="w-52 p-1.5 z-50">
    <DropdownMenuItem onClick={() => onReply(msg)} className="gap-2 cursor-pointer">
      <MessageSquare className="w-4 h-4 text-blue-500" />
      <span>Reply</span>
    </DropdownMenuItem>
    
    {msg.content && (
      <DropdownMenuItem onClick={onCopy} className="gap-2 cursor-pointer">
        <Copy className="w-4 h-4 text-green-500" />
        <span>Copy Text</span>
      </DropdownMenuItem>
    )}
    
    {onForward && (
      <DropdownMenuItem onClick={() => onForward(msg)} className="gap-2 cursor-pointer">
        <Forward className="w-4 h-4 text-purple-500" />
        <span>Forward</span>
      </DropdownMenuItem>
    )}
    
    <DropdownMenuItem onClick={() => handleReact('❤️')} className="gap-2 cursor-pointer">
      <Heart className="w-4 h-4 text-red-500" />
      <span>Like</span>
    </DropdownMenuItem>
    
    <DropdownMenuSeparator className="my-1" />
    
    {onEdit && !msg.image_url && (
      <DropdownMenuItem onClick={onEdit} className="gap-2 cursor-pointer">
        <Edit2 className="w-4 h-4 text-amber-500" /> 
        <span>Edit</span>
      </DropdownMenuItem>
    )}
    
    {canModerate && onPin && (
      <DropdownMenuItem onClick={() => onPin(msg)} className="gap-2 cursor-pointer">
        <Pin className="w-4 h-4 text-orange-500" /> 
        <span>{msg.is_pinned ? 'Unpin' : 'Pin'}</span>
      </DropdownMenuItem>
    )}
    
    {(msg.is_me || canModerate) && (
      <DropdownMenuItem onClick={() => onDelete(msg.id)} className="gap-2 cursor-pointer text-destructive focus:text-destructive focus:bg-destructive/10">
        <Trash2 className="w-4 h-4" />
        <span>{msg.is_me ? 'Delete' : 'Remove'}</span>
      </DropdownMenuItem>
    )}
  </DropdownMenuContent>
);

MessageBubble.displayName = 'MessageBubble';
