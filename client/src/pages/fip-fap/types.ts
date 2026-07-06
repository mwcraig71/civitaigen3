import { SharedImage } from '@/types';

export interface PaginatedSharedImagesResponse {
  images: SharedImage[];
  hasMore: boolean;
  total: number;
  offset: number;
  limit: number;
}

export interface SearchResult {
  id: string;
  type: 'character' | 'prompt' | 'user' | 'rating';
  name: string;
  description?: string;
  avatar?: string;
  matchCount?: number;
}

export interface SearchResponse {
  results: SearchResult[];
  total: number;
}
