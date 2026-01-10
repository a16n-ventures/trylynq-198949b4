import React, { memo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Smile } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  triggerClassName?: string;
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}

// Organized emoji categories like modern chat apps
const EMOJI_CATEGORIES = {
  recent: ['👍', '❤️', '😂', '🔥', '😍', '👏', '🎉', '💯'],
  smileys: [
    '😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', 
    '🙂', '😊', '😇', '🥰', '😍', '🤩', '😘', '😗',
    '😚', '😋', '😛', '😜', '🤪', '😝', '🤑', '🤗',
    '🤭', '🤫', '🤔', '🤐', '🤨', '😐', '😑', '😶',
    '😏', '😒', '🙄', '😬', '🤥', '😌', '😔', '😪',
    '🤤', '😴', '😷', '🤒', '🤕', '🤢', '🤮', '🤧',
    '🥵', '🥶', '🥴', '😵', '🤯', '🤠', '🥳', '🥸',
    '😎', '🤓', '🧐', '😕', '😟', '🙁', '☹️', '😮',
    '😯', '😲', '😳', '🥺', '😦', '😧', '😨', '😰',
    '😥', '😢', '😭', '😱', '😖', '😣', '😞', '😓',
    '😩', '😫', '🥱', '😤', '😡', '😠', '🤬', '😈',
    '👿', '💀', '☠️', '💩', '🤡', '👹', '👺', '👻',
  ],
  gestures: [
    '👋', '🤚', '🖐️', '✋', '🖖', '👌', '🤌', '🤏',
    '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👆',
    '🖕', '👇', '☝️', '👍', '👎', '✊', '👊', '🤛',
    '🤜', '👏', '🙌', '👐', '🤲', '🤝', '🙏', '✍️',
    '💅', '🤳', '💪', '🦾', '🦿', '🦵', '🦶', '👂',
  ],
  hearts: [
    '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍',
    '🤎', '💔', '❣️', '💕', '💞', '💓', '💗', '💖',
    '💘', '💝', '💟', '♥️', '😻', '💑', '💏', '👩‍❤️‍👨',
  ],
  objects: [
    '🔥', '⭐', '🌟', '✨', '💫', '🎉', '🎊', '🎁',
    '🏆', '🥇', '🎯', '💎', '💰', '💸', '🎵', '🎶',
    '🔔', '📱', '💻', '⌚', '📷', '🎬', '🎮', '🎲',
    '✅', '❌', '⚠️', '💡', '🔑', '🔒', '🔓', '❓',
  ],
  food: [
    '🍕', '🍔', '🍟', '🌭', '🍿', '🧀', '🥐', '🍞',
    '🥨', '🥯', '🥖', '🧇', '🥞', '🍳', '🥚', '🥓',
    '🍗', '🍖', '🦴', '🌮', '🌯', '🥙', '🧆', '🥗',
    '🍜', '🍝', '🍲', '🍛', '🍣', '🍱', '🥟', '🦪',
    '🍦', '🍧', '🍨', '🍩', '🍪', '🎂', '🍰', '🧁',
    '🥧', '🍫', '🍬', '🍭', '🍮', '🍯', '☕', '🍵',
    '🧃', '🥤', '🍺', '🍻', '🥂', '🍷', '🥃', '🍸',
  ],
  nature: [
    '🌸', '💐', '🌹', '🥀', '🌺', '🌻', '🌼', '🌷',
    '🌱', '🌲', '🌳', '🌴', '🌵', '🌾', '🌿', '☘️',
    '🍀', '🍁', '🍂', '🍃', '🍄', '🌰', '🦀', '🦞',
    '🦐', '🦑', '🐙', '🐚', '🐌', '🦋', '🐛', '🐜',
    '🐝', '🪲', '🐞', '🦗', '🪳', '🦂', '🐢', '🐍',
  ],
};

const CATEGORY_ICONS: Record<string, string> = {
  recent: '🕐',
  smileys: '😀',
  gestures: '👋',
  hearts: '❤️',
  objects: '⭐',
  food: '🍕',
  nature: '🌸',
};

export const EmojiPicker = memo(function EmojiPickerInner({ 
  onSelect, 
  triggerClassName,
  isOpen,
  onOpenChange 
}: EmojiPickerProps) {
  const [category, setCategory] = useState<string>('recent');
  
  return (
    <Popover open={isOpen} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={`h-11 w-11 rounded-full hover:bg-muted ${triggerClassName}`}
        >
          <Smile className="w-5 h-5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent 
        className="w-80 p-0 shadow-xl border-border/50" 
        align="start"
        side="top"
        sideOffset={8}
      >
        <div className="flex flex-col h-[320px]">
          {/* Category tabs */}
          <div className="flex items-center gap-1 p-2 border-b bg-muted/30 overflow-x-auto scrollbar-hide">
            {Object.keys(EMOJI_CATEGORIES).map((cat) => (
              <button
                key={cat}
                onClick={() => setCategory(cat)}
                className={`flex-shrink-0 w-8 h-8 flex items-center justify-center text-lg rounded-lg transition-colors ${
                  category === cat 
                    ? 'bg-primary/10 ring-1 ring-primary/30' 
                    : 'hover:bg-muted'
                }`}
              >
                {CATEGORY_ICONS[cat]}
              </button>
            ))}
          </div>
          
          {/* Emoji grid */}
          <ScrollArea className="flex-1 p-2">
            <div className="grid grid-cols-8 gap-0.5">
              {EMOJI_CATEGORIES[category as keyof typeof EMOJI_CATEGORIES]?.map((emoji, index) => (
                <button
                  key={`${emoji}-${index}`}
                  onClick={() => {
                    onSelect(emoji);
                    onOpenChange?.(false);
                  }}
                  className="w-8 h-8 flex items-center justify-center text-xl hover:bg-muted rounded-lg transition-all hover:scale-110"
                >
                  {emoji}
                </button>
              ))}
            </div>
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
    <div className={`flex items-center gap-0.5 bg-background/95 backdrop-blur-md rounded-full border shadow-lg p-1 ${className}`}>
      {QUICK_REACTIONS.map((emoji) => (
        <button
          key={emoji}
          onClick={() => onReact(emoji)}
          className="w-8 h-8 flex items-center justify-center text-base hover:bg-muted rounded-full transition-all hover:scale-110 active:scale-95"
        >
          {emoji}
        </button>
      ))}
      <Popover>
        <PopoverTrigger asChild>
          <button className="w-8 h-8 flex items-center justify-center text-sm hover:bg-muted rounded-full transition-all text-muted-foreground">
            <Smile className="w-4 h-4" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-2" align="start" side="top">
          <div className="grid grid-cols-8 gap-1">
            {['😍', '🥳', '😎', '🤩', '🙏', '💯', '✨', '🎉', '👏', '💪', '🙌', '🤔', '👀', '💀', '🤣', '😇'].map((emoji) => (
              <button
                key={emoji}
                onClick={() => onReact(emoji)}
                className="w-7 h-7 flex items-center justify-center text-lg hover:bg-muted rounded transition-colors"
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
