export type StoryKind = "latest" | "general";
export type Provenance = "editor reference" | "publisher excerpt" | "AI summary of publisher text" | "Wikimedia excerpt" | "article-derived extract" | "AI synthesis of publisher text";
export interface SourceLink { name: string; url: string; quality?: number; }
export interface Story {
  id: string;
  kind: StoryKind;
  category: string;
  title: string;
  summary: string;
  background: string;
  whyItMatters: string;
  whyRead: string;
  relatedFacts: string[];
  relatedIds: string[];
  uncertainty: string;
  worth: number;
  source: SourceLink;
  alsoReportedBy: SourceLink[];
  publishedAt?: string;
  readingMinutes: number;
  provenance: Provenance;
  imageUrl?: string;
  corroboration?: number;
  contentStatus?: "excerpt-only" | "article-extracted" | "synthesized";
  sourceNotes?: Array<{name:string;summary:string;url:string}>;
  eventMembers?: string[];
  updatedAt?: string;
}
export interface FeedConfig { id: string; name: string; url: string; tier: string; category: string; quality: number; enabled: boolean; licenseNote: string; }
export interface UserState { read: Record<string, number>; viewed: Record<string, number>; saved: Record<string, Story>; known: Record<string, number>; hidden: Record<string, number>; interesting: Record<string, number>; visits: number; lastGeneral: string[]; seen: Record<string, number>; latestCache: Story[]; latestFetchedAt: string; }
