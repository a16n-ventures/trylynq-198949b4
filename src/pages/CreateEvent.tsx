import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { 
  Calendar, MapPin, DollarSign, ArrowLeft, Image as ImageIcon, 
  Loader2, X, Video, MapPinned, Share2, Link2, Copy, Check, Megaphone
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const CreateEvent = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [createdEventId, setCreatedEventId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Validation errors
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [eventData, setEventData] = useState({
    title: '',
    description: '',
    date: '',
    time: '',
    location: '',
    capacity: '',
    price: '',
    category: '',
    isPrivate: false,
    requireApproval: false,
    isSponsored: false, // [MODIFIED: Added isSponsored state]
    eventType: 'physical', // 'physical' or 'virtual'
    meetingLink: '', // For virtual events
  });

  const categories = [
    'Study Group',
    'Social Hangout',
    'Sports & Fitness',
    'Food & Dining',
    'Entertainment',
    'Networking',
    'Other'
  ];

  // Input validation
  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!eventData.title.trim()) {
      newErrors.title = 'Event title is required';
    } else if (eventData.title.length < 5) {
      newErrors.title = 'Title must be at least 5 characters';
    } else if (eventData.title.length > 100) {
      newErrors.title = 'Title must be less than 100 characters';
    }

    if (!eventData.description.trim()) {
      newErrors.description = 'Description is required';
    } else if (eventData.description.length < 10) {
      newErrors.description = 'Description must be at least 10 characters';
    }

    if (!eventData.category) {
      newErrors.category = 'Please select a category';
    }

    if (!eventData.date) {
      newErrors.date = 'Date is required';
    } else {
      const selectedDate = new Date(`${eventData.date}T${eventData.time || '00:00'}`);
      const now = new Date();
      if (selectedDate < now) {
        newErrors.date = 'Event date must be in the future';
      }
    }

    if (!eventData.time) {
      newErrors.time = 'Time is required';
    }

    if (!eventData.location.trim()) {
      newErrors.location = 'Location is required';
    }

    if (eventData.capacity && parseInt(eventData.capacity) < 1) {
      newErrors.capacity = 'Capacity must be at least 1';
    }

    if (eventData.capacity && parseInt(eventData.capacity) > 10000) {
      newErrors.capacity = 'Capacity cannot exceed 10,000';
    }

    if (eventData.price && parseFloat(eventData.price) < 0) {
      newErrors.price = 'Price cannot be negative';
    }

    if (eventData.eventType === 'virtual' && eventData.meetingLink) {
      try {
        new URL(eventData.meetingLink);
      } catch {
        newErrors.meetingLink = 'Please enter a valid URL';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      
      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        toast.error('Image size must be less than 5MB');
        return;
      }

      // Validate file type
      if (!file.type.startsWith('image/')) {
        toast.error('Please select a valid image file');
        return;
      }

      setImageFile(file);
      setImagePreview(URL.createObjectURL(file));
    }
  };

  const removeImage = () => {
    setImageFile(null);
    setImagePreview(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user) {
      toast.error('You must be logged in to create an event');
      return;
    }

    // Validate form
    if (!validateForm()) {
      toast.error('Please fix the errors in the form');
      return;
    }

    setIsSubmitting(true);

    try {
      // 1. Handle Image Upload
      let imageUrl = null;
      if (imageFile) {
        const fileExt = imageFile.name.split('.').pop();
        const fileName = `${user.id}/${Date.now()}.${fileExt}`;
        
        const { error: uploadError } = await supabase.storage
          .from('event_images')
          .upload(fileName, imageFile);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('event_images')
          .getPublicUrl(fileName);
          
        imageUrl = publicUrl;
      }

      // 2. Construct Timestamp
      const startDateTime = new Date(`${eventData.date}T${eventData.time}`);
      if (isNaN(startDateTime.getTime())) {
        throw new Error("Invalid date or time format");
      }

      // 3. Insert Event
      const { data: newEvent, error } = await supabase
        .from('events')
        .insert({
          title: eventData.title.trim(),
          description: eventData.description.trim(),
          category: eventData.category,
          location: eventData.location.trim(),
          start_date: startDateTime.toISOString(),
          end_date: null,
          max_attendees: eventData.capacity ? parseInt(eventData.capacity) : null,
          ticket_price: eventData.price ? parseFloat(eventData.price) : 0,
          is_public: !eventData.isPrivate,
          requires_approval: eventData.requireApproval,
          is_sponsored: eventData.isSponsored, // [MODIFIED: Insert sponsored status]
          creator_id: user.id,
          image_url: imageUrl,
          event_type: eventData.eventType,
          meeting_link: eventData.eventType === 'virtual' ? eventData.meetingLink : null,
        })
        .select()
        .single();

      if (error) throw error;

      toast.success('Event created successfully!');
      
      // Invalidate queries
      await queryClient.invalidateQueries({ queryKey: ['events'] });

      // Show share dialog
      setCreatedEventId(newEvent.id);
      setShowShareDialog(true);
      
    } catch (error: any) {
      console.error('Error creating event:', error);
      toast.error('Failed to create event: ' + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Generate share links
  const getInAppLink = () => {
    if (!createdEventId) return '';
    return `${window.location.origin}/events/${createdEventId}`;
  };

  const getShareText = () => {
    return `Check out this event: ${eventData.title}`;
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success('Link copied to clipboard!');
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      toast.error('Failed to copy link');
    }
  };

  const handleExternalShare = async () => {
    const shareData = {
      title: eventData.title,
      text: getShareText(),
      url: getInAppLink(),
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        // Fallback to copying link
        await copyToClipboard(getInAppLink());
      }
    } catch (err) {
      console.error('Error sharing:', err);
    }
  };

  const handleDone = () => {
    setShowShareDialog(false);
    navigate('/app/events');
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <div className="gradient-primary text-white">
        <div className="container-mobile py-4">
          <div className="flex items-center gap-3 mb-4">
            <Button 
              variant="ghost" 
              size="sm" 
              className="text-white hover:bg-white/20 p-2"
              onClick={() => navigate('/app/events')}
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <h1 className="heading-lg text-white">Create Event</h1>
          </div>
        </div>
      </div>

      <div className="container-mobile py-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          
          {/* Image Upload */}
          <Card className="border-dashed border-2 border-muted-foreground/20 shadow-none bg-muted/5">
            <CardContent className="p-6 flex flex-col items-center justify-center text-center">
              {imagePreview ? (
                <div className="relative w-full aspect-video rounded-lg overflow-hidden group">
                  <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                  <Button
                    type="button"
                    variant="destructive"
                    size="icon"
                    className="absolute top-2 right-2"
                    onClick={removeImage}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                    <ImageIcon className="w-6 h-6 text-muted-foreground" />
                  </div>
                  <div className="text-sm text-muted-foreground">
                    <label htmlFor="image-upload" className="text-primary font-semibold cursor-pointer hover:underline">
                      Click to upload
                    </label> a cover image
                    <p className="text-xs mt-1">Max 5MB • JPG, PNG, WebP</p>
                    <input 
                      id="image-upload" 
                      type="file" 
                      accept="image/*" 
                      className="hidden" 
                      onChange={handleImageSelect}
                    />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Event Type */}
          <Card className="gradient-card shadow-card border-0">
            <CardHeader className="pb-3">
              <CardTitle className="heading-lg">Event Type</CardTitle>
            </CardHeader>
            <CardContent>
              <RadioGroup 
                value={eventData.eventType} 
                onValueChange={(value) => setEventData({...eventData, eventType: value})}
                className="grid grid-cols-2 gap-4"
              >
                <div>
                  <RadioGroupItem value="physical" id="physical" className="peer sr-only" />
                  <Label
                    htmlFor="physical"
                    className="flex flex-col items-center justify-between rounded-lg border-2 border-muted bg-background p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer"
                  >
                    <MapPinned className="mb-3 h-6 w-6" />
                    <span className="font-semibold">Physical</span>
                    <span className="text-xs text-muted-foreground mt-1">In-person event</span>
                  </Label>
                </div>
                <div>
                  <RadioGroupItem value="virtual" id="virtual" className="peer sr-only" />
                  <Label
                    htmlFor="virtual"
                    className="flex flex-col items-center justify-between rounded-lg border-2 border-muted bg-background p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer"
                  >
                    <Video className="mb-3 h-6 w-6" />
                    <span className="font-semibold">Virtual</span>
                    <span className="text-xs text-muted-foreground mt-1">Online event</span>
                  </Label>
                </div>
              </RadioGroup>
            </CardContent>
          </Card>

          {/* Basic Info */}
          <Card className="gradient-card shadow-card border-0">
            <CardHeader className="pb-3">
              <CardTitle className="heading-lg">Event Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="title">Event Title *</Label>
                <Input
                  id="title"
                  placeholder="What's your event about?"
                  value={eventData.title}
                  onChange={(e) => {
                    setEventData({...eventData, title: e.target.value});
                    if (errors.title) setErrors({...errors, title: ''});
                  }}
                  className={errors.title ? 'border-red-500' : ''}
                />
                {errors.title && <p className="text-xs text-red-500 mt-1">{errors.title}</p>}
              </div>

              <div>
                <Label htmlFor="description">Description *</Label>
                <Textarea
                  id="description"
                  placeholder="Tell people more about your event..."
                  value={eventData.description}
                  onChange={(e) => {
                    setEventData({...eventData, description: e.target.value});
                    if (errors.description) setErrors({...errors, description: ''});
                  }}
                  className={`min-h-[100px] ${errors.description ? 'border-red-500' : ''}`}
                />
                <div className="flex justify-between items-center mt-1">
                  {errors.description && <p className="text-xs text-red-500">{errors.description}</p>}
                  <p className="text-xs text-muted-foreground ml-auto">
                    {eventData.description.length} / 1000
                  </p>
                </div>
              </div>

              <div>
                <Label htmlFor="category">Category *</Label>
                <Select 
                  onValueChange={(value) => {
                    setEventData({...eventData, category: value});
                    if (errors.category) setErrors({...errors, category: ''});
                  }}
                  value={eventData.category}
                >
                  <SelectTrigger className={errors.category ? 'border-red-500' : ''}>
                    <SelectValue placeholder="Select a category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((category) => (
                      <SelectItem key={category} value={category}>
                        {category}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.category && <p className="text-xs text-red-500 mt-1">{errors.category}</p>}
              </div>
            </CardContent>
          </Card>

          {/* Date & Time */}
          <Card className="gradient-card shadow-card border-0">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2">
                <Calendar className="w-5 h-5" />
                When
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="date">Date *</Label>
                  <Input
                    id="date"
                    type="date"
                    value={eventData.date}
                    onChange={(e) => {
                      setEventData({...eventData, date: e.target.value});
                      if (errors.date) setErrors({...errors, date: ''});
                    }}
                    min={new Date().toISOString().split('T')[0]}
                    className={errors.date ? 'border-red-500' : ''}
                  />
                  {errors.date && <p className="text-xs text-red-500 mt-1">{errors.date}</p>}
                </div>
                <div>
                  <Label htmlFor="time">Time *</Label>
                  <Input
                    id="time"
                    type="time"
                    value={eventData.time}
                    onChange={(e) => {
                      setEventData({...eventData, time: e.target.value});
                      if (errors.time) setErrors({...errors, time: ''});
                    }}
                    className={errors.time ? 'border-red-500' : ''}
                  />
                  {errors.time && <p className="text-xs text-red-500 mt-1">{errors.time}</p>}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Location / Meeting Link */}
          <Card className="gradient-card shadow-card border-0">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2">
                {eventData.eventType === 'physical' ? (
                  <>
                    <MapPin className="w-5 h-5" />
                    Where
                  </>
                ) : (
                  <>
                    <Video className="w-5 h-5" />
                    Meeting Details
                  </>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="location">
                  {eventData.eventType === 'physical' ? 'Location *' : 'Event Platform *'}
                </Label>
                <Input
                  id="location"
                  placeholder={eventData.eventType === 'physical' 
                    ? "Where will your event take place?" 
                    : "e.g., Zoom, Google Meet, Microsoft Teams"
                  }
                  value={eventData.location}
                  onChange={(e) => {
                    setEventData({...eventData, location: e.target.value});
                    if (errors.location) setErrors({...errors, location: ''});
                  }}
                  className={errors.location ? 'border-red-500' : ''}
                />
                {errors.location && <p className="text-xs text-red-500 mt-1">{errors.location}</p>}
              </div>

              {eventData.eventType === 'virtual' && (
                <div>
                  <Label htmlFor="meetingLink">Meeting Link (Optional)</Label>
                  <Input
                    id="meetingLink"
                    type="url"
                    placeholder="https://zoom.us/j/123456789"
                    value={eventData.meetingLink}
                    onChange={(e) => {
                      setEventData({...eventData, meetingLink: e.target.value});
                      if (errors.meetingLink) setErrors({...errors, meetingLink: ''});
                    }}
                    className={errors.meetingLink ? 'border-red-500' : ''}
                  />
                  {errors.meetingLink && <p className="text-xs text-red-500 mt-1">{errors.meetingLink}</p>}
                  <p className="text-xs text-muted-foreground mt-1">
                    Add your meeting link or generate one later
                  </p>
                </div>
              )}

              {eventData.eventType === 'physical' && (
                <div className="bg-blue-50 dark:bg-blue-950/30 p-3 rounded-lg">
                  <p className="text-xs text-blue-900 dark:text-blue-100">
                    💡 Tip: Include specific venue details like building name, room number, or landmarks
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Capacity & Pricing */}
          <Card className="gradient-card shadow-card border-0">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="w-5 h-5" />
                Tickets & Pricing
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="capacity">Max Attendees</Label>
                  <Input
                    id="capacity"
                    type="number"
                    placeholder="Unlimited"
                    value={eventData.capacity}
                    onChange={(e) => {
                      setEventData({...eventData, capacity: e.target.value});
                      if (errors.capacity) setErrors({...errors, capacity: ''});
                    }}
                    min="1"
                    max="10000"
                    className={errors.capacity ? 'border-red-500' : ''}
                  />
                  {errors.capacity && <p className="text-xs text-red-500 mt-1">{errors.capacity}</p>}
                </div>
                <div>
                  <Label htmlFor="price">Ticket Price (₦)</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">₦</span>
                    <Input
                      id="price"
                      type="number"
                      placeholder="0.00"
                      step="0.01"
                      min="0"
                      value={eventData.price}
                      onChange={(e) => {
                        setEventData({...eventData, price: e.target.value});
                        if (errors.price) setErrors({...errors, price: ''});
                      }}
                      className={`pl-8 ${errors.price ? 'border-red-500' : ''}`}
                    />
                  </div>
                  {errors.price && <p className="text-xs text-red-500 mt-1">{errors.price}</p>}
                </div>
              </div>
              
              {parseFloat(eventData.price) > 0 && (
                <div className="bg-muted/50 p-4 rounded-lg space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Platform Fee (2%)</span>
                    <span>- ₦{(parseFloat(eventData.price) * 0.02).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between font-semibold pt-2 border-t border-border">
                    <span>You Receive</span>
                    <span className="text-green-600">₦{(parseFloat(eventData.price) * 0.98).toFixed(2)}</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Sponsorship & Promotion - [MODIFIED: Added Sponsorship Section] */}
          <Card className="gradient-card shadow-card border-0">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2">
                <Megaphone className="w-5 h-5" />
                Sponsorship & Promotion
              </CardTitle>
            </CardHeader>
            <CardContent>
               <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="sponsor">Sponsor Event</Label>
                  <p className="text-sm text-muted-foreground">Promote this event to a wider audience</p>
                </div>
                <Switch
                  id="sponsor"
                  checked={eventData.isSponsored}
                  onCheckedChange={(checked) => setEventData({...eventData, isSponsored: checked})}
                />
              </div>
            </CardContent>
          </Card>

          {/* Privacy Settings */}
          <Card className="gradient-card shadow-card border-0">
            <CardHeader className="pb-3">
              <CardTitle>Privacy Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="private">Private Event</Label>
                  <p className="text-sm text-muted-foreground">Only invited friends can see this</p>
                </div>
                <Switch
                  id="private"
                  checked={eventData.isPrivate}
                  onCheckedChange={(checked) => setEventData({...eventData, isPrivate: checked})}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="approval">Require Approval</Label>
                  <p className="text-sm text-muted-foreground">Manually approve attendees</p>
                </div>
                <Switch
                  id="approval"
                  checked={eventData.requireApproval}
                  onCheckedChange={(checked) => setEventData({...eventData, requireApproval: checked})}
                />
              </div>
            </CardContent>
          </Card>

          {/* Submit Button */}
          <div className="grid grid-cols-2 gap-4 sticky bottom-4 z-10">
            <Button 
              type="button" 
              variant="outline"
              onClick={() => navigate('/app/events')}
              disabled={isSubmitting}
              className="bg-background/80 backdrop-blur-sm"
            >
              Cancel
            </Button>
            <Button 
              type="submit" 
              className="gradient-primary text-white shadow-lg"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                'Create Event'
              )}
            </Button>
          </div>
        </form>
      </div>

      {/* Share Dialog */}
      <Dialog open={showShareDialog} onOpenChange={setShowShareDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Event Created Successfully! 🎉</DialogTitle>
            <DialogDescription>
              Share your event with friends and start getting attendees
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* In-App Link */}
            <div>
              <Label className="text-sm font-medium mb-2 block">In-App Link</Label>
              <div className="flex items-center gap-2">
                <Input
                  value={getInAppLink()}
                  readOnly
                  className="flex-1 bg-muted"
                />
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  onClick={() => copyToClipboard(getInAppLink())}
                >
                  {copied ? (
                    <Check className="h-4 w-4 text-green-500" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Share this link with users on the platform
              </p>
            </div>

            {/* Action Buttons */}
            <div className="grid grid-cols-2 gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={handleExternalShare}
                className="w-full"
              >
                <Share2 className="w-4 h-4 mr-2" />
                Share External
              </Button>
              <Button
                type="button"
                onClick={() => {
                  navigate(`/app/events/${createdEventId}/invite`);
                }}
                className="w-full"
              >
                <Link2 className="w-4 h-4 mr-2" />
                Invite Friends
              </Button>
            </div>

            <Button
              type="button"
              variant="secondary"
              onClick={handleDone}
              className="w-full"
            >
              Done
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CreateEvent;
