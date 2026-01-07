import React, { memo } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Smile } from 'lucide-react';

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  triggerClassName?: string;
}

const EMOJI_LIST = [
  '👍', '❤️', '😂', '😮', '😢', '😡', '🔥', '👏',
  '🎉', '🙏', '💯', '✨', '🤔', '👀', '💪', '🙌',
  '😍', '🥳', '😎', '🤩', '😇', '🥺', '💀', '🤣',
];

export const EmojiPicker = memo(function EmojiPickerInner({ onSelect, triggerClassName }: EmojiPickerProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={`h-7 w-7 rounded-full ${triggerClassName}`}
        >
          <Smile className="w-4 h-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2" align="start">
        <div className="grid grid-cols-8 gap-1">
          {EMOJI_LIST.map((emoji) => (
            <button
              key={emoji}
              onClick={() => onSelect(emoji)}
              className="w-7 h-7 flex items-center justify-center text-lg hover:bg-muted rounded transition-colors"
            >
              {emoji}
            </button>
          ))}
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

const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '🔥'];

export const QuickReactionBar = memo(function QuickReactionBarInner({ onReact, className }: QuickReactionBarProps) {
  return (
    <div className={`flex items-center gap-0.5 bg-background/95 backdrop-blur-md rounded-full border shadow-lg p-1 ${className}`}>
      {QUICK_REACTIONS.map((emoji) => (
        <button
          key={emoji}
          onClick={() => onReact(emoji)}
          className="w-8 h-8 flex items-center justify-center text-base hover:bg-muted rounded-full transition-all hover:scale-110"
        >
          {emoji}
        </button>
      ))}
    </div>
  );
});

QuickReactionBar.displayName = 'QuickReactionBar';
