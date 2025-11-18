-- Migration: Core Schemas and ENUM Types
-- Description: Initialize schemas and define all ENUM types

-- Create raw schema for source data
CREATE SCHEMA IF NOT EXISTS raw;

-- User roles
CREATE TYPE public.user_role AS ENUM ('admin', 'editor', 'viewer');

-- Item types on the tray
CREATE TYPE public.item_type AS ENUM ('FOOD', 'BUZZER', 'PLATE', 'BOTTLE', 'OTHER');

-- Buzzer colors
CREATE TYPE public.buzzer_color AS ENUM ('green', 'blue', 'red', 'white');

-- Source of tray item
CREATE TYPE public.tray_item_source AS ENUM (
  'RECIPE_LINE_OPTION',  -- From recipe (one of options)
  'MENU_ITEM',           -- Added from active menu
  'MANUAL'               -- Added manually (buzzer, wallet, etc.)
);

-- Validation types
CREATE TYPE public.validation_type AS ENUM (
  'FOOD_VALIDATION',
  'PLATE_VALIDATION',
  'BUZZER_VALIDATION',
  'OCCLUSION_VALIDATION',
  'BOTTLE_ORIENTATION_VALIDATION'
);









