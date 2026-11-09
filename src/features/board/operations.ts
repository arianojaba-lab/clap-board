import type { BoardCard, BoardData, BoardList } from "./types";

export function findCardLocation(
  board: BoardData,
  cardId: string,
): { list: BoardList; index: number; card: BoardCard } | undefined {
  for (const list of board.lists) {
    const index = list.cards.findIndex((card) => card.id === cardId);
    if (index !== -1) return { list, index, card: list.cards[index] };
  }
  return undefined;
}

export function moveCard(
  board: BoardData,
  cardId: string,
  targetListId: string,
  targetIndex: number,
): BoardData {
  const source = findCardLocation(board, cardId);
  const target = board.lists.find((list) => list.id === targetListId);
  if (!source || !target || target.archived || source.list.archived) return board;

  const lists = board.lists.map((list) => ({ ...list, cards: [...list.cards] }));
  const sourceList = lists.find((list) => list.id === source.list.id)!;
  const targetList = lists.find((list) => list.id === targetListId)!;
  const [card] = sourceList.cards.splice(source.index, 1);
  const destination = Math.max(0, Math.min(targetIndex, targetList.cards.length));
  targetList.cards.splice(destination, 0, {
    ...card,
    updatedAt: new Date().toISOString(),
  });
  return { ...board, lists, updatedAt: new Date().toISOString() };
}

export function reorderLists(
  board: BoardData,
  activeId: string,
  overId: string,
): BoardData {
  const from = board.lists.findIndex((list) => list.id === activeId);
  const to = board.lists.findIndex((list) => list.id === overId);
  if (from < 0 || to < 0 || from === to) return board;

  const lists = [...board.lists];
  const [moved] = lists.splice(from, 1);
  lists.splice(to, 0, moved);
  return { ...board, lists, updatedAt: new Date().toISOString() };
}

export function getVisibleCards(
  board: BoardData,
  options: {
    query?: string;
    labelId?: string;
    status?: "all" | "open" | "complete" | "overdue";
    includeArchived?: boolean;
  } = {},
): BoardList[] {
  const query = options.query?.trim().toLocaleLowerCase();
  const today = new Date().toISOString().slice(0, 10);
  return board.lists
    .filter((list) => options.includeArchived || !list.archived)
    .map((list) => ({
      ...list,
      cards: list.cards.filter((card) => {
        if (!options.includeArchived && card.archived) return false;
        if (
          query &&
          !`${card.title} ${card.description}`
            .toLocaleLowerCase()
            .includes(query)
        )
          return false;
        if (options.labelId && !card.labelIds.includes(options.labelId))
          return false;
        if (options.status === "open" && card.completed) return false;
        if (options.status === "complete" && !card.completed) return false;
        if (
          options.status === "overdue" &&
          (!card.dueDate || card.dueDate >= today || card.completed)
        )
          return false;
        return true;
      }),
    }));
}

export function archiveCard(board: BoardData, cardId: string): BoardData {
  const location = findCardLocation(board, cardId);
  if (!location) return board;
  return {
    ...board,
    lists: board.lists.map((list) => ({
      ...list,
      cards: list.cards.map((card) =>
        card.id === cardId ? { ...card, archived: true } : card,
      ),
    })),
    updatedAt: new Date().toISOString(),
  };
}

export function restoreCard(board: BoardData, cardId: string): BoardData {
  return {
    ...board,
    lists: board.lists.map((list) => ({
      ...list,
      cards: list.cards.map((card) =>
        card.id === cardId ? { ...card, archived: false } : card,
      ),
    })),
    updatedAt: new Date().toISOString(),
  };
}

export function validateBoardImport(value: unknown): BoardData {
  if (
    !value ||
    typeof value !== "object" ||
    !("schemaVersion" in value) ||
    !("title" in value) ||
    !("lists" in value) ||
    !Array.isArray(value.lists)
  ) {
    throw new Error("The selected file is not a valid board.");
  }

  const board = value as Partial<BoardData>;
  if (
    board.schemaVersion !== 1 ||
    typeof board.title !== "string" ||
    !Array.isArray(board.lists)
  ) {
    throw new Error("This board file version is not supported.");
  }

  const ids = new Set<string>();
  for (const list of board.lists) {
    if (
      !list ||
      typeof list.id !== "string" ||
      typeof list.title !== "string" ||
      !Array.isArray(list.cards)
    ) {
      throw new Error("A column in this file is invalid.");
    }
    for (const card of list.cards) {
      if (
        !card ||
        typeof card.id !== "string" ||
        typeof card.title !== "string" ||
        ids.has(card.id)
      ) {
        throw new Error("A card title or ID in this file is invalid.");
      }
      ids.add(card.id);
    }
  }

  return {
    schemaVersion: 1,
    id: "local-board",
    title: board.title,
    description: typeof board.description === "string" ? board.description : "",
    background:
      typeof board.background === "string" ? board.background : "#edf3ef",
    lists: board.lists as BoardList[],
    labels: Array.isArray(board.labels) ? board.labels : [],
    members: Array.isArray(board.members) ? board.members : [],
    activity: Array.isArray(board.activity) ? board.activity : [],
    updatedAt: new Date().toISOString(),
  };
}
