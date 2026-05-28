import { useState } from "react";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { 
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { 
  Search, MoreHorizontal, MapPin, Trash2, ExternalLink, Loader2,
  Calendar, Users, Ticket, TrendingUp, Zap, Video, Star
} from "lucide-react";
import { toast } from "sonner";
import { format, isPast, isToday } from "date-fns";

// ── Types ─────────────────────────────────────────────────────────────────────
type EventRow = {
  id: string;
  title: string;
  start_date: string;
  end_date: string | null;
  location: string | null;
  is_public: boolean;
  is_official: boolean;
  is_boosted: boolean;
  creator_id: string;
  ticket_price: number | null;
  max_attendees: number | null;
  event_type: 'physical' | 'virtual' | null;
  category: string | null;
  attendee_count?: number;
  creator?: { display_name: string | null }[];
};

// ── Status helper (mirrors Events.tsx logic) ──────────────────────────────────
const getEventStatus = (start: string, end: string | null) => {
  const now = new Date();
  const startDate = new Date(start);
  const endDate = end ? new Date(end) : new Date(startDate.getTime() + 2 * 60 * 60 * 1000);
  if (now >= startDate && now <= endDate)
    return <Badge className="bg-green-500 text-white border-0 animate-pulse text-[10px]">🟢 Happening Now</Badge>;
  if (isPast(endDate))
    return <Badge variant="secondary" className="text-[10px]">Past</Badge>;
  if (isToday(startDate))
    return <Badge className="bg-orange-500 text-white border-0 text-[10px]">Today</Badge>;
  return <Badge variant="outline" className="text-blue-600 border-blue-200 text-[10px]">Upcoming</Badge>;
};

// ── Stat tile ────────────────────────────────────────────────────────────────
function StatTile({ icon: Icon, label, value, sub, color = "text-muted-foreground" }: {
  icon: any; label: string; value: string | number; sub?: string; color?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-muted-foreground">{label}</span>
          <Icon className={`w-4 h-4 ${color}`} />
        </div>
        <p className="text-2xl font-bold">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  );
}

export default function AdminEvents() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [statusFilter, setStatusFilter] = useState<'all' | 'upcoming' | 'past' | 'today' | 'official'>('all');
  const pageSize = 20;

  // ── Fetch events with attendee counts ─────────────────────────────────────
  const { data: events = [], isLoading } = useQuery<EventRow[]>({
    queryKey: ['admin_events', search, page, statusFilter],
    queryFn: async () => {
      let query = supabase
        .from('events')
        .select(`
          id, title, start_date, end_date, is_public, is_official, ticket_price,
          max_attendees, event_type, category, creator_id,
          creator:profiles!creator_id(display_name)
        `)
        .order('start_date', { ascending: false })
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (search) query = query.ilike('title', `%${search}%`);
      if (statusFilter === 'upcoming') query = query.gt('start_date', new Date().toISOString());
      if (statusFilter === 'past')     query = query.lt('start_date', new Date().toISOString());
      if (statusFilter === 'today') {
        const start = new Date(); start.setHours(0, 0, 0, 0);
        const end   = new Date(); end.setHours(23, 59, 59, 999);
        query = query.gte('start_date', start.toISOString()).lte('start_date', end.toISOString());
      }
      if (statusFilter === 'official') query = query.eq('is_official', true);

      const { data, error } = await query;
      if (error) { toast.error("Failed to load events"); throw error; }

      // Fetch attendee counts in one query
      const ids = (data || []).map(e => e.id);
      const { data: counts } = ids.length
        ? await supabase.from('event_attendees').select('event_id').in('event_id', ids)
        : { data: [] as any[] };
      
      const countMap = (counts || []).reduce((acc: Record<string, number>, row: any) => {
        acc[row.event_id] = (acc[row.event_id] || 0) + 1;
        return acc;
      }, {});

      return ((data || []) as unknown as EventRow[]).map(e => ({
        ...e,
        attendee_count: countMap[e.id] || 0,
      }));
    },
    placeholderData: keepPreviousData,
  });

  // ── Stats ─────────────────────────────────────────────────────────────────
  const { data: statsData } = useQuery({
    queryKey: ['admin_events_stats'],
    queryFn: async () => {
      const [total, upcoming, official, revenue] = await Promise.all([
        supabase.from('events').select('id', { count: 'exact', head: true }),
        supabase.from('events').select('id', { count: 'exact', head: true }).gt('start_date', new Date().toISOString()),
        supabase.from('events').select('id', { count: 'exact', head: true }).eq('is_official', true),
        supabase.from('events').select('ticket_price').not('ticket_price', 'is', null).gt('ticket_price', 0),
      ]);
      return {
        total: total.count || 0,
        upcoming: upcoming.count || 0,
        official: official.count || 0,
        revenue: (revenue.data || []).reduce((sum: number, e: any) => sum + (e.ticket_price || 0), 0),
      };
    },
  });

  // ── Delete event ──────────────────────────────────────────────────────────
  const deleteEventMutation = useMutation({
    mutationFn: async (eventId: string) => {
      const { error } = await supabase.from('events').delete().eq('id', eventId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Event deleted");
      queryClient.invalidateQueries({ queryKey: ['admin_events'] });
      queryClient.invalidateQueries({ queryKey: ['admin_events_stats'] });
    },
    onError: () => toast.error("Failed to delete event"),
  });

  // ── Toggle official ───────────────────────────────────────────────────────
  const toggleOfficialMutation = useMutation({
    mutationFn: async ({ id, is_official }: { id: string; is_official: boolean }) => {
      const { error } = await supabase.from('events').update({ is_official }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Event updated");
      queryClient.invalidateQueries({ queryKey: ['admin_events'] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const FILTERS: { label: string; value: typeof statusFilter }[] = [
    { label: 'All', value: 'all' },
    { label: 'Upcoming', value: 'upcoming' },
    { label: 'Today', value: 'today' },
    { label: 'Past', value: 'past' },
    { label: 'Official', value: 'official' },
  ];

  return (
    <div className="space-y-5 pb-20 max-w-5xl">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Event Management</h2>
        <p className="text-sm text-muted-foreground">Monitor, manage and toggle official status for all events.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatTile icon={Calendar}    label="Total Events"    value={statsData?.total    ?? '—'} color="text-primary" />
        <StatTile icon={TrendingUp}  label="Upcoming"        value={statsData?.upcoming ?? '—'} color="text-blue-500" />
        <StatTile icon={Star}        label="Official Events" value={statsData?.official ?? '—'} color="text-yellow-500" />
        <StatTile icon={Ticket}      label="Ticket Revenue"  value={statsData ? `₦${(statsData.revenue).toLocaleString()}` : '—'} color="text-green-500" />
      </div>

      {/* Search + filter bar */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search events by title..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            className="pl-9"
          />
        </div>
        <div className="flex gap-1 flex-wrap">
          {FILTERS.map(f => (
            <Button
              key={f.value}
              size="sm"
              variant={statusFilter === f.value ? 'default' : 'outline'}
              className="h-9 text-xs"
              onClick={() => { setStatusFilter(f.value); setPage(0); }}
            >
              {f.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border overflow-hidden bg-background shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30">
              <TableHead>Event</TableHead>
              <TableHead>Host</TableHead>
              <TableHead>Date / Status</TableHead>
              <TableHead>Attendees</TableHead>
              <TableHead>Price</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center">
                  <Loader2 className="w-5 h-5 animate-spin mx-auto text-primary" />
                </TableCell>
              </TableRow>
            ) : events.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center text-muted-foreground text-sm">
                  No events found.
                </TableCell>
              </TableRow>
            ) : events.map((event) => (
              <TableRow key={event.id} className="hover:bg-muted/20">
                <TableCell className="max-w-[200px]">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-medium text-sm truncate">{event.title}</span>
                      {event.is_official && <Badge className="bg-primary/10 text-primary border-primary/20 text-[9px] px-1.5">Official</Badge>}
                      {event.event_type === 'virtual' && <Video className="w-3 h-3 text-cyan-500 shrink-0" />}
                    </div>
                    <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      <MapPin className="w-3 h-3 shrink-0" />
                      <span className="truncate">{event.event_type === 'virtual' ? 'Online' : (event.location || 'No location')}</span>
                    </div>
                    {event.category && (
                      <Badge variant="outline" className="text-[9px] px-1.5 py-0">{event.category}</Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="text-sm">
                    <p className="font-medium">{event.creator?.[0]?.display_name || 'Unknown'}</p>
                    <p className="text-[11px] text-muted-foreground font-mono">{event.creator_id.slice(0, 6)}…</p>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="space-y-1">
                    <p className="text-sm">{format(new Date(event.start_date), 'MMM d, yyyy')}</p>
                    <p className="text-[11px] text-muted-foreground">{format(new Date(event.start_date), 'h:mm a')}</p>
                    {getEventStatus(event.start_date, event.end_date)}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1 text-sm">
                    <Users className="w-3.5 h-3.5 text-muted-foreground" />
                    <span>{event.attendee_count || 0}</span>
                    {event.max_attendees && (
                      <span className="text-muted-foreground text-[11px]">/ {event.max_attendees}</span>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  {(event.ticket_price || 0) > 0
                    ? <span className="font-medium text-green-600 text-sm">₦{(event.ticket_price || 0).toLocaleString()}</span>
                    : <span className="text-muted-foreground text-sm">Free</span>}
                </TableCell>
                <TableCell className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" className="h-8 w-8 p-0">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => window.open(`/app/events/${event.id}`, '_blank')}>
                        <ExternalLink className="mr-2 h-4 w-4" /> View Event
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => toggleOfficialMutation.mutate({ id: event.id, is_official: !event.is_official })}
                      >
                        <Zap className="mr-2 h-4 w-4" />
                        {event.is_official ? 'Remove Official' : 'Mark Official'}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-red-600 focus:text-red-600"
                        onClick={() => deleteEventMutation.mutate(event.id)}
                      >
                        {deleteEventMutation.isPending && deleteEventMutation.variables === event.id
                          ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          : <Trash2 className="mr-2 h-4 w-4" />}
                        Delete Event
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Page {page + 1} · {events.length} results
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0 || isLoading}>
            Previous
          </Button>
          <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={events.length < pageSize || isLoading}>
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
