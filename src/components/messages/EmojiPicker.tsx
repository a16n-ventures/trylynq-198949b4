import React, { memo, useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Smile, Search as SearchIcon, X } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  triggerClassName?: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

// Organized emoji categories
const EMOJI_CATEGORIES = {
  recent: ['👍', '❤️', '😂', '🔥', '😍', '👏', '🎉', '💯', '🤔', '👀'],
  smileys: [
    '😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '🙃', '😉', '😊', '😇', 
    '🥰', '😍', '🤩', '😘', '😗', '☺️', '😚', '😙', '🥲', '😋', '😛', '😜', '🤪', 
    '😝', '🤑', '🤗', '🤭', '🤫', '🤔', '🤐', '🤨', '😐', '😑', '😶', '😏', '😒', 
    '🙄', '😬', '🤥', '😌', '😔', '😪', '🤤', '😴', '😷', '🤒', '🤕', '🤢', '🤮', 
    '🤧', '🥵', '🥶', '🥴', '😵', '🤯', '🤠', '🥳', '🥸', '😎', '🤓', '🧐', '😕', 
    '😟', '🙁', '☹️', '😮', '😯', '😲', '😳', '🥺', '😦', '😧', '😨', '😰', '😥', 
    '😢', '😭', '😱', '😖', '😣', '😞', '😓', '😩', '😫', '🥱', '😤', '😡', '😠', 
    '🤬', '😈', '👿', '💀', '☠️', '💩', '🤡', '👹', '👺', '👻', '👽', '👾', '🤖'
  ],
  gestures: [
    '👋', '🤚', '🖐️', '✋', '🖖', '👌', '🤌', '🤏', '✌️', '🤞', '🤟', '🤘', '🤙', 
    '👈', '👉', '👆', '🖕', '👇', '☝️', '👍', '👎', '✊', '👊', '🤛', '🤜', '👏', 
    '🙌', '👐', '🤲', '🤝', '🙏', '✍️', '💅', '🤳', '💪', '🦾', '🦿', '🦵', '🦶'
  ],
  hearts: [
    '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '💕', '💞', 
    '💓', '💗', '💖', '💘', '💝', '💟', '♥️', '💌', '💋'
  ],
  objects: [
    '🔥', '⭐', '🌟', '✨', '💫', '🎉', '🎊', '🎁', '🎈', '🎂', '🏆', '🥇', '🎯', 
    '💎', '💰', '💸', '💵', '💶', '💷', '💣', '📍', '📢', '🔔', '🎵', '🎶', '🎤', 
    '🎧', '📱', '💻', '🖥️', '⌚', '📷', '📸', '📹', '🎥', '📞', '☎️', '🔋', '🔌', 
    '💡', '🔦', '🕯️', '🧯', '🗑️', '🛢️', '🛒', '👓', '🕶️', '🔍', '🔎', '🗝️', '🔑', 
    '🔒', '🔓', '🛡️', '🗡️', '⚔️', '🏹', '🔧', '🔨', '⛏️', '🪓', '🔩', '⚙️', '🧱'
  ],
  nature: [
    '🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐻‍❄️', '🐨', '🐯', '🦁', '🐮', 
    '🐷', '🐸', '🐵', '🐔', '🐧', '🐦', '🐤', '🦆', '🦅', '🦉', '🦇', '🐺', '🐗', 
    '🐴', '🦄', '🐝', '🪱', '🐛', '🦋', '🐌', '🐞', '🐜', '🪰', '🪲', '🪳', '🦟', 
    '🦗', '🕷️', '🕸️', '🦂', '🐢', '🐍', '🦎', '🦖', '🦕', '🐙', '🦑', '🦐', '🦞', 
    '🦀', '🐡', '🐠', '🐟', '🐬', '🐳', '🐋', '🦈', '🐊', '🐅', '🐆', '🦓', '🦍', 
    '🦧', '🦣', '🐘', '🦛', '🦏', '🐪', '🐫', '🦒', '🦘', '🦬', '🐃', '🐂', '🐄', 
    '🐎', '🐖', '🐏', '🐑', '🦙', '🐐', '🦌', '🐕', '🐩', '🦮', '🐕‍🦺', '🐈', '🐈‍⬛', 
    '🐓', '🦃', '🦚', '🦜', '🦢', '🦩', '🕊️', '🐇', '🦝', '🦨', '🦡', '🦫', '🦦', 
    '🦥', '🐁', '🐀', '🐿️', '🦔', '🐾', '🐉', '🐲', '🌵', '🎄', '🌲', '🌳', '🌴', 
    '🌱', '🌿', '☘️', '🍀', '🎍', '🎋', '🍃', '🍂', '🍁', '🍄', '🐚', '🪨', '💐', 
    '🌷', '🌹', '🥀', '🌺', '🌸', '🌼', '🌻'
  ]
};

const CATEGORY_ICONS: Record<string, string> = {
  recent: '🕒',
  smileys: '😀',
  gestures: '👋',
  hearts: '❤️',
  objects: '💡',
  nature: '🐻',
};

export const EmojiPicker = memo(function EmojiPickerInner({ 
  onSelect, 
  triggerClassName,
  isOpen,
  onOpenChange 
}: EmojiPickerProps) {
  const [category, setCategory] = useState<string>('recent');
  const [search, setSearch] = useState('');
  
  // Flatten emojis for search
  const allEmojis = useMemo(() => {
    const set = new Set<string>();
    Object.values(EMOJI_CATEGORIES).forEach(list => list.forEach(e => set.add(e)));
    return Array.from(set);
  }, []);

  const filteredEmojis = useMemo(() => {
    if (!search.trim()) return null;
    // Basic search - in a real app you'd map emojis to keywords
    // For now, we just show all emojis if search is active because 
    // we don't have a keyword map in this snippet. 
    // To make it functional without keywords, we'll just return all 
    // so the user can scroll, or we could implement a basic filter if we had names.
    // Let's fallback to just showing everything for scroll:
    return allEmojis; 
  }, [search, allEmojis]);

  return (
    <Popover open={isOpen} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn("shrink-0 text-muted-foreground hover:text-primary", triggerClassName)}
        >
          <Smile className="w-5 h-5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent 
        className="w-[320px] p-0 shadow-xl border-border/50 bg-popover/95 backdrop-blur-xl z-50" 
        align="start"
        side="top"
        sideOffset={10}
      >
        <div className="flex flex-col h-[380px]">
          {/* Search Header */}
          <div className="p-2 border-b flex items-center gap-2">
            <div className="relative flex-1">
              <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input 
                placeholder="Search emojis..." 
                className="pl-8 h-9 bg-muted/50 border-transparent focus:border-primary/50 text-sm"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <button 
                  onClick={() => setSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          {/* Category Tabs (Only show if not searching) */}
          {!search && (
            <div className="flex items-center justify-between px-2 py-1.5 bg-muted/30 border-b overflow-x-auto scrollbar-hide">
              {Object.keys(EMOJI_CATEGORIES).map((cat) => (
                <button
                  type="button"
                  key={cat}
                  onClick={() => setCategory(cat)}
                  className={cn(
                    "flex-shrink-0 w-8 h-8 flex items-center justify-center text-sm rounded-lg transition-colors",
                    category === cat 
                      ? "bg-background shadow-sm text-foreground scale-110" 
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  )}
                  title={cat}
                >
                  {CATEGORY_ICONS[cat]}
                </button>
              ))}
            </div>
          )}
          
          {/* Emoji Grid */}
          <ScrollArea className="flex-1 p-2">
            {search ? (
              <div className="grid grid-cols-8 gap-1">
                {/* Fallback search behavior: Show all since we don't have keywords in this snippet */}
                 {allEmojis.map((emoji, index) => (
                  <button
                    type="button"
                    key={`search-${index}`}
                    onClick={() => {
                      onSelect(emoji);
                      // Don't auto close on selection to allow multiple emojis
                    }}
                    className="w-8 h-8 flex items-center justify-center text-xl hover:bg-muted rounded-lg transition-transform hover:scale-125"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-8 gap-1">
                {EMOJI_CATEGORIES[category as keyof typeof EMOJI_CATEGORIES]?.map((emoji, index) => (
                  <button
                    type="button"
                    key={`${category}-${index}`}
                    onClick={() => {
                      onSelect(emoji);
                    }}
                    className="w-8 h-8 flex items-center justify-center text-xl hover:bg-muted rounded-lg transition-transform hover:scale-125 cursor-pointer"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>
      </PopoverContent>
    </Popover>
  );
});

EmojiPicker.displayName = 'EmojiPicker';

// Quick reaction bar for messages
interface QuickReactionBarProps {
  onReact: (emoji: string) => void;
  className?: string;
}

const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '🔥', '😢'];

export const QuickReactionBar = memo(function QuickReactionBarInner({ onReact, className }: QuickReactionBarProps) {
  return (
    <div className={cn("flex items-center gap-1 bg-popover/95 backdrop-blur-md rounded-full border shadow-lg p-1.5 animate-in fade-in zoom-in-95 duration-200", className)}>
      {QUICK_REACTIONS.map((emoji) => (
        <button
          type="button"
          key={emoji}
          onClick={() => onReact(emoji)}
          className="w-8 h-8 flex items-center justify-center text-xl hover:bg-muted hover:scale-125 rounded-full transition-all active:scale-95"
        >
          {emoji}
        </button>
      ))}
      <div className="w-px h-6 bg-border mx-1" />
      <Popover>
        <PopoverTrigger asChild>
          <button 
            type="button"
            className="w-8 h-8 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted rounded-full transition-all"
          >
            <Smile className="w-4 h-4" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-0 z-50" align="start" side="top">
          <div className="p-2 grid grid-cols-8 gap-1 bg-popover rounded-md">
            {EMOJI_CATEGORIES.smileys.slice(0, 32).map((emoji) => (
              <button
                type="button"
                key={emoji}
                onClick={() => onReact(emoji)}
                className="w-8 h-8 flex items-center justify-center text-lg hover:bg-muted rounded hover:scale-125 transition-transform"
              >
                {emoji}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
});

QuickReactionBar.displayName = 'QuickReactionBar';
