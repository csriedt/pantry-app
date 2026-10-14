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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      ai_events: {
        Row: {
          at: string
          cache_tokens: number
          cost: number
          id: string
          input_tokens: number
          model: string
          output_tokens: number
          rates: Json
          reservation_id: string | null
          user_id: string | null
        }
        Insert: {
          at?: string
          cache_tokens: number
          cost: number
          id?: string
          input_tokens: number
          model: string
          output_tokens: number
          rates: Json
          reservation_id?: string | null
          user_id?: string | null
        }
        Update: {
          at?: string
          cache_tokens?: number
          cost?: number
          id?: string
          input_tokens?: number
          model?: string
          output_tokens?: number
          rates?: Json
          reservation_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_events_reservation_id_ai_reservations_id_fk"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "ai_reservations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_models: {
        Row: {
          currency: string
          id: string
          model: string
          rates: Json | null
          updated_at: string | null
        }
        Insert: {
          currency?: string
          id?: string
          model: string
          rates?: Json | null
          updated_at?: string | null
        }
        Update: {
          currency?: string
          id?: string
          model?: string
          rates?: Json | null
          updated_at?: string | null
        }
        Relationships: []
      }
      ai_reservations: {
        Row: {
          closed_at: string | null
          created_at: string
          id: string
          reserved_cost: number
          status: string
          user_id: string
        }
        Insert: {
          closed_at?: string | null
          created_at?: string
          id?: string
          reserved_cost: number
          status: string
          user_id: string
        }
        Update: {
          closed_at?: string | null
          created_at?: string
          id?: string
          reserved_cost?: number
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      categories: {
        Row: {
          id: string
          label: string
          parent_id: string | null
          slug: string
          sort: number
        }
        Insert: {
          id?: string
          label: string
          parent_id?: string | null
          slug: string
          sort?: number
        }
        Update: {
          id?: string
          label?: string
          parent_id?: string | null
          slug?: string
          sort?: number
        }
        Relationships: [
          {
            foreignKeyName: "categories_parent_id_categories_id_fk"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      deletion_requests: {
        Row: {
          cancelled_at: string | null
          execute_after: string | null
          id: string
          purge_counts: Json | null
          purged_at: string | null
          requested_at: string
          status: string
          user_id: string
        }
        Insert: {
          cancelled_at?: string | null
          execute_after?: string | null
          id?: string
          purge_counts?: Json | null
          purged_at?: string | null
          requested_at?: string
          status?: string
          user_id: string
        }
        Update: {
          cancelled_at?: string | null
          execute_after?: string | null
          id?: string
          purge_counts?: Json | null
          purged_at?: string | null
          requested_at?: string
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      foods: {
        Row: {
          aliases: string[] | null
          canonical_name: string
          category_id: string | null
          created_at: string
          density_g_per_ml: number | null
          id: string
          normalized_name: string
          owner_id: string | null
          pack_sizes: Json | null
          scope: string
          slug: string | null
          source: string | null
        }
        Insert: {
          aliases?: string[] | null
          canonical_name: string
          category_id?: string | null
          created_at?: string
          density_g_per_ml?: number | null
          id?: string
          normalized_name: string
          owner_id?: string | null
          pack_sizes?: Json | null
          scope: string
          slug?: string | null
          source?: string | null
        }
        Update: {
          aliases?: string[] | null
          canonical_name?: string
          category_id?: string | null
          created_at?: string
          density_g_per_ml?: number | null
          id?: string
          normalized_name?: string
          owner_id?: string | null
          pack_sizes?: Json | null
          scope?: string
          slug?: string | null
          source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "foods_category_id_categories_id_fk"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      meals: {
        Row: {
          at: string
          booked: Json | null
          id: string
          recipe_id: string
          undone_at: string | null
          user_id: string
          writer: string
        }
        Insert: {
          at?: string
          booked?: Json | null
          id?: string
          recipe_id: string
          undone_at?: string | null
          user_id: string
          writer: string
        }
        Update: {
          at?: string
          booked?: Json | null
          id?: string
          recipe_id?: string
          undone_at?: string | null
          user_id?: string
          writer?: string
        }
        Relationships: [
          {
            foreignKeyName: "meals_recipe_id_recipes_id_fk"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      pantry: {
        Row: {
          added_at: string
          amount: number | null
          food_id: string
          id: string
          stock_state: string | null
          unit: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          added_at?: string
          amount?: number | null
          food_id: string
          id?: string
          stock_state?: string | null
          unit?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          added_at?: string
          amount?: number | null
          food_id?: string
          id?: string
          stock_state?: string | null
          unit?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pantry_food_id_foods_id_fk"
            columns: ["food_id"]
            isOneToOne: false
            referencedRelation: "foods"
            referencedColumns: ["id"]
          },
        ]
      }
      pantry_state: {
        Row: {
          deleted_at: string | null
          last_mutated_by: string | null
          state_version: number
          updated_at: string
          user_id: string
        }
        Insert: {
          deleted_at?: string | null
          last_mutated_by?: string | null
          state_version?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          deleted_at?: string | null
          last_mutated_by?: string | null
          state_version?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      recipe_ingredients: {
        Row: {
          amount: number | null
          food_id: string
          id: string
          recipe_id: string
          unit: string | null
        }
        Insert: {
          amount?: number | null
          food_id: string
          id?: string
          recipe_id: string
          unit?: string | null
        }
        Update: {
          amount?: number | null
          food_id?: string
          id?: string
          recipe_id?: string
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recipe_ingredients_food_id_foods_id_fk"
            columns: ["food_id"]
            isOneToOne: false
            referencedRelation: "foods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_ingredients_recipe_id_recipes_id_fk"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_trend_runs: {
        Row: {
          computed_at: string | null
          error: string | null
          horizon: string
          id: string
          scope: string | null
          status: string | null
        }
        Insert: {
          computed_at?: string | null
          error?: string | null
          horizon: string
          id?: string
          scope?: string | null
          status?: string | null
        }
        Update: {
          computed_at?: string | null
          error?: string | null
          horizon?: string
          id?: string
          scope?: string | null
          status?: string | null
        }
        Relationships: []
      }
      recipe_trends: {
        Row: {
          cooks: number | null
          kitchens: number | null
          last_cooked_at: string | null
          rank: number | null
          recipe_id: string
          repeat_kitchens: number | null
          run_id: string
        }
        Insert: {
          cooks?: number | null
          kitchens?: number | null
          last_cooked_at?: string | null
          rank?: number | null
          recipe_id: string
          repeat_kitchens?: number | null
          run_id: string
        }
        Update: {
          cooks?: number | null
          kitchens?: number | null
          last_cooked_at?: string | null
          rank?: number | null
          recipe_id?: string
          repeat_kitchens?: number | null
          run_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipe_trends_recipe_id_recipes_id_fk"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_trends_run_id_recipe_trend_runs_id_fk"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "recipe_trend_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      recipes: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          itemset_key: string
          revision: number
          source: string
          steps: Json | null
          superseded_by: string | null
          title: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          itemset_key: string
          revision?: number
          source: string
          steps?: Json | null
          superseded_by?: string | null
          title?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          itemset_key?: string
          revision?: number
          source?: string
          steps?: Json | null
          superseded_by?: string | null
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recipes_superseded_by_recipes_id_fk"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      shopping_list_items: {
        Row: {
          created_at: string
          food_id: string
          id: string
          source: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          food_id: string
          id?: string
          source?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          food_id?: string
          id?: string
          source?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shopping_list_items_food_id_foods_id_fk"
            columns: ["food_id"]
            isOneToOne: false
            referencedRelation: "foods"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_shopping_list_item: {
        Args: { p_food_id: string; p_source?: string }
        Returns: number
      }
      cancel_deletion_request: { Args: never; Returns: boolean }
      checkoff_shopping_item: {
        Args: {
          p_amount?: number
          p_food_id: string
          p_stock_state?: string
          p_unit?: string
        }
        Returns: number
      }
      commit_meal: {
        Args: { p_booked: Json; p_recipe_id: string; p_writer?: string }
        Returns: Json
      }
      get_pantry_snapshot: { Args: never; Returns: Json }
      get_pantry_snapshot_for: { Args: { p_user_id: string }; Returns: Json }
      list_meals_for: {
        Args: { p_limit?: number; p_user_id: string }
        Returns: {
          at: string
          booked: Json | null
          id: string
          recipe_id: string
          undone_at: string | null
          user_id: string
          writer: string
        }[]
        SetofOptions: {
          from: "*"
          to: "meals"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      remove_pantry_item: { Args: { p_food_id: string }; Returns: number }
      undo_meal: { Args: { p_meal_id: string }; Returns: number }
      upsert_pantry_item: {
        Args: {
          p_amount?: number
          p_food_id: string
          p_stock_state?: string
          p_unit?: string
        }
        Returns: number
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
