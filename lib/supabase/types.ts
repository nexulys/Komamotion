export type CameraMovement =
  | "static"
  | "pan_left"
  | "pan_right"
  | "zoom_in"
  | "zoom_out"
  | "dolly_in"
  | "orbit";

export type GenerationStatus = "pending" | "processing" | "completed" | "failed";
export type ProjectStatus = "draft" | "processing" | "ready" | "archived";
export type Resolution = "1080p" | "4k";
export type AiProvider = "fal" | "replicate";
export type PlanId = "free" | "starter" | "studio" | "pro";
export type ExportRatio = "16:9" | "9:16" | "1:1";
export type ExportStatus = "pending" | "processing" | "completed" | "failed";
export type CreditTransactionType =
  | "subscription_grant"
  | "purchase"
  | "generation_debit"
  | "refund"
  | "manual_adjustment"
  | "signup_bonus"
  | "admin_grant";

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          email: string;
          display_name: string | null;
          avatar_url: string | null;
          plan: PlanId;
          credits_balance: number;
          stripe_customer_id: string | null;
          stripe_subscription_id: string | null;
          stripe_subscription_status: string | null;
          is_admin: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["users"]["Row"]> & {
          id: string;
          email: string;
        };
        Update: Partial<Database["public"]["Tables"]["users"]["Row"]>;
        Relationships: [];
      };
      projects: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          description: string | null;
          cover_image_url: string | null;
          status: ProjectStatus;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["projects"]["Row"]> & {
          user_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["projects"]["Row"]>;
        Relationships: [];
      };
      generations: {
        Row: {
          id: string;
          project_id: string;
          user_id: string;
          source_image_url: string;
          output_video_url: string | null;
          thumbnail_url: string | null;
          status: GenerationStatus;
          progress: number;
          provider: AiProvider;
          model: string;
          prompt: string | null;
          camera_movement: CameraMovement;
          motion_intensity: number;
          fps: number;
          resolution: Resolution;
          colorize: boolean;
          remove_text: boolean;
          cleaned_image_url: string | null;
          upscaled_video_url: string | null;
          audio_url: string | null;
          watermarked: boolean;
          export_ratio: ExportRatio;
          batch_id: string | null;
          duration_seconds: number;
          credits_cost: number;
          estimated_cost_usd: number | null;
          external_job_id: string | null;
          error_message: string | null;
          created_at: string;
          updated_at: string;
          completed_at: string | null;
        };
        Insert: Partial<Database["public"]["Tables"]["generations"]["Row"]> & {
          project_id: string;
          user_id: string;
          source_image_url: string;
        };
        Update: Partial<Database["public"]["Tables"]["generations"]["Row"]>;
        Relationships: [];
      };
      generation_exports: {
        Row: {
          id: string;
          generation_id: string;
          user_id: string;
          ratio: ExportRatio;
          status: ExportStatus;
          video_url: string | null;
          error_message: string | null;
          created_at: string;
          completed_at: string | null;
        };
        Insert: Partial<Database["public"]["Tables"]["generation_exports"]["Row"]> & {
          generation_id: string;
          user_id: string;
          ratio: ExportRatio;
        };
        Update: Partial<Database["public"]["Tables"]["generation_exports"]["Row"]>;
        Relationships: [];
      };
      panel_extractions: {
        Row: {
          id: string;
          project_id: string;
          user_id: string;
          source_page_url: string;
          status: ExportStatus;
          panel_urls: string[];
          error_message: string | null;
          created_at: string;
          completed_at: string | null;
        };
        Insert: Partial<Database["public"]["Tables"]["panel_extractions"]["Row"]> & {
          project_id: string;
          user_id: string;
          source_page_url: string;
        };
        Update: Partial<Database["public"]["Tables"]["panel_extractions"]["Row"]>;
        Relationships: [];
      };
      credit_transactions: {
        Row: {
          id: string;
          user_id: string;
          amount: number;
          type: CreditTransactionType;
          description: string | null;
          generation_id: string | null;
          stripe_event_id: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["credit_transactions"]["Row"]> & {
          user_id: string;
          amount: number;
          type: CreditTransactionType;
        };
        Update: Partial<Database["public"]["Tables"]["credit_transactions"]["Row"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

export type UserRow = Database["public"]["Tables"]["users"]["Row"];
export type ProjectRow = Database["public"]["Tables"]["projects"]["Row"];
export type GenerationRow = Database["public"]["Tables"]["generations"]["Row"];
export type GenerationExportRow = Database["public"]["Tables"]["generation_exports"]["Row"];
export type PanelExtractionRow = Database["public"]["Tables"]["panel_extractions"]["Row"];
export type CreditTransactionRow =
  Database["public"]["Tables"]["credit_transactions"]["Row"];
