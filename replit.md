# Overview

CiviVerse is a web-based AI image generation platform leveraging CivitAI's official API to create real images. It offers a comprehensive interface for model browsing, LoRA configuration, and real-time generation tracking. Users can select AI models (checkpoints, LoRAs, embeddings), customize prompts and settings, apply LoRAs with adjustable strengths, and manage their generation history through a credit-based system. The platform stores generated images and metadata in object storage, enabling regeneration and providing a structured file organization system. Key features include a character management system, a scene element organizer, an advanced image upscaling feature, and a demo account system for new users.

# User Preferences

Preferred communication style: Simple, everyday language.
Prompt structure preference: Image quality terms first, followed by character description, then additional details.

# System Architecture

## Frontend Architecture
- **Framework**: React with TypeScript
- **Styling**: Tailwind CSS with custom dark theme and Shadcn/ui
- **State Management**: TanStack Query
- **Routing**: Wouter
- **Forms**: React Hook Form with Zod validation
- **Real-time Updates**: WebSocket integration

## Backend Architecture
- **Runtime**: Node.js with Express.js
- **Language**: TypeScript
- **API Design**: RESTful endpoints with WebSocket support
- **Storage**: PostgreSQL (Neon) via Drizzle ORM — see server/db.ts and server/storage.ts
- **Build System**: Vite

## Data Storage Solutions
- **Database ORM**: Drizzle ORM configured for PostgreSQL
- **Schema Design**: Normalized tables for users, models, generations, and favorites
- **File Storage**: Object storage integration for generated images and JSON metadata, enabling regeneration support.
- **Current Implementation**: Database-backed storage with object storage for files.

## Authentication and Authorization
- **Current State**: Replit OAuth with a shared demo account system for trial access.
- **Demo Account**: Pre-configured demo_user_fixed_id with credit management.
- **Session Management**: Express session configuration with PostgreSQL session store.
- **User Model**: Complete user schema with credits, generation tracking, and profile management.

## External Service Integrations
- **AI Generation**: CivitAI JavaScript SDK for real image generation and job management.
- **Image Storage**: Digital Ocean Spaces for blob storage and Replit Object Storage for permanent archival.
- **Real-time Polling**: Continuous job status tracking for generation progress.
- **Model Management**: Live CivitAI model fetching.

## Key Design Patterns
- **Modular Components**: Reusable UI components.
- **Type Safety**: End-to-end TypeScript.
- **Real-time Architecture**: WebSocket integration for immediate user feedback.
- **Responsive Design**: Mobile-first approach.

# External Dependencies

## Core Technologies
- **React Ecosystem**: React, React DOM, React Hook Form, TanStack Query
- **UI Framework**: Radix UI primitives with Shadcn/ui
- **Styling**: Tailwind CSS
- **Backend**: Express.js
- **Database**: Drizzle ORM with PostgreSQL dialect

## Third-party Services
- **AI Platform**: CivitAI JavaScript SDK (v0.1.15)
- **Image Storage**: Digital Ocean Spaces, Replit Object Storage
- **Database Provider**: Neon Database (for PostgreSQL hosting)
- **Session Storage**: PostgreSQL-based session management
- **AI Upscaling**: Replicate predictions API (for GFPGAN and Real-ESRGAN)

## External API (v1)
- **Authentication**: API key-based (Bearer token in Authorization header)
- **Rate Limiting**: Configurable daily credit limit per key (default 5000/day)
- **Endpoints**: /api/v1/ with routes for account, models, characters, generate, generations, story, tts
- **Bot Accounts**: Admin can create dedicated bot accounts with custom credit limits
- **User API Keys**: All users can generate/revoke their own API keys in Settings page (GET/POST/DELETE /api/user/external-api-key)
- **Key Management**: Admin UI in admin page; user self-service in Settings page; keys stored as SHA-256 hashes
- **Crypto Donations**: Ethereum donation box in Settings page (address: 0xa9023E435DA07ee9EC9fA8Aa32dA26e26a3305fE)
- **File**: server/api-v1.ts contains middleware and route handlers

## Utility Libraries
- **Validation**: Zod
- **Styling Utilities**: clsx, Tailwind Merge
- **Date Handling**: date-fns
- **Icons**: Lucide React
- **Carousel**: Embla Carousel