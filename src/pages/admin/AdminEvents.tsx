import { useState } from "react";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { 
  Search, 
  MoreHorizontal, 
  MapPin, 
  Trash2, 
  ExternalLink,
  Loader2
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

// --- Types ---
type EventRow = {
  id: string;
  title: string;
  start_date: string;
  location: string | null;
  is_public: boolean;
  creator_id: string;
  ticket_price: number | null;
  creator?: {
    display_name: string | null;
  }[];
};

export default function AdminEvents() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const pageSize = 20;

  // 1. Fetch Events
  const { data: events = [], isLoading } = useQuery<EventRow[]>({
    queryKey: ['admin_events', search, page],
    queryFn: async () => {
      let query = supabase
        .from('events')
        .select(`
          *,
          creator:profiles!creator_id(display_name)
        `)
        .order('start_date', { ascending: false })
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (search) {
        query = query.ilike('title', `%${search}%`);
      }

      const { data, error } = await query;
      if (error) {
        toast.error("Failed to load events");
        throw error;
      }
      return ((data || []) as unknown) as EventRow[];
    },
    placeholderData: keepPreviousData
  });

  // 2. Mutation: Delete Event
  const deleteEventMutation = useMutation({
    mutationFn: async (eventId: string) => {
      const { error } = await supabase
        .from('events')
        .delete()
        .eq('id', eventId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Event deleted permanently");
      queryClient.invalidateQueries({ queryKey: ['admin_events'] });
    },
    onError: () => toast.error("Failed to delete event")
  });

  // Helper for status badge
  const getEventStatus = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    if (date < now) return <Badge variant="secondary">Past</Badge>;
    if (date.toDateString() === now.toDateString()) return <Badge className="bg-green-500 animate-pulse">Today</Badge>;
    return <Badge variant="outline" className="text-blue-600 border-blue-200">Upcoming</Badge>;
  };

  return (
    <div className="space-y-6 pb-20">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Event Management</h2>
        <p className="text-muted-foreground">Monitor and manage all public & private gatherings.</p>
      </div>

      {/* Search Bar */}
      <div className="flex items-center space-x-2 bg-white p-2 rounded-lg shadow-sm border">
        <Search className="w-5 h-5 text-muted-foreground ml-2" />
        <Input 
          placeholder="Search events by title..." 
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border-0 focus-visible:ring-0"
        />
      </div>

      {/* Data Table */}
      <div className="rounded-md border bg-white shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Event Name</TableHead>
              <TableHead>Host</TableHead>
              <TableHead>Date / Status</TableHead>
              <TableHead>Price</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" />
                </TableCell>
              </TableRow>
            ) : events.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                  No events found.
                </TableCell>
              </TableRow>
            ) : (
              events.map((event) => (
                <TableRow key={event.id}>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium">{event.title}</span>
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <MapPin className="w-3 h-3" /> {event.location || 'No location'}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col text-sm">
                      <span>{event.creator?.[0]?.display_name || 'Unknown'}</span>
                      <span className="text-xs text-muted-foreground">ID: {event.creator_id.slice(0,6)}...</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1 items-start">
                      <span className="text-sm">{format(new Date(event.start_date), 'MMM d, yyyy')}</span>
                      {getEventStatus(event.start_date)}
                    </div>
                  </TableCell>
                  <TableCell>
                    {(event.ticket_price || 0) > 0 ? (
                      <span className="font-medium text-green-600">₦{(event.ticket_price || 0).toLocaleString()}</span>
                    ) : (
                      <span className="text-muted-foreground">Free</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-8 w-8 p-0">
                          <span className="sr-only">Open menu</span>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => window.open(`/app/events/${event.id}`, '_blank')}>
                          <ExternalLink className="mr-2 h-4 w-4" /> View Event
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          className="text-red-600"
                          onClick={() => deleteEventMutation.mutate(event.id)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" /> Delete Event
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex justify-end gap-2">
        <Button 
          variant="outline" 
          onClick={() => setPage(p => Math.max(0, p - 1))}
          disabled={page === 0 || isLoading}
        >
          Previous
        </Button>
        <Button 
          variant="outline" 
          onClick={() => setPage(p => p + 1)}
          disabled={events.length < pageSize || isLoading}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
