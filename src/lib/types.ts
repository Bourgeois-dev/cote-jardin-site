export interface MenuItem { id: string; name: string; category: string; description: string; price: number; position: number; is_active: boolean; }
export interface GalleryImage { id: string; url: string; alt: string; caption: string; position: number; is_active: boolean; }
export interface Partner { id: string; name: string; description: string; image_url: string; category: string; website: string; location: string; partner_type: string; featured: boolean; position: number; is_active: boolean; }
export interface Review { id: string; author: string; rating: number; content: string; position: number; is_active: boolean; }
export interface SocialLink { id: string; platform: string; url: string; position: number; is_active: boolean; }
export interface OpeningHour { id: string; day_of_week: number; is_closed: boolean; lunch_open: string | null; lunch_close: string | null; dinner_open: string | null; dinner_close: string | null; }
export interface ClosurePeriod { id: string; start_date: string; end_date: string; reason: string; blocks_reservations: boolean; service: 'midi' | 'soir' | null; note_interne: string; custom_message: string; }
export interface PromoBanner { id: string; title: string; subtitle: string; message: string; cta_label: string; cta_url: string; event_date: string | null; image_url: string; is_active: boolean; }
export interface RestaurantTable { id: string; label: string; capacity: number; online_limit: number; pos_x: number; pos_y: number; shape: string; is_active: boolean; area_id: string | null; }
export interface DiningArea { id: string; name: string; position: number; }
export interface Reservation { id: string; customer_name: string; email: string; phone: string; date: string; time: string; covers: number; table_id: string | null; table_ids: string[]; status: string; notes: string; source: string; created_at: string; customer_id: string | null; }
export interface Customer { id: string; name: string; email: string; phone: string; is_vip: boolean; notes: string; bookings_count: number; covers_total: number; no_show_count: number; cancelled_count: number; first_visit: string | null; last_visit: string | null; created_at: string; }
export interface Lead { id: string; first_name: string; last_name: string; email: string; source: string; consent: boolean; created_at: string; }
export interface ReservationSettings { id: string; phone_threshold: number; min_advance_hours: number; slot_duration: number; booking_horizon_days: number; enabled: boolean; newsletter_optin: boolean; max_covers_per_slot: number | null; waitlist_enabled: boolean; reminder_enabled: boolean; table_duration: number; }
export interface AdminUser { id: string; email: string; label: string | null; created_at: string; }

export interface TakeawayItem { id: string; name: string; description: string; price: number; position: number; is_active: boolean; }
