import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Search, MapPin, Phone, Truck, Clock, Store as StoreIcon, Tag, Loader2, Plus } from 'lucide-react';
import { StoreItem, Store, STORE_CATEGORIES, DELIVERY_MODES } from '@/types/marketplace';
import StoreFormDialog from '@/components/StoreFormDialog';
import ItemFormDialog from '@/components/ItemFormDialog';

export default function Marketplace() {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string>('all');
  const [selectedItem, setSelectedItem] = useState<(StoreItem & { store: Store }) | null>(null);

  // Fetch items with store info
  const { data: items = [], isLoading } = useQuery({
    queryKey: ['marketplace_items', search, category],
    queryFn: async () => {
      let query = (supabase.from('store_items') as any)
        .select(`
          *,
          store:stores!store_id(*)
        `)
        .eq('is_available', true)
        .order('created_at', { ascending: false });

      if (search) {
        query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%`);
      }

      const { data, error } = await query;
      if (error) throw error;

      // Filter by category on client if needed
      let filtered = data || [];
      if (category && category !== 'all') {
        filtered = filtered.filter((item: any) => item.store?.category === category);
      }

      return filtered as (StoreItem & { store: Store })[];
    }
  });

  const calculateDiscountedPrice = (price: number, discount: number) => {
    return price - (price * discount / 100);
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
      minimumFractionDigits: 0
    }).format(price);
  };

  return (
    <div className="container-mobile py-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold">Marketplace</h1>
          <p className="text-sm text-muted-foreground">Discover amazing deals near you</p>
        </div>
        <div className="flex gap-2">
          <StoreFormDialog trigger={
            <Button size="sm" variant="outline">
              <Plus className="w-4 h-4 mr-1" /> Store
            </Button>
          } />
          <ItemFormDialog trigger={
            <Button size="sm">
              <Plus className="w-4 h-4 mr-1" /> Item
            </Button>
          } />
        </div>
      </div>

      {/* Search & Filter */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search items..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-32">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            {STORE_CATEGORIES.map((cat) => (
              <SelectItem key={cat} value={cat}>{cat}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Items Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-12">
          <StoreIcon className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">No items found</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {items.map((item) => (
            <Card
              key={item.id}
              className="overflow-hidden cursor-pointer hover:shadow-lg transition-shadow"
              onClick={() => setSelectedItem(item)}
            >
              {/* Image */}
              <div className="relative aspect-square bg-muted">
                {item.image_url ? (
                  <img
                    src={item.image_url}
                    alt={item.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Tag className="w-8 h-8 text-muted-foreground" />
                  </div>
                )}
                {item.discount_percent > 0 && (
                  <Badge className="absolute top-2 right-2 bg-red-500">
                    -{item.discount_percent}%
                  </Badge>
                )}
              </div>

              <CardContent className="p-3 space-y-1">
                {/* Store Name */}
                <p className="text-[10px] text-muted-foreground truncate">
                  {item.store?.name || 'Unknown Store'}
                </p>

                {/* Item Name */}
                <h3 className="font-medium text-sm line-clamp-2 leading-tight">
                  {item.name}
                </h3>

                {/* Price */}
                <div className="flex items-baseline gap-1">
                  <span className="text-primary font-bold">
                    {formatPrice(calculateDiscountedPrice(item.price, item.discount_percent))}
                  </span>
                  {item.discount_percent > 0 && (
                    <span className="text-xs text-muted-foreground line-through">
                      {formatPrice(item.price)}
                    </span>
                  )}
                </div>

                {/* Delivery Mode Badge */}
                <Badge variant="outline" className="text-[9px] py-0">
                  {DELIVERY_MODES[item.delivery_mode]}
                </Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Item Detail Modal */}
      <Dialog open={!!selectedItem} onOpenChange={(open) => !open && setSelectedItem(null)}>
        <DialogContent className="sm:max-w-[480px] max-w-[calc(100vw-2rem)] my-auto mx-auto max-h-[85vh] overflow-y-auto">
          {selectedItem && (
            <>
              <DialogHeader>
                <DialogTitle>{selectedItem.name}</DialogTitle>
              </DialogHeader>

              <div className="space-y-4">
                {/* Image */}
                <div className="aspect-video bg-muted rounded-lg overflow-hidden">
                  {selectedItem.image_url ? (
                    <img
                      src={selectedItem.image_url}
                      alt={selectedItem.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Tag className="w-12 h-12 text-muted-foreground" />
                    </div>
                  )}
                </div>

                {/* Price Section */}
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-primary">
                    {formatPrice(calculateDiscountedPrice(selectedItem.price, selectedItem.discount_percent))}
                  </span>
                  {selectedItem.discount_percent > 0 && (
                    <>
                      <span className="text-lg text-muted-foreground line-through">
                        {formatPrice(selectedItem.price)}
                      </span>
                      <Badge className="bg-red-500">-{selectedItem.discount_percent}%</Badge>
                    </>
                  )}
                </div>

                {/* Description */}
                {selectedItem.description && (
                  <p className="text-sm text-muted-foreground">{selectedItem.description}</p>
                )}

                {/* Store Info */}
                <Card className="bg-muted/50">
                  <CardContent className="p-3 space-y-3">
                    <div className="flex items-center gap-3">
                      <Avatar className="w-10 h-10">
                        <AvatarImage src={selectedItem.store?.logo_url || undefined} />
                        <AvatarFallback>
                          {selectedItem.store?.name?.[0] || 'S'}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium">{selectedItem.store?.name}</p>
                        <p className="text-xs text-muted-foreground">{selectedItem.store?.category}</p>
                      </div>
                    </div>

                    {selectedItem.store?.location && (
                      <div className="flex items-center gap-2 text-sm">
                        <MapPin className="w-4 h-4 text-muted-foreground" />
                        <span>{selectedItem.store.location}</span>
                      </div>
                    )}

                    {selectedItem.store?.contact_phone && (
                      <div className="flex items-center gap-2 text-sm">
                        <Phone className="w-4 h-4 text-muted-foreground" />
                        <a href={`tel:${selectedItem.store.contact_phone}`} className="text-primary underline">
                          {selectedItem.store.contact_phone}
                        </a>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Delivery Info */}
                <div className="grid grid-cols-2 gap-3">
                  <Card className="bg-muted/50">
                    <CardContent className="p-3 flex items-center gap-2">
                      <Truck className="w-5 h-5 text-primary" />
                      <div>
                        <p className="text-xs text-muted-foreground">Delivery Mode</p>
                        <p className="text-sm font-medium">{DELIVERY_MODES[selectedItem.delivery_mode]}</p>
                      </div>
                    </CardContent>
                  </Card>
                  <Card className="bg-muted/50">
                    <CardContent className="p-3 flex items-center gap-2">
                      <Clock className="w-5 h-5 text-primary" />
                      <div>
                        <p className="text-xs text-muted-foreground">Delivery</p>
                        <p className="text-sm font-medium">Max {selectedItem.max_delivery_days} days</p>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Contact Button */}
                {selectedItem.store?.contact_phone && (
                  <Button className="w-full" asChild>
                    <a href={`tel:${selectedItem.store.contact_phone}`}>
                      <Phone className="w-4 h-4 mr-2" />
                      Contact Seller
                    </a>
                  </Button>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
