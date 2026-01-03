import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Image as ImageIcon } from 'lucide-react';

interface MediaGalleryProps {
  isOpen: boolean;
  onClose: () => void;
  images: { url: string; id: string }[];
}

export const MediaGallery: React.FC<MediaGalleryProps> = ({ 
  isOpen, 
  onClose, 
  images 
}) => {
  return (
    <Dialog open={isOpen} onOpenChange={onClose} modal={true}>
      <DialogContent className="max-w-3xl h-[80vh] flex flex-col p-0 bg-background/95 backdrop-blur-xl z-[200]">
        <DialogHeader className="p-4 border-b">
          <DialogTitle>Media Gallery</DialogTitle>
          <DialogDescription>{images.length} photo{images.length !== 1 ? 's' : ''}</DialogDescription>
        </DialogHeader>
        <ScrollArea className="flex-1 p-4">
          {images.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
              <ImageIcon className="w-12 h-12 opacity-20 mb-4" />
              <p>No media shared yet</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {images.map((img) => (
                <div key={img.id} className="aspect-square relative overflow-hidden rounded-lg border bg-muted group">
                  <img 
                    src={img.url} 
                    className="w-full h-full object-cover transition-transform group-hover:scale-105" 
                    alt="Gallery" 
                    loading="lazy" 
                  />
                  <a 
                    href={img.url} 
                    target="_blank" 
                    rel="noreferrer" 
                    className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" 
                  />
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};
