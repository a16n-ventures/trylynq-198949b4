export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      admin_notifications: {
        Row: {
          body: string | null
          created_at: string | null
          id: string
          is_read: boolean | null
          meta: Json | null
          title: string | null
          type: string | null
        }
        Insert: {
          body?: string | null
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          meta?: Json | null
          title?: string | null
          type?: string | null
        }
        Update: {
          body?: string | null
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          meta?: Json | null
          title?: string | null
          type?: string | null
        }
        Relationships: []
      }
      advertisements: {
        Row: {
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          image_url: string | null
          is_active: boolean | null
          link_url: string
          placement: string
          title: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          link_url: string
          placement?: string
          title: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          link_url?: string
          placement?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          description: string | null
          key: string
          updated_at: string | null
          updated_by: string | null
          value: Json
        }
        Insert: {
          description?: string | null
          key: string
          updated_at?: string | null
          updated_by?: string | null
          value: Json
        }
        Update: {
          description?: string | null
          key?: string
          updated_at?: string | null
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      blocked_users: {
        Row: {
          blocked_id: string
          blocker_id: string
          created_at: string
          id: string
          reason: string | null
        }
        Insert: {
          blocked_id: string
          blocker_id: string
          created_at?: string
          id?: string
          reason?: string | null
        }
        Update: {
          blocked_id?: string
          blocker_id?: string
          created_at?: string
          id?: string
          reason?: string | null
        }
        Relationships: []
      }
      broadcast_changes_for_table: {
        Row: {
          created_at: string
          id: string
        }
        Insert: {
          created_at?: string
          id: string
        }
        Update: {
          created_at?: string
          id?: string
        }
        Relationships: []
      }
      checkins: {
        Row: {
          created_at: string | null
          description: string | null
          event_id: string | null
          id: string
          is_public: boolean | null
          latitude: number | null
          location_name: string
          longitude: number | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          event_id?: string | null
          id?: string
          is_public?: boolean | null
          latitude?: number | null
          location_name: string
          longitude?: number | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          event_id?: string | null
          id?: string
          is_public?: boolean | null
          latitude?: number | null
          location_name?: string
          longitude?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "checkins_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_stats"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "checkins_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkins_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "checkins_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      city_milestones: {
        Row: {
          center_lat: number
          center_long: number
          city_name: string
          created_at: string | null
          current_count: number | null
          id: string
          is_unlocked: boolean | null
          radius_km: number | null
          target_count: number | null
        }
        Insert: {
          center_lat: number
          center_long: number
          city_name: string
          created_at?: string | null
          current_count?: number | null
          id?: string
          is_unlocked?: boolean | null
          radius_km?: number | null
          target_count?: number | null
        }
        Update: {
          center_lat?: number
          center_long?: number
          city_name?: string
          created_at?: string | null
          current_count?: number | null
          id?: string
          is_unlocked?: boolean | null
          radius_km?: number | null
          target_count?: number | null
        }
        Relationships: []
      }
      city_pioneers: {
        Row: {
          city_name: string
          id: string
          joined_at: string | null
          user_id: string | null
        }
        Insert: {
          city_name: string
          id?: string
          joined_at?: string | null
          user_id?: string | null
        }
        Update: {
          city_name?: string
          id?: string
          joined_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      comment_likes: {
        Row: {
          comment_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          comment_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          comment_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comment_likes_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "post_comments"
            referencedColumns: ["id"]
          },
        ]
      }
      communities: {
        Row: {
          cover_url: string | null
          created_at: string | null
          creator_id: string | null
          description: string | null
          id: string
          is_premium: boolean | null
          join_fee: number | null
          member_count: number | null
          name: string
        }
        Insert: {
          cover_url?: string | null
          created_at?: string | null
          creator_id?: string | null
          description?: string | null
          id?: string
          is_premium?: boolean | null
          join_fee?: number | null
          member_count?: number | null
          name: string
        }
        Update: {
          cover_url?: string | null
          created_at?: string | null
          creator_id?: string | null
          description?: string | null
          id?: string
          is_premium?: boolean | null
          join_fee?: number | null
          member_count?: number | null
          name?: string
        }
        Relationships: []
      }
      community_members: {
        Row: {
          community_id: string | null
          id: string
          joined_at: string | null
          muted_until: string | null
          role: string | null
          user_id: string | null
        }
        Insert: {
          community_id?: string | null
          id?: string
          joined_at?: string | null
          muted_until?: string | null
          role?: string | null
          user_id?: string | null
        }
        Update: {
          community_id?: string | null
          id?: string
          joined_at?: string | null
          muted_until?: string | null
          role?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "community_members_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "community_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      community_message_reactions: {
        Row: {
          created_at: string
          emoji: string
          id: string
          message_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          emoji: string
          id?: string
          message_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          emoji?: string
          id?: string
          message_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_message_reactions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "community_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      community_messages: {
        Row: {
          community_id: string | null
          content: string | null
          created_at: string | null
          id: string
          image_url: string | null
          is_deleted: boolean | null
          is_pinned: boolean
          reply_to_id: string | null
          sender_id: string | null
          updated_at: string | null
        }
        Insert: {
          community_id?: string | null
          content?: string | null
          created_at?: string | null
          id?: string
          image_url?: string | null
          is_deleted?: boolean | null
          is_pinned?: boolean
          reply_to_id?: string | null
          sender_id?: string | null
          updated_at?: string | null
        }
        Update: {
          community_id?: string | null
          content?: string | null
          created_at?: string | null
          id?: string
          image_url?: string | null
          is_deleted?: boolean | null
          is_pinned?: boolean
          reply_to_id?: string | null
          sender_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "community_messages_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_messages_reply_to_id_fkey"
            columns: ["reply_to_id"]
            isOneToOne: false
            referencedRelation: "community_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "community_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      contacts: {
        Row: {
          created_at: string
          id: string
          invited_at: string | null
          is_app_user: boolean | null
          matched_user_id: string | null
          name: string
          phone: string | null
          user_id: string
          username: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          invited_at?: string | null
          is_app_user?: boolean | null
          matched_user_id?: string | null
          name: string
          phone?: string | null
          user_id: string
          username?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          invited_at?: string | null
          is_app_user?: boolean | null
          matched_user_id?: string | null
          name?: string
          phone?: string | null
          user_id?: string
          username?: string | null
        }
        Relationships: []
      }
      event_attendees: {
        Row: {
          created_at: string
          event_id: string
          id: string
          status: string
          ticket_tier_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          status?: string
          ticket_tier_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          status?: string
          ticket_tier_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_attendees_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_stats"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "event_attendees_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_attendees_ticket_tier_id_fkey"
            columns: ["ticket_tier_id"]
            isOneToOne: false
            referencedRelation: "event_ticket_tiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_attendees_user_profile_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "event_attendees_user_profile_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      event_chats: {
        Row: {
          created_at: string | null
          event_id: string
          id: string
          message: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          event_id: string
          id?: string
          message: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          event_id?: string
          id?: string
          message?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_chats_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_stats"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "event_chats_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_invitations: {
        Row: {
          created_at: string | null
          event_id: string
          id: string
          invitee_id: string
          inviter_id: string
          status: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          event_id: string
          id?: string
          invitee_id: string
          inviter_id: string
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          event_id?: string
          id?: string
          invitee_id?: string
          inviter_id?: string
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_invitations_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_stats"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "event_invitations_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_invitations_invitee_id_fkey"
            columns: ["invitee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "event_invitations_invitee_id_fkey"
            columns: ["invitee_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "event_invitations_inviter_id_fkey"
            columns: ["inviter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "event_invitations_inviter_id_fkey"
            columns: ["inviter_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      event_locations: {
        Row: {
          created_at: string | null
          event_id: string
          formatted_address: string | null
          latitude: number | null
          location_name: string
          longitude: number | null
          place_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          event_id: string
          formatted_address?: string | null
          latitude?: number | null
          location_name: string
          longitude?: number | null
          place_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          event_id?: string
          formatted_address?: string | null
          latitude?: number | null
          location_name?: string
          longitude?: number | null
          place_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_locations_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: true
            referencedRelation: "event_stats"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "event_locations_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: true
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_recordings: {
        Row: {
          created_at: string | null
          description: string | null
          duration: number | null
          event_id: string
          file_size: number | null
          file_url: string
          id: string
          is_public: boolean | null
          recorded_by: string
          recording_type: string | null
          title: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          duration?: number | null
          event_id: string
          file_size?: number | null
          file_url: string
          id?: string
          is_public?: boolean | null
          recorded_by: string
          recording_type?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          duration?: number | null
          event_id?: string
          file_size?: number | null
          file_url?: string
          id?: string
          is_public?: boolean | null
          recorded_by?: string
          recording_type?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_recordings_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_stats"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "event_recordings_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_recordings_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "event_recordings_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      event_ticket_tiers: {
        Row: {
          capacity: number | null
          created_at: string
          description: string | null
          event_id: string
          id: string
          is_active: boolean
          name: string
          price: number
          sold_count: number
          sort_order: number
          updated_at: string
        }
        Insert: {
          capacity?: number | null
          created_at?: string
          description?: string | null
          event_id: string
          id?: string
          is_active?: boolean
          name: string
          price?: number
          sold_count?: number
          sort_order?: number
          updated_at?: string
        }
        Update: {
          capacity?: number | null
          created_at?: string
          description?: string | null
          event_id?: string
          id?: string
          is_active?: boolean
          name?: string
          price?: number
          sold_count?: number
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_ticket_tiers_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_stats"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "event_ticket_tiers_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_views: {
        Row: {
          event_id: string
          id: string
          view_date: string
          viewed_at: string
          viewer_id: string
        }
        Insert: {
          event_id: string
          id?: string
          view_date?: string
          viewed_at?: string
          viewer_id: string
        }
        Update: {
          event_id?: string
          id?: string
          view_date?: string
          viewed_at?: string
          viewer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_views_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_stats"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "event_views_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          boost_multiplier: number | null
          category: string | null
          created_at: string
          creator_id: string
          description: string | null
          embedding: string | null
          end_date: string | null
          event_type: string | null
          event_views_30d: number | null
          id: string
          image_url: string | null
          is_boosted: boolean | null
          is_locked: boolean | null
          is_official: boolean | null
          is_public: boolean | null
          match_score: number | null
          max_attendees: number | null
          meeting_link: string | null
          meeting_status: string | null
          recurrence_rule: string | null
          requires_approval: boolean
          start_date: string
          ticket_price: number | null
          title: string
          updated_at: string
        }
        Insert: {
          boost_multiplier?: number | null
          category?: string | null
          created_at?: string
          creator_id?: string
          description?: string | null
          embedding?: string | null
          end_date?: string | null
          event_type?: string | null
          event_views_30d?: number | null
          id?: string
          image_url?: string | null
          is_boosted?: boolean | null
          is_locked?: boolean | null
          is_official?: boolean | null
          is_public?: boolean | null
          match_score?: number | null
          max_attendees?: number | null
          meeting_link?: string | null
          meeting_status?: string | null
          recurrence_rule?: string | null
          requires_approval?: boolean
          start_date: string
          ticket_price?: number | null
          title: string
          updated_at?: string
        }
        Update: {
          boost_multiplier?: number | null
          category?: string | null
          created_at?: string
          creator_id?: string
          description?: string | null
          embedding?: string | null
          end_date?: string | null
          event_type?: string | null
          event_views_30d?: number | null
          id?: string
          image_url?: string | null
          is_boosted?: boolean | null
          is_locked?: boolean | null
          is_official?: boolean | null
          is_public?: boolean | null
          match_score?: number | null
          max_attendees?: number | null
          meeting_link?: string | null
          meeting_status?: string | null
          recurrence_rule?: string | null
          requires_approval?: boolean
          start_date?: string
          ticket_price?: number | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_creator_profile_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "events_creator_profile_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      friendships: {
        Row: {
          addressee_id: string
          created_at: string
          id: string
          requester_id: string
          status: string
          updated_at: string
        }
        Insert: {
          addressee_id: string
          created_at?: string
          id?: string
          requester_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          addressee_id?: string
          created_at?: string
          id?: string
          requester_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "friendships_addressee_id_fkey"
            columns: ["addressee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "friendships_addressee_id_fkey"
            columns: ["addressee_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "friendships_addressee_id_fkey1"
            columns: ["addressee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "friendships_addressee_id_fkey1"
            columns: ["addressee_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "friendships_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "friendships_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "friendships_requester_id_fkey1"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "friendships_requester_id_fkey1"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      location_history: {
        Row: {
          accuracy: number | null
          id: string
          latitude: number
          location_name: string | null
          longitude: number
          timestamp: string | null
          user_id: string
        }
        Insert: {
          accuracy?: number | null
          id?: string
          latitude: number
          location_name?: string | null
          longitude: number
          timestamp?: string | null
          user_id: string
        }
        Update: {
          accuracy?: number | null
          id?: string
          latitude?: number
          location_name?: string | null
          longitude?: number
          timestamp?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "location_history_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "location_history_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      location_shares: {
        Row: {
          created_at: string | null
          expires_at: string
          id: string
          is_active: boolean | null
          recipient_id: string
          sharer_id: string
        }
        Insert: {
          created_at?: string | null
          expires_at: string
          id?: string
          is_active?: boolean | null
          recipient_id: string
          sharer_id: string
        }
        Update: {
          created_at?: string | null
          expires_at?: string
          id?: string
          is_active?: boolean | null
          recipient_id?: string
          sharer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "location_shares_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "location_shares_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "location_shares_sharer_id_fkey"
            columns: ["sharer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "location_shares_sharer_id_fkey"
            columns: ["sharer_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      message_reactions: {
        Row: {
          created_at: string
          emoji: string
          id: string
          message_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          emoji: string
          id?: string
          message_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          emoji?: string
          id?: string
          message_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_reactions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          content: string | null
          created_at: string
          id: string
          image_url: string | null
          is_deleted: boolean | null
          is_read: boolean | null
          message_type: string | null
          receiver_id: string
          sender_id: string
          updated_at: string | null
        }
        Insert: {
          content?: string | null
          created_at?: string
          id?: string
          image_url?: string | null
          is_deleted?: boolean | null
          is_read?: boolean | null
          message_type?: string | null
          receiver_id: string
          sender_id: string
          updated_at?: string | null
        }
        Update: {
          content?: string | null
          created_at?: string
          id?: string
          image_url?: string | null
          is_deleted?: boolean | null
          is_read?: boolean | null
          message_type?: string | null
          receiver_id?: string
          sender_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_receiver_id_fkey"
            columns: ["receiver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "messages_receiver_id_fkey"
            columns: ["receiver_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "messages_receiver_id_fkey1"
            columns: ["receiver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "messages_receiver_id_fkey1"
            columns: ["receiver_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey1"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey1"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          expires_at: string | null
          id: string
          is_read: boolean | null
          message: string
          metadata: Json | null
          sender_id: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          id?: string
          is_read?: boolean | null
          message: string
          metadata?: Json | null
          sender_id?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          id?: string
          is_read?: boolean | null
          message?: string
          metadata?: Json | null
          sender_id?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
          created_at: string | null
          currency: string | null
          flw_ref: string | null
          id: string
          status: string
          tx_ref: string
          user_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string | null
          currency?: string | null
          flw_ref?: string | null
          id?: string
          status: string
          tx_ref: string
          user_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string | null
          currency?: string | null
          flw_ref?: string | null
          id?: string
          status?: string
          tx_ref?: string
          user_id?: string | null
        }
        Relationships: []
      }
      payout_requests: {
        Row: {
          amount: number
          created_at: string
          destination_bank_details: Json | null
          id: string
          processed_at: string | null
          status: Database["public"]["Enums"]["payout_status"]
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          destination_bank_details?: Json | null
          id?: string
          processed_at?: string | null
          status?: Database["public"]["Enums"]["payout_status"]
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          destination_bank_details?: Json | null
          id?: string
          processed_at?: string | null
          status?: Database["public"]["Enums"]["payout_status"]
          user_id?: string
        }
        Relationships: []
      }
      post_comments: {
        Row: {
          content: string
          created_at: string
          id: string
          likes_count: number | null
          parent_id: string | null
          post_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          likes_count?: number | null
          parent_id?: string | null
          post_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          likes_count?: number | null
          parent_id?: string | null
          post_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "post_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "social_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_likes: {
        Row: {
          created_at: string | null
          id: string
          post_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          post_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          post_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_likes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "social_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      premium_features: {
        Row: {
          amount_paid: number | null
          billing_period: string | null
          created_at: string | null
          expires_at: string
          feature_type: Database["public"]["Enums"]["premium_feature_type"]
          id: string
          is_active: boolean | null
          started_at: string | null
          status: string | null
          transaction_reference: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          amount_paid?: number | null
          billing_period?: string | null
          created_at?: string | null
          expires_at: string
          feature_type: Database["public"]["Enums"]["premium_feature_type"]
          id?: string
          is_active?: boolean | null
          started_at?: string | null
          status?: string | null
          transaction_reference?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          amount_paid?: number | null
          billing_period?: string | null
          created_at?: string | null
          expires_at?: string
          feature_type?: Database["public"]["Enums"]["premium_feature_type"]
          id?: string
          is_active?: boolean | null
          started_at?: string | null
          status?: string | null
          transaction_reference?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      profile_links: {
        Row: {
          created_at: string
          icon: string | null
          id: string
          sort_order: number | null
          title: string
          updated_at: string
          url: string
          user_id: string
        }
        Insert: {
          created_at?: string
          icon?: string | null
          id?: string
          sort_order?: number | null
          title: string
          updated_at?: string
          url: string
          user_id: string
        }
        Update: {
          created_at?: string
          icon?: string | null
          id?: string
          sort_order?: number | null
          title?: string
          updated_at?: string
          url?: string
          user_id?: string
        }
        Relationships: []
      }
      profile_views: {
        Row: {
          id: string
          profile_user_id: string
          view_date: string
          viewed_at: string
          viewer_id: string
        }
        Insert: {
          id?: string
          profile_user_id: string
          view_date?: string
          viewed_at?: string
          viewer_id: string
        }
        Update: {
          id?: string
          profile_user_id?: string
          view_date?: string
          viewed_at?: string
          viewer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_views_profile_user_id_fkey"
            columns: ["profile_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "profile_views_profile_user_id_fkey"
            columns: ["profile_user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          interest_embedding: string | null
          interests: string[] | null
          is_banned: boolean | null
          is_pioneer: boolean | null
          is_premium: boolean
          is_verified: boolean | null
          phone: string | null
          pioneer_number: number | null
          preferences: Json | null
          premium_tier: string | null
          profile_views_30d: number | null
          referral_code: string | null
          travel_propensity: number | null
          trust_score: number | null
          updated_at: string
          user_id: string
          user_type: Database["public"]["Enums"]["account_type"]
          username: string | null
          verification_status: Database["public"]["Enums"]["verification_status"]
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          interest_embedding?: string | null
          interests?: string[] | null
          is_banned?: boolean | null
          is_pioneer?: boolean | null
          is_premium?: boolean
          is_verified?: boolean | null
          phone?: string | null
          pioneer_number?: number | null
          preferences?: Json | null
          premium_tier?: string | null
          profile_views_30d?: number | null
          referral_code?: string | null
          travel_propensity?: number | null
          trust_score?: number | null
          updated_at?: string
          user_id: string
          user_type?: Database["public"]["Enums"]["account_type"]
          username?: string | null
          verification_status?: Database["public"]["Enums"]["verification_status"]
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          interest_embedding?: string | null
          interests?: string[] | null
          is_banned?: boolean | null
          is_pioneer?: boolean | null
          is_premium?: boolean
          is_verified?: boolean | null
          phone?: string | null
          pioneer_number?: number | null
          preferences?: Json | null
          premium_tier?: string | null
          profile_views_30d?: number | null
          referral_code?: string | null
          travel_propensity?: number | null
          trust_score?: number | null
          updated_at?: string
          user_id?: string
          user_type?: Database["public"]["Enums"]["account_type"]
          username?: string | null
          verification_status?: Database["public"]["Enums"]["verification_status"]
        }
        Relationships: []
      }
      referrals: {
        Row: {
          completed_at: string | null
          created_at: string
          id: string
          referral_code: string
          referred_id: string
          referrer_id: string
          reward_amount: number | null
          reward_claimed: boolean | null
          status: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          id?: string
          referral_code: string
          referred_id: string
          referrer_id: string
          reward_amount?: number | null
          reward_claimed?: boolean | null
          status?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          id?: string
          referral_code?: string
          referred_id?: string
          referrer_id?: string
          reward_amount?: number | null
          reward_claimed?: boolean | null
          status?: string
        }
        Relationships: []
      }
      reports: {
        Row: {
          created_at: string | null
          id: string
          reason: string | null
          reporter_id: string | null
          status: string | null
          target_id: string
          target_type: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          reason?: string | null
          reporter_id?: string | null
          status?: string | null
          target_id: string
          target_type: string
        }
        Update: {
          created_at?: string | null
          id?: string
          reason?: string | null
          reporter_id?: string | null
          status?: string | null
          target_id?: string
          target_type?: string
        }
        Relationships: []
      }
      saved_places: {
        Row: {
          address: string | null
          category: string | null
          created_at: string | null
          id: string
          latitude: number
          longitude: number
          name: string
          notes: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          address?: string | null
          category?: string | null
          created_at?: string | null
          id?: string
          latitude: number
          longitude: number
          name: string
          notes?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          address?: string | null
          category?: string | null
          created_at?: string | null
          id?: string
          latitude?: number
          longitude?: number
          name?: string
          notes?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_places_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "saved_places_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      social_posts: {
        Row: {
          comments_count: number | null
          content: string | null
          created_at: string | null
          id: string
          image_url: string | null
          likes_count: number | null
          location: string | null
          post_type: string | null
          user_id: string | null
        }
        Insert: {
          comments_count?: number | null
          content?: string | null
          created_at?: string | null
          id?: string
          image_url?: string | null
          likes_count?: number | null
          location?: string | null
          post_type?: string | null
          user_id?: string | null
        }
        Update: {
          comments_count?: number | null
          content?: string | null
          created_at?: string | null
          id?: string
          image_url?: string | null
          likes_count?: number | null
          location?: string | null
          post_type?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "social_posts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "social_posts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      spatial_ref_sys: {
        Row: {
          auth_name: string | null
          auth_srid: number | null
          proj4text: string | null
          srid: number
          srtext: string | null
        }
        Insert: {
          auth_name?: string | null
          auth_srid?: number | null
          proj4text?: string | null
          srid: number
          srtext?: string | null
        }
        Update: {
          auth_name?: string | null
          auth_srid?: number | null
          proj4text?: string | null
          srid?: number
          srtext?: string | null
        }
        Relationships: []
      }
      store_items: {
        Row: {
          created_at: string
          currency: string
          delivery_mode: string
          description: string | null
          discount_percent: number | null
          id: string
          image_url: string | null
          is_available: boolean
          max_delivery_days: number
          name: string
          price: number
          store_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency?: string
          delivery_mode?: string
          description?: string | null
          discount_percent?: number | null
          id?: string
          image_url?: string | null
          is_available?: boolean
          max_delivery_days?: number
          name: string
          price?: number
          store_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string
          delivery_mode?: string
          description?: string | null
          discount_percent?: number | null
          id?: string
          image_url?: string | null
          is_available?: boolean
          max_delivery_days?: number
          name?: string
          price?: number
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_items_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      stores: {
        Row: {
          category: string
          contact_phone: string | null
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          location: string | null
          logo_url: string | null
          name: string
          owner_id: string
          updated_at: string
        }
        Insert: {
          category?: string
          contact_phone?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          location?: string | null
          logo_url?: string | null
          name: string
          owner_id: string
          updated_at?: string
        }
        Update: {
          category?: string
          contact_phone?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          location?: string | null
          logo_url?: string | null
          name?: string
          owner_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      stories: {
        Row: {
          author_id: string | null
          content: string | null
          created_at: string | null
          id: string
          media_type: string | null
          media_url: string | null
          user_id: string | null
          view_count: number | null
        }
        Insert: {
          author_id?: string | null
          content?: string | null
          created_at?: string | null
          id?: string
          media_type?: string | null
          media_url?: string | null
          user_id?: string | null
          view_count?: number | null
        }
        Update: {
          author_id?: string | null
          content?: string | null
          created_at?: string | null
          id?: string
          media_type?: string | null
          media_url?: string | null
          user_id?: string | null
          view_count?: number | null
        }
        Relationships: []
      }
      story_likes: {
        Row: {
          created_at: string | null
          id: string
          story_id: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          story_id?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          story_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "story_likes_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: false
            referencedRelation: "stories"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          current_period_end: string | null
          current_period_start: string | null
          flutterwave_sub_id: string | null
          plan_interval: string | null
          status: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          current_period_end?: string | null
          current_period_start?: string | null
          flutterwave_sub_id?: string | null
          plan_interval?: string | null
          status?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          current_period_end?: string | null
          current_period_start?: string | null
          flutterwave_sub_id?: string | null
          plan_interval?: string | null
          status?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      transactions: {
        Row: {
          amount: number
          category: Database["public"]["Enums"]["transaction_category"]
          created_at: string
          description: string | null
          flutterwave_transaction_id: string | null
          id: string
          reference: string | null
          reference_id: string | null
          related_id: string | null
          type: Database["public"]["Enums"]["transaction_type"]
          wallet_id: string | null
        }
        Insert: {
          amount: number
          category: Database["public"]["Enums"]["transaction_category"]
          created_at?: string
          description?: string | null
          flutterwave_transaction_id?: string | null
          id?: string
          reference?: string | null
          reference_id?: string | null
          related_id?: string | null
          type: Database["public"]["Enums"]["transaction_type"]
          wallet_id?: string | null
        }
        Update: {
          amount?: number
          category?: Database["public"]["Enums"]["transaction_category"]
          created_at?: string
          description?: string | null
          flutterwave_transaction_id?: string | null
          id?: string
          reference?: string | null
          reference_id?: string | null
          related_id?: string | null
          type?: Database["public"]["Enums"]["transaction_type"]
          wallet_id?: string | null
        }
        Relationships: []
      }
      user_ads: {
        Row: {
          amount_paid: number | null
          clicks: number | null
          content: string | null
          created_at: string
          daily_budget: number
          duration_days: number
          end_date: string | null
          engagement: number | null
          goal: string | null
          id: string
          image_url: string | null
          impressions: number | null
          link_url: string | null
          payment_reference: string | null
          payment_status: string | null
          post_id: string | null
          rejection_reason: string | null
          start_date: string | null
          status: string
          target_audience: string | null
          target_location: string | null
          title: string
          total_budget: number
          updated_at: string
          user_id: string
        }
        Insert: {
          amount_paid?: number | null
          clicks?: number | null
          content?: string | null
          created_at?: string
          daily_budget?: number
          duration_days?: number
          end_date?: string | null
          engagement?: number | null
          goal?: string | null
          id?: string
          image_url?: string | null
          impressions?: number | null
          link_url?: string | null
          payment_reference?: string | null
          payment_status?: string | null
          post_id?: string | null
          rejection_reason?: string | null
          start_date?: string | null
          status?: string
          target_audience?: string | null
          target_location?: string | null
          title: string
          total_budget?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          amount_paid?: number | null
          clicks?: number | null
          content?: string | null
          created_at?: string
          daily_budget?: number
          duration_days?: number
          end_date?: string | null
          engagement?: number | null
          goal?: string | null
          id?: string
          image_url?: string | null
          impressions?: number | null
          link_url?: string | null
          payment_reference?: string | null
          payment_status?: string | null
          post_id?: string | null
          rejection_reason?: string | null
          start_date?: string | null
          status?: string
          target_audience?: string | null
          target_location?: string | null
          title?: string
          total_budget?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_ads_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "social_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      user_bank_details: {
        Row: {
          account_name: string
          account_number: string
          bank_name: string
          created_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account_name: string
          account_number: string
          bank_name: string
          created_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          account_name?: string
          account_number?: string
          bank_name?: string
          created_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_locations: {
        Row: {
          accuracy: number | null
          coords: unknown
          created_at: string
          id: string
          is_sharing_location: boolean | null
          last_seen: string | null
          latitude: number
          longitude: number
          status_bubble: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          accuracy?: number | null
          coords?: unknown
          created_at?: string
          id?: string
          is_sharing_location?: boolean | null
          last_seen?: string | null
          latitude: number
          longitude: number
          status_bubble?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          accuracy?: number | null
          coords?: unknown
          created_at?: string
          id?: string
          is_sharing_location?: boolean | null
          last_seen?: string | null
          latitude?: number
          longitude?: number
          status_bubble?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      video_call_participants: {
        Row: {
          duration: number | null
          id: string
          is_audio_enabled: boolean | null
          is_video_enabled: boolean | null
          joined_at: string | null
          left_at: string | null
          session_id: string
          user_id: string
        }
        Insert: {
          duration?: number | null
          id?: string
          is_audio_enabled?: boolean | null
          is_video_enabled?: boolean | null
          joined_at?: string | null
          left_at?: string | null
          session_id: string
          user_id: string
        }
        Update: {
          duration?: number | null
          id?: string
          is_audio_enabled?: boolean | null
          is_video_enabled?: boolean | null
          joined_at?: string | null
          left_at?: string | null
          session_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "video_call_participants_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "video_call_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_call_participants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "video_call_participants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      video_call_sessions: {
        Row: {
          created_at: string | null
          duration: number | null
          ended_at: string | null
          event_id: string
          host_id: string
          id: string
          is_recording: boolean | null
          max_participants: number | null
          recording_url: string | null
          session_token: string | null
          started_at: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          duration?: number | null
          ended_at?: string | null
          event_id: string
          host_id: string
          id?: string
          is_recording?: boolean | null
          max_participants?: number | null
          recording_url?: string | null
          session_token?: string | null
          started_at?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          duration?: number | null
          ended_at?: string | null
          event_id?: string
          host_id?: string
          id?: string
          is_recording?: boolean | null
          max_participants?: number | null
          recording_url?: string | null
          session_token?: string | null
          started_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "video_call_sessions_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_stats"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "video_call_sessions_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_call_sessions_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "video_call_sessions_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      waitlist: {
        Row: {
          city: string | null
          email: string | null
          full_name: string | null
          id: string
          joined_at: string | null
          latitude: number | null
          longitude: number | null
          user_id: string | null
        }
        Insert: {
          city?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          joined_at?: string | null
          latitude?: number | null
          longitude?: number | null
          user_id?: string | null
        }
        Update: {
          city?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          joined_at?: string | null
          latitude?: number | null
          longitude?: number | null
          user_id?: string | null
        }
        Relationships: []
      }
      wallet_transactions: {
        Row: {
          amount: number
          created_at: string | null
          description: string | null
          id: string
          reference_id: string | null
          type: string | null
          user_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string | null
          description?: string | null
          id?: string
          reference_id?: string | null
          type?: string | null
          user_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string | null
          description?: string | null
          id?: string
          reference_id?: string | null
          type?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wallet_transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "wallet_transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      wallets: {
        Row: {
          balance: number
          id: string
          is_platform_wallet: boolean | null
          updated_at: string
          user_id: string
        }
        Insert: {
          balance?: number
          id: string
          is_platform_wallet?: boolean | null
          updated_at?: string
          user_id: string
        }
        Update: {
          balance?: number
          id?: string
          is_platform_wallet?: boolean | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      active_user_locations: {
        Row: {
          avatar_url: string | null
          display_name: string | null
          is_sharing_location: boolean | null
          latitude: number | null
          longitude: number | null
          updated_at: string | null
          user_id: string | null
        }
        Relationships: []
      }
      event_stats: {
        Row: {
          event_id: string | null
          event_type: string | null
          title: string | null
          total_attendees: number | null
          total_invitations: number | null
          total_recordings: number | null
          total_video_sessions: number | null
        }
        Relationships: []
      }
      geography_columns: {
        Row: {
          coord_dimension: number | null
          f_geography_column: unknown
          f_table_catalog: unknown
          f_table_name: unknown
          f_table_schema: unknown
          srid: number | null
          type: string | null
        }
        Relationships: []
      }
      geometry_columns: {
        Row: {
          coord_dimension: number | null
          f_geometry_column: unknown
          f_table_catalog: string | null
          f_table_name: unknown
          f_table_schema: unknown
          srid: number | null
          type: string | null
        }
        Insert: {
          coord_dimension?: number | null
          f_geometry_column?: unknown
          f_table_catalog?: string | null
          f_table_name?: unknown
          f_table_schema?: unknown
          srid?: number | null
          type?: string | null
        }
        Update: {
          coord_dimension?: number | null
          f_geometry_column?: unknown
          f_table_catalog?: string | null
          f_table_name?: unknown
          f_table_schema?: unknown
          srid?: number | null
          type?: string | null
        }
        Relationships: []
      }
      public_profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string | null
          display_name: string | null
          user_id: string | null
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string | null
          display_name?: string | null
          user_id?: string | null
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string | null
          display_name?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      _postgis_deprecate: {
        Args: { newname: string; oldname: string; version: string }
        Returns: undefined
      }
      _postgis_index_extent: {
        Args: { col: string; tbl: unknown }
        Returns: unknown
      }
      _postgis_pgsql_version: { Args: never; Returns: string }
      _postgis_scripts_pgsql_version: { Args: never; Returns: string }
      _postgis_selectivity: {
        Args: { att_name: string; geom: unknown; mode?: string; tbl: unknown }
        Returns: number
      }
      _postgis_stats: {
        Args: { ""?: string; att_name: string; tbl: unknown }
        Returns: string
      }
      _st_3dintersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_containsproperly: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_coveredby:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_covers:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_crosses: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_dwithin: {
        Args: {
          geog1: unknown
          geog2: unknown
          tolerance: number
          use_spheroid?: boolean
        }
        Returns: boolean
      }
      _st_equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_intersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_linecrossingdirection: {
        Args: { line1: unknown; line2: unknown }
        Returns: number
      }
      _st_longestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      _st_maxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      _st_orderingequals: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_sortablehash: { Args: { geom: unknown }; Returns: number }
      _st_touches: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_voronoi: {
        Args: {
          clip?: unknown
          g1: unknown
          return_polygons?: boolean
          tolerance?: number
        }
        Returns: unknown
      }
      _st_within: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      addauth: { Args: { "": string }; Returns: boolean }
      addgeometrycolumn:
        | {
            Args: {
              catalog_name: string
              column_name: string
              new_dim: number
              new_srid_in: number
              new_type: string
              schema_name: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              new_dim: number
              new_srid: number
              new_type: string
              schema_name: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              new_dim: number
              new_srid: number
              new_type: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
      broadcast_changes_for_table:
        | { Args: { p_topic: string }; Returns: undefined }
        | {
            Args: {
              p_event: string
              p_new: Json
              p_old: Json
              p_op: string
              p_schema: string
              p_table: string
              p_topic: string
            }
            Returns: undefined
          }
      calculate_distance: {
        Args: { lat1: number; lat2: number; lon1: number; lon2: number }
        Returns: number
      }
      cleanup_expired_location_shares: { Args: never; Returns: undefined }
      cleanup_old_notifications: { Args: never; Returns: undefined }
      credit_wallet: {
        Args: { amount: number; user_id: string }
        Returns: undefined
      }
      decrement_comment_likes: {
        Args: { p_comment_id: string }
        Returns: undefined
      }
      decrement_community_members: {
        Args: { community_id: string }
        Returns: undefined
      }
      decrement_event_attendees: {
        Args: { event_id: string }
        Returns: undefined
      }
      decrement_post_comments: { Args: { post_id: string }; Returns: undefined }
      decrement_post_likes: { Args: { post_id: string }; Returns: undefined }
      deduct_from_wallet: {
        Args: { amount: number; user_id: string }
        Returns: undefined
      }
      delete_user: { Args: never; Returns: undefined }
      disablelongtransactions: { Args: never; Returns: string }
      dropgeometrycolumn:
        | {
            Args: {
              catalog_name: string
              column_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | { Args: { column_name: string; table_name: string }; Returns: string }
      dropgeometrytable:
        | {
            Args: {
              catalog_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | { Args: { schema_name: string; table_name: string }; Returns: string }
        | { Args: { table_name: string }; Returns: string }
      enablelongtransactions: { Args: never; Returns: string }
      equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      expire_premium_features: { Args: never; Returns: undefined }
      generate_smart_feed: {
        Args: {
          p_city?: string
          p_user_id: string
          p_user_lat?: number
          p_user_long?: number
        }
        Returns: Json
      }
      geometry: { Args: { "": string }; Returns: unknown }
      geometry_above: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_below: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_cmp: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_contained_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_contains_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_distance_box: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_distance_centroid: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_eq: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_ge: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_gt: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_le: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_left: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_lt: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overabove: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overbelow: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overlaps_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overleft: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overright: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_right: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_same: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_same_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_within: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geomfromewkt: { Args: { "": string }; Returns: unknown }
      get_city_stats: {
        Args: { search_city_name: string }
        Returns: {
          current_pioneers: number
          target_pioneers: number
          unlocked: boolean
        }[]
      }
      get_friends_on_map: {
        Args: never
        Returns: {
          avatar_url: string
          display_name: string
          latitude: number
          longitude: number
          user_id: string
        }[]
      }
      get_mutual_friends: {
        Args: { a: string; b: string }
        Returns: {
          avatar_url: string
          full_name: string
          mutual_since: string
          profile_id: string
        }[]
      }
      get_mutual_suggestions: {
        Args: { current_user_id: string }
        Returns: {
          mutual_count: number
          user_id: string
        }[]
      }
      get_my_role: { Args: never; Returns: string }
      get_nearby_users:
        | {
            Args: { p_radius_km?: number; p_user_id: string }
            Returns: {
              avatar_url: string
              display_name: string
              distance_km: number
              user_id: string
            }[]
          }
        | {
            Args: { p_radius_km?: number; p_user_id: string }
            Returns: {
              avatar_url: string
              display_name: string
              distance_km: number
              user_id: string
            }[]
          }
      get_smart_feed: {
        Args: {
          user_interests: string[]
          user_lat: number
          user_long: number
          viewer_id: string
        }
        Returns: {
          id: string
          image_url: string
          location: string
          match_score: number
          start_date: string
          title: string
        }[]
      }
      get_user_premium_features: {
        Args: { p_user_id: string }
        Returns: {
          days_remaining: number
          expires_at: string
          feature_type: Database["public"]["Enums"]["premium_feature_type"]
        }[]
      }
      gettransactionid: { Args: never; Returns: unknown }
      has_premium_feature: {
        Args: {
          p_feature_type: Database["public"]["Enums"]["premium_feature_type"]
          p_user_id: string
        }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      increment_comment_likes: {
        Args: { p_comment_id: string }
        Returns: undefined
      }
      increment_community_members: {
        Args: { community_id: string }
        Returns: undefined
      }
      increment_event_attendees: {
        Args: { event_id: string }
        Returns: undefined
      }
      increment_pioneer_count: {
        Args: { target_city: string; target_user: string }
        Returns: {
          pioneer_number: number
        }[]
      }
      increment_post_comments: { Args: { post_id: string }; Returns: undefined }
      increment_post_likes: { Args: { post_id: string }; Returns: undefined }
      increment_story_view: {
        Args: { story_id: string; viewer_id: string }
        Returns: undefined
      }
      is_admin: { Args: never; Returns: boolean }
      longtransactionsenabled: { Args: never; Returns: boolean }
      make_user_admin: { Args: { target_user_id: string }; Returns: undefined }
      match_events_smart:
        | {
            Args: {
              match_count: number
              match_threshold: number
              p_user_id: string
              query_embedding: string
              travel_propensity: number
            }
            Returns: {
              distance_km: number
              final_score: number
              id: string
              is_boosted: boolean
              similarity: number
              title: string
            }[]
          }
        | {
            Args: {
              match_count: number
              match_threshold: number
              query_embedding: string
              travel_propensity: number
              user_lat: number
              user_long: number
            }
            Returns: {
              distance_km: number
              final_score: number
              id: string
              is_boosted: boolean
              similarity: number
              title: string
            }[]
          }
      populate_geometry_columns:
        | { Args: { tbl_oid: unknown; use_typmod?: boolean }; Returns: number }
        | { Args: { use_typmod?: boolean }; Returns: string }
      postgis_constraint_dims: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: number
      }
      postgis_constraint_srid: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: number
      }
      postgis_constraint_type: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: string
      }
      postgis_extensions_upgrade: { Args: never; Returns: string }
      postgis_full_version: { Args: never; Returns: string }
      postgis_geos_version: { Args: never; Returns: string }
      postgis_lib_build_date: { Args: never; Returns: string }
      postgis_lib_revision: { Args: never; Returns: string }
      postgis_lib_version: { Args: never; Returns: string }
      postgis_libjson_version: { Args: never; Returns: string }
      postgis_liblwgeom_version: { Args: never; Returns: string }
      postgis_libprotobuf_version: { Args: never; Returns: string }
      postgis_libxml_version: { Args: never; Returns: string }
      postgis_proj_version: { Args: never; Returns: string }
      postgis_scripts_build_date: { Args: never; Returns: string }
      postgis_scripts_installed: { Args: never; Returns: string }
      postgis_scripts_released: { Args: never; Returns: string }
      postgis_svn_version: { Args: never; Returns: string }
      postgis_type_name: {
        Args: {
          coord_dimension: number
          geomname: string
          use_new_name?: boolean
        }
        Returns: string
      }
      postgis_version: { Args: never; Returns: string }
      postgis_wagyu_version: { Args: never; Returns: string }
      record_event_view: { Args: { target_event_id: string }; Returns: number }
      record_profile_view: { Args: { target_user_id: string }; Returns: number }
      request_payout: { Args: { withdraw_amount: number }; Returns: Json }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      st_3dclosestpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3ddistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_3dintersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_3dlongestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3dmakebox: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3dmaxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_3dshortestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_addpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_angle:
        | { Args: { line1: unknown; line2: unknown }; Returns: number }
        | {
            Args: { pt1: unknown; pt2: unknown; pt3: unknown; pt4?: unknown }
            Returns: number
          }
      st_area:
        | { Args: { geog: unknown; use_spheroid?: boolean }; Returns: number }
        | { Args: { "": string }; Returns: number }
      st_asencodedpolyline: {
        Args: { geom: unknown; nprecision?: number }
        Returns: string
      }
      st_asewkt: { Args: { "": string }; Returns: string }
      st_asgeojson:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | {
            Args: {
              geom_column?: string
              maxdecimaldigits?: number
              pretty_bool?: boolean
              r: Record<string, unknown>
            }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_asgml:
        | {
            Args: {
              geog: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
            }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
        | {
            Args: {
              geog: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
              version: number
            }
            Returns: string
          }
        | {
            Args: {
              geom: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
              version: number
            }
            Returns: string
          }
      st_askml:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; nprefix?: string }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; nprefix?: string }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_aslatlontext: {
        Args: { geom: unknown; tmpl?: string }
        Returns: string
      }
      st_asmarc21: { Args: { format?: string; geom: unknown }; Returns: string }
      st_asmvtgeom: {
        Args: {
          bounds: unknown
          buffer?: number
          clip_geom?: boolean
          extent?: number
          geom: unknown
        }
        Returns: unknown
      }
      st_assvg:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; rel?: number }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; rel?: number }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_astext: { Args: { "": string }; Returns: string }
      st_astwkb:
        | {
            Args: {
              geom: unknown
              prec?: number
              prec_m?: number
              prec_z?: number
              with_boxes?: boolean
              with_sizes?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              geom: unknown[]
              ids: number[]
              prec?: number
              prec_m?: number
              prec_z?: number
              with_boxes?: boolean
              with_sizes?: boolean
            }
            Returns: string
          }
      st_asx3d: {
        Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
        Returns: string
      }
      st_azimuth:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: number }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
      st_boundingdiagonal: {
        Args: { fits?: boolean; geom: unknown }
        Returns: unknown
      }
      st_buffer:
        | {
            Args: { geom: unknown; options?: string; radius: number }
            Returns: unknown
          }
        | {
            Args: { geom: unknown; quadsegs: number; radius: number }
            Returns: unknown
          }
      st_centroid: { Args: { "": string }; Returns: unknown }
      st_clipbybox2d: {
        Args: { box: unknown; geom: unknown }
        Returns: unknown
      }
      st_closestpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_collect: { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
      st_concavehull: {
        Args: {
          param_allow_holes?: boolean
          param_geom: unknown
          param_pctconvex: number
        }
        Returns: unknown
      }
      st_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_containsproperly: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_coorddim: { Args: { geometry: unknown }; Returns: number }
      st_coveredby:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_covers:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_crosses: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_curvetoline: {
        Args: { flags?: number; geom: unknown; tol?: number; toltype?: number }
        Returns: unknown
      }
      st_delaunaytriangles: {
        Args: { flags?: number; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_difference: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_disjoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_distance:
        | {
            Args: { geog1: unknown; geog2: unknown; use_spheroid?: boolean }
            Returns: number
          }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
      st_distancesphere:
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
        | {
            Args: { geom1: unknown; geom2: unknown; radius: number }
            Returns: number
          }
      st_distancespheroid: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_dwithin: {
        Args: {
          geog1: unknown
          geog2: unknown
          tolerance: number
          use_spheroid?: boolean
        }
        Returns: boolean
      }
      st_equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_expand:
        | { Args: { box: unknown; dx: number; dy: number }; Returns: unknown }
        | {
            Args: { box: unknown; dx: number; dy: number; dz?: number }
            Returns: unknown
          }
        | {
            Args: {
              dm?: number
              dx: number
              dy: number
              dz?: number
              geom: unknown
            }
            Returns: unknown
          }
      st_force3d: { Args: { geom: unknown; zvalue?: number }; Returns: unknown }
      st_force3dm: {
        Args: { geom: unknown; mvalue?: number }
        Returns: unknown
      }
      st_force3dz: {
        Args: { geom: unknown; zvalue?: number }
        Returns: unknown
      }
      st_force4d: {
        Args: { geom: unknown; mvalue?: number; zvalue?: number }
        Returns: unknown
      }
      st_generatepoints:
        | { Args: { area: unknown; npoints: number }; Returns: unknown }
        | {
            Args: { area: unknown; npoints: number; seed: number }
            Returns: unknown
          }
      st_geogfromtext: { Args: { "": string }; Returns: unknown }
      st_geographyfromtext: { Args: { "": string }; Returns: unknown }
      st_geohash:
        | { Args: { geog: unknown; maxchars?: number }; Returns: string }
        | { Args: { geom: unknown; maxchars?: number }; Returns: string }
      st_geomcollfromtext: { Args: { "": string }; Returns: unknown }
      st_geometricmedian: {
        Args: {
          fail_if_not_converged?: boolean
          g: unknown
          max_iter?: number
          tolerance?: number
        }
        Returns: unknown
      }
      st_geometryfromtext: { Args: { "": string }; Returns: unknown }
      st_geomfromewkt: { Args: { "": string }; Returns: unknown }
      st_geomfromgeojson:
        | { Args: { "": Json }; Returns: unknown }
        | { Args: { "": Json }; Returns: unknown }
        | { Args: { "": string }; Returns: unknown }
      st_geomfromgml: { Args: { "": string }; Returns: unknown }
      st_geomfromkml: { Args: { "": string }; Returns: unknown }
      st_geomfrommarc21: { Args: { marc21xml: string }; Returns: unknown }
      st_geomfromtext: { Args: { "": string }; Returns: unknown }
      st_gmltosql: { Args: { "": string }; Returns: unknown }
      st_hasarc: { Args: { geometry: unknown }; Returns: boolean }
      st_hausdorffdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_hexagon: {
        Args: { cell_i: number; cell_j: number; origin?: unknown; size: number }
        Returns: unknown
      }
      st_hexagongrid: {
        Args: { bounds: unknown; size: number }
        Returns: Record<string, unknown>[]
      }
      st_interpolatepoint: {
        Args: { line: unknown; point: unknown }
        Returns: number
      }
      st_intersection: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_intersects:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_isvaliddetail: {
        Args: { flags?: number; geom: unknown }
        Returns: Database["public"]["CompositeTypes"]["valid_detail"]
        SetofOptions: {
          from: "*"
          to: "valid_detail"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      st_length:
        | { Args: { geog: unknown; use_spheroid?: boolean }; Returns: number }
        | { Args: { "": string }; Returns: number }
      st_letters: { Args: { font?: Json; letters: string }; Returns: unknown }
      st_linecrossingdirection: {
        Args: { line1: unknown; line2: unknown }
        Returns: number
      }
      st_linefromencodedpolyline: {
        Args: { nprecision?: number; txtin: string }
        Returns: unknown
      }
      st_linefromtext: { Args: { "": string }; Returns: unknown }
      st_linelocatepoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_linetocurve: { Args: { geometry: unknown }; Returns: unknown }
      st_locatealong: {
        Args: { geometry: unknown; leftrightoffset?: number; measure: number }
        Returns: unknown
      }
      st_locatebetween: {
        Args: {
          frommeasure: number
          geometry: unknown
          leftrightoffset?: number
          tomeasure: number
        }
        Returns: unknown
      }
      st_locatebetweenelevations: {
        Args: { fromelevation: number; geometry: unknown; toelevation: number }
        Returns: unknown
      }
      st_longestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makebox2d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makeline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makevalid: {
        Args: { geom: unknown; params: string }
        Returns: unknown
      }
      st_maxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_minimumboundingcircle: {
        Args: { inputgeom: unknown; segs_per_quarter?: number }
        Returns: unknown
      }
      st_mlinefromtext: { Args: { "": string }; Returns: unknown }
      st_mpointfromtext: { Args: { "": string }; Returns: unknown }
      st_mpolyfromtext: { Args: { "": string }; Returns: unknown }
      st_multilinestringfromtext: { Args: { "": string }; Returns: unknown }
      st_multipointfromtext: { Args: { "": string }; Returns: unknown }
      st_multipolygonfromtext: { Args: { "": string }; Returns: unknown }
      st_node: { Args: { g: unknown }; Returns: unknown }
      st_normalize: { Args: { geom: unknown }; Returns: unknown }
      st_offsetcurve: {
        Args: { distance: number; line: unknown; params?: string }
        Returns: unknown
      }
      st_orderingequals: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_perimeter: {
        Args: { geog: unknown; use_spheroid?: boolean }
        Returns: number
      }
      st_pointfromtext: { Args: { "": string }; Returns: unknown }
      st_pointm: {
        Args: {
          mcoordinate: number
          srid?: number
          xcoordinate: number
          ycoordinate: number
        }
        Returns: unknown
      }
      st_pointz: {
        Args: {
          srid?: number
          xcoordinate: number
          ycoordinate: number
          zcoordinate: number
        }
        Returns: unknown
      }
      st_pointzm: {
        Args: {
          mcoordinate: number
          srid?: number
          xcoordinate: number
          ycoordinate: number
          zcoordinate: number
        }
        Returns: unknown
      }
      st_polyfromtext: { Args: { "": string }; Returns: unknown }
      st_polygonfromtext: { Args: { "": string }; Returns: unknown }
      st_project: {
        Args: { azimuth: number; distance: number; geog: unknown }
        Returns: unknown
      }
      st_quantizecoordinates: {
        Args: {
          g: unknown
          prec_m?: number
          prec_x: number
          prec_y?: number
          prec_z?: number
        }
        Returns: unknown
      }
      st_reduceprecision: {
        Args: { geom: unknown; gridsize: number }
        Returns: unknown
      }
      st_relate: { Args: { geom1: unknown; geom2: unknown }; Returns: string }
      st_removerepeatedpoints: {
        Args: { geom: unknown; tolerance?: number }
        Returns: unknown
      }
      st_segmentize: {
        Args: { geog: unknown; max_segment_length: number }
        Returns: unknown
      }
      st_setsrid:
        | { Args: { geog: unknown; srid: number }; Returns: unknown }
        | { Args: { geom: unknown; srid: number }; Returns: unknown }
      st_sharedpaths: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_shortestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_simplifypolygonhull: {
        Args: { geom: unknown; is_outer?: boolean; vertex_fraction: number }
        Returns: unknown
      }
      st_split: { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
      st_square: {
        Args: { cell_i: number; cell_j: number; origin?: unknown; size: number }
        Returns: unknown
      }
      st_squaregrid: {
        Args: { bounds: unknown; size: number }
        Returns: Record<string, unknown>[]
      }
      st_srid:
        | { Args: { geog: unknown }; Returns: number }
        | { Args: { geom: unknown }; Returns: number }
      st_subdivide: {
        Args: { geom: unknown; gridsize?: number; maxvertices?: number }
        Returns: unknown[]
      }
      st_swapordinates: {
        Args: { geom: unknown; ords: unknown }
        Returns: unknown
      }
      st_symdifference: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_symmetricdifference: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_tileenvelope: {
        Args: {
          bounds?: unknown
          margin?: number
          x: number
          y: number
          zoom: number
        }
        Returns: unknown
      }
      st_touches: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_transform:
        | {
            Args: { from_proj: string; geom: unknown; to_proj: string }
            Returns: unknown
          }
        | {
            Args: { from_proj: string; geom: unknown; to_srid: number }
            Returns: unknown
          }
        | { Args: { geom: unknown; to_proj: string }; Returns: unknown }
      st_triangulatepolygon: { Args: { g1: unknown }; Returns: unknown }
      st_union:
        | { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
        | {
            Args: { geom1: unknown; geom2: unknown; gridsize: number }
            Returns: unknown
          }
      st_voronoilines: {
        Args: { extend_to?: unknown; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_voronoipolygons: {
        Args: { extend_to?: unknown; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_within: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_wkbtosql: { Args: { wkb: string }; Returns: unknown }
      st_wkttosql: { Args: { "": string }; Returns: unknown }
      st_wrapx: {
        Args: { geom: unknown; move: number; wrap: number }
        Returns: unknown
      }
      suggest_nearby_friends:
        | {
            Args: {
              limit_count: number
              requesting_user_id: string
              user_lat: number
              user_long: number
            }
            Returns: {
              avatar_url: string
              display_name: string
              distance_km: number
              friend_id: string
              score: number
            }[]
          }
        | {
            Args: {
              limit_count?: number
              radius_meters?: number
              requesting_user_id: string
              user_lat: number
              user_long: number
            }
            Returns: {
              avatar_url: string
              display_name: string
              distance_km: number
              is_new: boolean
              mutual_count: number
              user_id: string
              username: string
            }[]
          }
      unlockrows: { Args: { "": string }; Returns: number }
      updategeometrysrid: {
        Args: {
          catalogn_name: string
          column_name: string
          new_srid_in: number
          schema_name: string
          table_name: string
        }
        Returns: string
      }
    }
    Enums: {
      account_type: "personal" | "business"
      app_role: "user" | "moderator" | "admin" | "super_admin"
      "Event Boost": "event_boost"
      "Full Package": "full_package"
      payout_status: "pending" | "processing" | "paid" | "failed" | "rejected"
      premium_feature_type:
        | "full_package"
        | "profile_boost"
        | "event_boost"
        | "profile_badge"
      "Profile Badge": "profile_badge"
      "Profile Boost": "profile_boost"
      transaction_category: "ticket_sale" | "payout" | "platform_fee"
      transaction_type: "credit" | "debit"
      verification_status: "unverified" | "pending" | "verified"
    }
    CompositeTypes: {
      geometry_dump: {
        path: number[] | null
        geom: unknown
      }
      valid_detail: {
        valid: boolean | null
        reason: string | null
        location: unknown
      }
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      account_type: ["personal", "business"],
      app_role: ["user", "moderator", "admin", "super_admin"],
      "Event Boost": ["event_boost"],
      "Full Package": ["full_package"],
      payout_status: ["pending", "processing", "paid", "failed", "rejected"],
      premium_feature_type: [
        "full_package",
        "profile_boost",
        "event_boost",
        "profile_badge",
      ],
      "Profile Badge": ["profile_badge"],
      "Profile Boost": ["profile_boost"],
      transaction_category: ["ticket_sale", "payout", "platform_fee"],
      transaction_type: ["credit", "debit"],
      verification_status: ["unverified", "pending", "verified"],
    },
  },
} as const
