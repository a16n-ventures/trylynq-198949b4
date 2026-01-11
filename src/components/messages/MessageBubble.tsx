import React, { useState, memo } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent } from "@/components/ui/dialog";
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
  const [showReactions, setShowReactions] = useState(false);

  const isSequence = !!prevMsg && prevMsg.sender_id === msg.sender_id;
  const timeDiff = prevMsg ? new Date(msg.created_at).getTime() - new Date(prevMsg.created_at).getTime() : 0;
  const showTimestamp = !prevMsg || timeDiff > 300000;

  // Extract URLs from message content
  const urls = msg.content ? extractUrls(msg.content) : [];
  const hasUrlPreview = urls.length > 0 && !msg.image_url;

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
    setShowReactions(false);
    if (onReact) {
      onReact(msg.id, emoji);
    }
  };

  if (msg.is_deleted) {
    return (
      <div className="flex w-full mb-2 justify-center">
        <div className="flex items-center gap-2 text-muted-foreground text-xs italic py-2 px-4 bg-muted/30 rounded-full border border-border/50">
          <Trash2 className="w-3 h-3" />
          <span>Message deleted</span>
        </div>
      </div>
    );
  }

  return (
    <div id={`msg-${msg.id}`}>
      <div className={`animate-in fade-in-50 slide-in-from-bottom-2 duration-200 ${msg.pending ? 'opacity-70' : ''}`}>
        {showTimestamp && (
          <div className="flex justify-center my-6">
            <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground/70 bg-muted/30 px-3 py-1 rounded-full border border-border/40">
              {formatDistanceToNow(new Date(msg.created_at), { addSuffix: true })}
            </span>
          </div>
        )}

        {/* Pinned indicator */}
        {msg.is_pinned && (
          <div className="flex items-center gap-1 text-xs text-primary mb-1 ml-10">
            <Pin className="w-3 h-3" />
            <span>Pinned message</span>
          </div>
        )}

        <div className={`flex w-full mb-2 group ${msg.is_me ? 'justify-end' : 'justify-start'}`}>
          {!msg.is_me && isComm && (
            <div className="w-8 mr-2 flex-shrink-0 flex flex-col justify-end">
              {!isSequence ? (
                <Avatar className="w-8 h-8 ring-2 ring-background shadow-sm">
                  <AvatarImage src={msg.sender_avatar} />
                  <AvatarFallback className="text-xs">{msg.sender_name?.[0] ?? '?'}</AvatarFallback>
                </Avatar>
              ) : <div className="w-8" />}
            </div>
          )}

          <div className={`flex flex-col max-w-[80%] md:max-w-[70%] ${msg.is_me ? 'items-end' : 'items-start'}`}>
            {!msg.is_me && isComm && !isSequence && (
              <span className="text-[11px] ml-2 mb-1 text-muted-foreground font-semibold">
                {msg.sender_name ?? 'Unknown'}
              </span>
            )}

            <div className="relative group/message">
              {/* Quick Reactions Popup */}
              {showReactions && (
                <div className={`absolute bottom-full mb-2 z-20 ${msg.is_me ? 'right-0' : 'left-0'}`}>
                  <QuickReactionBar onReact={handleReact} />
                </div>
              )}

              <div 
                className={`
                  relative overflow-hidden transition-all shadow-sm
                  ${msg.is_me 
                    ? 'bg-primary text-primary-foreground' 
                    : 'bg-card border border-border/60 text-card-foreground'
                  }
                  ${msg.image_url ? 'p-1' : 'px-4 py-2.5'}
                  ${msg.is_me ? 'rounded-2xl rounded-tr-sm' : 'rounded-2xl rounded-tl-sm'}
                  ${msg.is_pinned ? 'ring-2 ring-primary/30' : ''}
                `}
                style={{ overflowX: 'hidden', wordBreak: 'break-word' }}
              >
                {msg.image_url && (
                  <div className="relative group/image">
                    <LazyImage
                      src={msg.image_url}
                      alt="Attachment"
                      className="rounded-xl object-cover cursor-pointer hover:opacity-95 max-h-[300px] min-w-[200px]"
                      onClick={() => setShowFullImage(true)}
                      onLoad={onImageLoad}
                    />
                    {msg.content && !isEditing && (
                      <div className={`p-3 mt-1 ${msg.is_me ? 'text-primary-foreground' : ''}`}>
                        <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
                          {renderTextWithLinks(msg.content)}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Edit Mode */}
                {isEditing ? (
                  <div className="min-w-[200px] p-1">
                    <Textarea 
                      value={editContent} 
                      onChange={(e) => setEditContent(e.target.value)} 
                      className="text-foreground bg-background/50 min-h-[60px] text-sm mb-2"
                    />
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="ghost" onClick={() => setIsEditing(false)} className="h-6 text-xs px-2 hover:bg-black/10">
                        Cancel
                      </Button>
                      <Button size="sm" onClick={handleSaveEdit} disabled={isSavingEdit} className="h-6 text-xs px-2 bg-background/20 hover:bg-background/30">
                        {isSavingEdit ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Save'}
                      </Button>
                    </div>
                  </div>
                ) : (
                  !msg.image_url && msg.content && (
                    <>
                      <p className="text-[15px] leading-relaxed whitespace-pre-wrap break-words" style={{ overflowWrap: 'anywhere' }}>
                        {renderTextWithLinks(msg.content)}
                      </p>
                      {/* URL Preview */}
                      {hasUrlPreview && (
                        <UrlPreview url={urls[0]} className={msg.is_me ? 'border-primary-foreground/20' : ''} />
                      )}
                    </>
                  )
                )}
              </div>

              {/* Reaction display */}
              {reactions.length > 0 && (
                <div className={`absolute -bottom-3 ${msg.is_me ? 'left-2' : 'right-2'} flex gap-0.5`}>
                  {reactions.map(r => (
                    <button
                      key={r.emoji}
                      onClick={() => handleReact(r.emoji)}
                      className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs border shadow-sm transition-colors ${
                        r.hasReacted 
                          ? 'bg-primary/10 border-primary/30' 
                          : 'bg-background hover:bg-muted'
                      }`}
                    >
                      <span>{r.emoji}</span>
                      {r.count > 1 && <span className="text-[10px] text-muted-foreground">{r.count}</span>}
                    </button>
                  ))}
                </div>
              )}

              {!msg.pending && !isEditing && (
                <div className={`absolute top-1/2 -translate-y-1/2 ${msg.is_me ? 'right-full mr-2' : 'left-full ml-2'} opacity-0 group-hover/message:opacity-100 transition-opacity z-10 flex items-center gap-1`}>
                  {/* Quick React Button */}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 rounded-full bg-background/80 backdrop-blur-md border shadow-sm hover:bg-accent"
                    onClick={() => setShowReactions(!showReactions)}
                  >
                    <Smile className="w-3.5 h-3.5" />
                  </Button>
                  
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-7 w-7 rounded-full bg-background/80 backdrop-blur-md border shadow-sm hover:bg-accent"
                      >
                        <MoreVertical className="w-3.5 h-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align={msg.is_me ? "end" : "start"} className="w-52 p-1.5 bg-popover/95 backdrop-blur-lg border shadow-xl">
                      <DropdownMenuItem onClick={() => onReply(msg)} className="flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer">
                        <MessageSquare className="w-4 h-4 text-blue-500" />
                        <span className="font-medium">Reply</span>
                      </DropdownMenuItem>
                      
                      {msg.content && (
                        <DropdownMenuItem onClick={handleCopyMessage} className="flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer">
                          <Copy className="w-4 h-4 text-green-500" />
                          <span className="font-medium">Copy Text</span>
                        </DropdownMenuItem>
                      )}
                      
                      {onForward && (
                        <DropdownMenuItem onClick={() => onForward(msg)} className="flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer">
                          <Forward className="w-4 h-4 text-purple-500" />
                          <span className="font-medium">Forward</span>
                        </DropdownMenuItem>
                      )}
                      
                      <DropdownMenuItem onClick={() => handleReact('❤️')} className="flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer">
                        <Heart className="w-4 h-4 text-red-500" />
                        <span className="font-medium">React with ❤️</span>
                      </DropdownMenuItem>
                      
                      <DropdownMenuSeparator className="my-1.5" />
                      
                      {msg.is_me && !msg.image_url && (
                        <DropdownMenuItem onClick={() => { setIsEditing(true); setEditContent(msg.content || ""); }} className="flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer">
                          <Edit2 className="w-4 h-4 text-amber-500" /> 
                          <span className="font-medium">Edit Message</span>
                        </DropdownMenuItem>
                      )}
                      
                      {canModerate && onPin && (
                        <DropdownMenuItem onClick={() => onPin(msg)} className="flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer">
                          <Pin className="w-4 h-4 text-orange-500" /> 
                          <span className="font-medium">{msg.is_pinned ? 'Unpin' : 'Pin'}</span>
                        </DropdownMenuItem>
                      )}
                      
                      {(msg.is_me || canModerate) && (
                        <DropdownMenuItem onClick={() => onDelete(msg.id)} className="flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer text-destructive focus:text-destructive">
                          <Trash2 className="w-4 h-4" />
                          <span className="font-medium">{msg.is_me ? 'Delete' : 'Remove'}</span>
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )}
            </div>

            <div className="flex items-center gap-1.5 mt-1 px-1">
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

      {showFullImage && msg.image_url && (
        <Dialog open={showFullImage} onOpenChange={setShowFullImage}>
          <DialogContent className="max-w-screen-lg p-0 overflow-hidden bg-black/95 border-none">
            <div className="relative w-full h-full flex items-center justify-center p-4">
              <img src={msg.image_url} alt="Full size" className="max-h-[90vh] w-auto max-w-full rounded-md shadow-2xl" />
              <button 
                onClick={() => setShowFullImage(false)}
                className="absolute top-4 right-4 p-2 bg-black/50 rounded-full text-white hover:bg-black/70"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
});

MessageBubble.displayName = 'MessageBubble';
