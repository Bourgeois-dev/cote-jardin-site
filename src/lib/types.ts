export interface MenuItem { id: string; name: string; category: string; description: string; price: number; position: number; is_active: boolean; }
export interface GalleryImage { id: string; url: string; alt: string; caption: string; position: number; is_active: boolean; }
export interface Partner { id: string; name: string; description: string; image_url: string; category: string; website: string; location: string; partner_type: string; featured: boolean; position: number; is_active: boolean; }
export interface Review { id: string; author: string; rating: number; content: string; position: number; is_active: boolean; }
export interface SocialLink { id: string; platform: string; url: string; position: number; is_active: boolean; }
export interface OpeningHour { id: string; day_of_week: number; is_closed: boolean; lunch_open: string | null; lunch_close: string | null; dinner_open: string | null; dinner_close: string | null; }
export interface ClosurePeriod { id: string; start_date: string; end_date: string; reason: string; service: 'midi' | 'soir' | null; note_interne: string; custom_message: string; }
export interface PromoBanner { id: string; title: string; subtitle: string; message: string; cta_label: string; cta_url: string; event_date: string | null; image_url: string; is_active: boolean; }
export interface Lead { id: string; first_name: string; last_name: string; email: string; source: string; consent: boolean; created_at: string; unsubscribed_at: string | null; }
export interface AdminUser { id: string; email: string; label: string | null; created_at: string; }

export interface TakeawayItem { id: string; name: string; description: string; price: number; position: number; is_active: boolean; }
