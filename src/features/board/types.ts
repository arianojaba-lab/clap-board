export type LabelColor =
  | "mint"
  | "blue"
  | "lilac"
  | "peach"
  | "yellow"
  | "rose";

export interface BoardLabel {
  id: string;
  name: string;
  color: LabelColor;
}

export interface BoardMember {
  id: string;
  name: string;
  initials: string;
  color: string;
}

export interface ChecklistItem {
  id: string;
  title: string;
  completed: boolean;
}

export interface CardComment {
  id: string;
  text: string;
  createdAt: string;
}

export interface CardAttachment {
  id: string;
  name: string;
  size: number;
  type: string;
}

export interface BoardCard {
  id: string;
  title: string;
  description: string;
  labelIds: string[];
  memberIds: string[];
  dueDate?: string;
  completed: boolean;
  archived: boolean;
  checklist: ChecklistItem[];
  comments: CardComment[];
  attachments: CardAttachment[];
  createdAt: string;
  updatedAt: string;
}

export interface BoardList {
  id: string;
  title: string;
  color: LabelColor;
  cards: BoardCard[];
  archived: boolean;
  collapsed: boolean;
}

export interface BoardActivity {
  id: string;
  message: string;
  createdAt: string;
}

export interface BoardData {
  schemaVersion: 1;
  id: string;
  title: string;
  description: string;
  background: string;
  lists: BoardList[];
  labels: BoardLabel[];
  members: BoardMember[];
  activity: BoardActivity[];
  updatedAt: string;
}

export type BoardView = "board" | "table" | "calendar";
