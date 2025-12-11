// ============= Message Types =============

export type ChatMode = 'dm' | 'community';

export interface Message {
  id: string;
  content?: string | null;
  image_url?: string | null;
  created_at: string;
  sender_id: string;
  is_me: boolean;
  sender_name?: string;
  sender_avatar?: string;
  is_deleted?: boolean;
  is_pinned?: boolean;
  pending?: boolean;
  read?: boolean;
  updated_at?: string;
}

export interface CommunityMember {
  user_id: string;
  role: 'admin' | 'moderator' | 'member';
  is_muted?: boolean;
  muted_until?: string | null;
  profile: { display_name: string; avatar_url: string; };
  joined_at: string;
}

export type SelectedChat = 
  | { 
      type: 'dm'; 
      id: string; 
      partner_id: string; 
      name: string; 
      avatar?: string; 
      is_online?: boolean; 
      last_seen?: string; 
    }
  | { 
      type: 'community'; 
      id: string; 
      name: string; 
      avatar?: string; 
      description?: string; 
      my_role: 'admin' | 'moderator' | 'member' | 'none'; 
      member_count: number;
    };

export interface DMListItem {
  type: 'dm';
  id: string;
  partner_id: string;
  name: string;
  avatar?: string;
  last_msg: string;
  time: string;
  is_online: boolean;
  unread_count: number;
}

export interface CommunityListItem {
  type: 'community';
  id: string;
  name: string;
  description?: string;
  avatar?: string;
  member_count: number;
  my_role: 'admin' | 'moderator' | 'member' | 'none';
  is_joined: boolean;
}

export type ModerationType = 'kick' | 'ban' | 'mute' | 'warn' | 'unban' | 'unmute';

export interface ModerationAction {
  type: ModerationType;
  userId: string;
  userName: string;
  reason?: string;
  duration?: number; // in minutes for mute
}

export interface ModerationLogEntry {
  id: string;
  community_id: string;
  moderator_id: string;
  target_user_id: string;
  action: ModerationType;
  reason?: string;
  created_at: string;
  moderator_name?: string;
  target_name?: string;
}
