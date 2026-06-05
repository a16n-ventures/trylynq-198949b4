/**
 * ServiceCard
 *
 * Renders one catalog item in two modes:
 *   mode="owner"     → shown in Profile → Catalog tab: Edit / Delete / View on Map
 *   mode="discovery" → shown on Map → Services view: Contact / Directions
 *
 * Both modes share the same visual skeleton so the card looks identical
 * wherever it appears.
 */

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import {
  MapPin, Phone, Truck, Tag, Edit, Trash2, Map as MapIcon,
  MessageCircle, Navigation, Loader2, Eye, EyeOff, Send,
} from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { CatalogItem } from '@/hooks/useUserCatalog';
import type { Store } from '@/types/marketplace';
import { DELIVERY_MODES } from '@/types/marketplace';

// ── Helpers ────────────────────────────────────────────────────────────────────

const formatNGN = (price: number) =>
  new Intl.NumberFormat('en-NG', {
    style: 'currency', currency: 'NGN', minimumFractionDigits: 0,
  }).format(price);

const effectivePrice = (price: number, discount: number) =>
  price - price * (discount / 100);

// ── Props ──────────────────────────────────────────────────────────────────────

interface OwnerActions {
  onEdit: (item: CatalogItem) => void;
  onDelete: (itemId: string) => void;
  onToggleAvailability: (itemId: string, available: boolean) => void;
  onViewOnMap: () => void;
  isDeleting?: boolean;
}

interface DiscoveryActions {
  onContact: (phone: string) => void;
  onDirections: (lat: number, lng: number, name: string) => void;
  /** Pre-fills a DM to the business owner with item details. */
  onRequest?: (item: CatalogItem & { store: Store & { owner_id?: string } }) => void;
}

type ServiceCardProps =
  | { mode: 'owner'; item: CatalogItem; actions: OwnerActions }
  | { mode: 'discovery'; item: CatalogItem & { store: Store & { latitude?: number; longitude?: number } }; actions: DiscoveryActions };

// ── Component ──────────────────────────────────────────────────────────────────

export function ServiceCard(props: ServiceCardProps) {
  const { mode, item, actions } = props;
  const [confirmDelete, setConfirmDelete] = useState(false);

  const discounted = effectivePrice(item.price, item.discount_percent);
  const hasDiscount = item.discount_percent > 0;

  return (
    <>
      <Card className="overflow-hidden border border-border/50 shadow-sm hover:shadow-md transition-shadow">
        {/* ── Image strip ─────────────────────────────────────────────────── */}
        <div className="relative aspect-[4/3] bg-muted">
          {item.image_url ? (
            <img
              src={item.image_url}
              alt={item.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Tag className="w-8 h-8 text-muted-foreground/40" />
            </div>
          )}

          {hasDiscount && (
            <Badge className="absolute top-2 left-2 bg-red-500 text-white border-0 text-[10px]">
              -{item.discount_percent}%
            </Badge>
          )}

          {/* Availability pill — owner only */}
          {mode === 'owner' && (
            <button
              onClick={() =>
                (actions as OwnerActions).onToggleAvailability(item.id, !item.is_available)
              }
              className={`absolute top-2 right-2 flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                item.is_available
                  ? 'bg-green-500/90 text-white border-green-600'
                  : 'bg-muted/90 text-muted-foreground border-border'
              }`}
            >
              {item.is_available ? (
                <><Eye className="w-2.5 h-2.5" /> Live</>
              ) : (
                <><EyeOff className="w-2.5 h-2.5" /> Hidden</>
              )}
            </button>
          )}
        </div>

        {/* ── Body ────────────────────────────────────────────────────────── */}
        <CardContent className="p-3 space-y-2">
          {/* Store name */}
          <p className="text-[10px] text-muted-foreground truncate flex items-center gap-1">
            <Avatar className="w-3.5 h-3.5 inline-flex">
              <AvatarImage src={item.store?.logo_url || undefined} />
              <AvatarFallback className="text-[8px]">
                {item.store?.name?.[0] || 'S'}
              </AvatarFallback>
            </Avatar>
            {item.store?.name || 'Store'}
          </p>

          {/* Item name */}
          <h3 className="font-semibold text-sm line-clamp-2 leading-tight">
            {item.name}
          </h3>

          {/* Price */}
          <div className="flex items-baseline gap-1.5">
            <span className="text-primary font-bold text-sm">
              {formatNGN(discounted)}
            </span>
            {hasDiscount && (
              <span className="text-[11px] text-muted-foreground line-through">
                {formatNGN(item.price)}
              </span>
            )}
          </div>

          {/* Delivery + location */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <Badge variant="outline" className="text-[9px] py-0 h-4">
              <Truck className="w-2.5 h-2.5 mr-1" />
              {DELIVERY_MODES[item.delivery_mode]}
            </Badge>
            {item.store?.location && (
              <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                <MapPin className="w-2.5 h-2.5" />
                {item.store.location}
              </span>
            )}
          </div>

          {/* ── Action row ────────────────────────────────────────────────── */}
          {mode === 'owner' ? (
            <div className="flex gap-2 pt-1">
              <Button
                size="sm"
                variant="outline"
                className="flex-1 h-8 text-xs"
                onClick={() => (actions as OwnerActions).onEdit(item)}
              >
                <Edit className="w-3 h-3 mr-1" /> Edit
              </Button>

              <Button
                size="sm"
                variant="outline"
                className="h-8 w-8 p-0 text-primary border-primary/30 hover:bg-primary/10"
                onClick={() => (actions as OwnerActions).onViewOnMap()}
                title="View on Map"
              >
                <MapIcon className="w-3.5 h-3.5" />
              </Button>

              <Button
                size="sm"
                variant="ghost"
                className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10"
                onClick={() => setConfirmDelete(true)}
                disabled={(actions as OwnerActions).isDeleting}
              >
                {(actions as OwnerActions).isDeleting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5 pt-1">
              {/* Primary CTA: Request this service — pre-fills a DM with item details */}
              {(actions as DiscoveryActions).onRequest && (
                <Button
                  size="sm"
                  className="w-full h-8 text-xs bg-primary text-white hover:bg-primary/90"
                  onClick={() =>
                    (actions as DiscoveryActions).onRequest!(item as any)
                  }
                >
                  <Send className="w-3 h-3 mr-1" /> Request this service
                </Button>
              )}
              <div className="flex gap-2">
                {item.store?.contact_phone && (
                  <Button
                    size="sm"
                    className="flex-1 h-8 text-xs bg-primary/10 text-primary hover:bg-primary/20 border-0"
                    onClick={() =>
                      (actions as DiscoveryActions).onContact(item.store!.contact_phone!)
                    }
                  >
                    <Phone className="w-3 h-3 mr-1" /> Call
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1 h-8 text-xs"
                  onClick={() => {
                    const s = item.store as any;
                    if (s?.latitude && s?.longitude) {
                      (actions as DiscoveryActions).onDirections(
                        s.latitude, s.longitude, item.name
                      );
                    }
                  }}
                >
                  <Navigation className="w-3 h-3 mr-1" /> Directions
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Delete confirmation ──────────────────────────────────────────── */}
      {mode === 'owner' && (
        <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove "{item.name}"?</AlertDialogTitle>
              <AlertDialogDescription>
                This item will be removed from your catalog and will no longer
                be discoverable on the map.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-white hover:bg-destructive/90"
                onClick={() => {
                  (actions as OwnerActions).onDelete(item.id);
                  setConfirmDelete(false);
                }}
              >
                Remove
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  );
}
