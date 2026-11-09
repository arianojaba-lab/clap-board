"use client";

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  AlignLeft,
  Archive,
  ArrowDownToLine,
  ArrowUpRight,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Download,
  Ellipsis,
  Filter,
  LayoutGrid,
  MessageCircle,
  Paperclip,
  Plus,
  Search,
  Settings2,
  Sparkles,
  Table2,
  Trash2,
  Undo2,
  Upload,
  X,
} from "lucide-react";
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import {
  archiveCard,
  findCardLocation,
  getVisibleCards,
  moveCard,
  reorderLists,
  restoreCard,
  validateBoardImport,
} from "./operations";
import {
  deleteAttachment,
  getAttachment,
  loadBoard,
  resetLocalBoard,
  saveAttachment,
  saveBoard,
} from "./storage";
import type {
  BoardCard,
  BoardData,
  BoardLabel,
  BoardList,
  BoardView,
  CardAttachment,
  ChecklistItem,
} from "./types";

function makeId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

function formatDate(value?: string): string {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(new Date(`${value}T12:00:00`));
}

function overdue(value?: string): boolean {
  return Boolean(value && value < new Date().toISOString().slice(0, 10));
}

function withActivity(board: BoardData, message: string): BoardData {
  return {
    ...board,
    updatedAt: new Date().toISOString(),
    activity: [
      {
        id: makeId("activity"),
        message,
        createdAt: new Date().toISOString(),
      },
      ...board.activity,
    ].slice(0, 80),
  };
}

function makeCard(): BoardCard {
  const now = new Date().toISOString();
  return {
    id: makeId("card"),
    title: "",
    description: "",
    labelIds: [],
    memberIds: [],
    completed: false,
    archived: false,
    checklist: [],
    comments: [],
    attachments: [],
    createdAt: now,
    updatedAt: now,
  };
}

export default function BoardApp() {
  const [board, setBoard] = useState<BoardData | null>(null);
  const boardRef = useRef<BoardData | null>(null);
  const undoStack = useRef<BoardData[]>([]);
  const redoStack = useRef<BoardData[]>([]);
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState("");
  const [toast, setToast] = useState("");
  const [view, setView] = useState<BoardView>("board");
  const [query, setQuery] = useState("");
  const [labelFilter, setLabelFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "open" | "complete" | "overdue"
  >("all");
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [archiveDropAnimationDisabled, setArchiveDropAnimationDisabled] = useState(false);
  const [landedCardId, setLandedCardId] = useState<string | null>(null);
  const [dropPreview, setDropPreview] = useState<{ listId: string; index: number } | null>(null);
  const [archiveBurst, setArchiveBurst] = useState(0);
  const [archivingCardId, setArchivingCardId] = useState<string | null>(null);
  const [archiveAnimation, setArchiveAnimation] = useState<{
    id: string;
    cardId: string;
    card: BoardCard;
    rect: { left: number; top: number; width: number; height: number };
    particles: { x: number; y: number; rotation: number; scale: number; color: string; size: number }[];
  } | null>(null);
  const archiveAnimationId = useRef<string | null>(null);
  const archiveAnimationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [newCardListId, setNewCardListId] = useState<string | null>(null);
  const [newCardDraft, setNewCardDraft] = useState<BoardCard | null>(null);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [editingListId, setEditingListId] = useState<string | null>(null);
  const [listTitleDraft, setListTitleDraft] = useState("");
  const [newListTitle, setNewListTitle] = useState("");
  const [boardTitleEditing, setBoardTitleEditing] = useState(false);
  const [boardTitleDraft, setBoardTitleDraft] = useState("");
  const importInput = useRef<HTMLInputElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const swipeStart = useRef<{ x: number; y: number } | null>(null);

  const announce = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 3200);
  }, []);

  useEffect(() => {
    let active = true;
    loadBoard()
      .then((loaded) => {
        if (!active) return;
        boardRef.current = loaded;
        setBoard(loaded);
        setBoardTitleDraft(loaded.title);
        setReady(true);
      })
      .catch(() => {
        if (active) {
          setStorageError("Could not load the board from this browser.");
          setReady(true);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!ready || !board) return;
    saveBoard(board).then(
      () => setStorageError(""),
      () => setStorageError("Could not save locally. Check available browser storage."),
    );
  }, [board, ready]);

  useEffect(() => {
    if (!board) return;
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target?.isContentEditable ||
        ["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName ?? "");
      if (typing || event.isComposing || event.altKey || event.ctrlKey || event.metaKey)
        return;
      if (event.key === "Escape") {
        setSelectedCardId(null);
        setArchiveOpen(false);
        setHelpOpen(false);
      } else if (event.key === "?") {
        setHelpOpen((value) => !value);
      } else if (event.key.toLocaleLowerCase() === "n") {
        const listId = board.lists.find((list) => !list.archived)?.id ?? null;
        if (listId) {
          setNewCardListId(listId);
          setNewCardDraft(makeCard());
        }
      } else if (event.key.toLocaleLowerCase() === "z") {
        const previous = undoStack.current.pop();
        const current = boardRef.current;
        if (previous && current) {
          redoStack.current = [...redoStack.current, current];
          boardRef.current = previous;
          setBoard(previous);
          announce("Last change undone.");
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [announce, board]);

  const commit = useCallback(
    (update: (current: BoardData) => BoardData, message?: string) => {
      const current = boardRef.current;
      if (!current) return;
      const next = update(current);
      if (next === current) return;
      undoStack.current = [...undoStack.current, current].slice(-30);
      redoStack.current = [];
      const result = message ? withActivity(next, message) : next;
      boardRef.current = result;
      setBoard(result);
    },
    [],
  );

  const undo = useCallback(() => {
    const previous = undoStack.current.pop();
    const current = boardRef.current;
    if (!previous || !current) {
      announce("Nothing to undo.");
      return;
    }
    redoStack.current = [...redoStack.current, current];
    boardRef.current = previous;
    setBoard(previous);
    announce("Last change undone.");
  }, [announce]);

  const redo = useCallback(() => {
    const next = redoStack.current.pop();
    const current = boardRef.current;
    if (!next || !current) return;
    undoStack.current = [...undoStack.current, current];
    boardRef.current = next;
    setBoard(next);
    announce("Change redone.");
  }, [announce]);

  const filteredLists = useMemo(
    () =>
      board
        ? getVisibleCards(board, {
            query,
            labelId: labelFilter || undefined,
            status: statusFilter,
          })
        : [],
    [board, labelFilter, query, statusFilter],
  );
  const filterActive = Boolean(query || labelFilter || statusFilter !== "all");
  const selectedLocation =
    board && selectedCardId ? findCardLocation(board, selectedCardId) : undefined;
  const draftCard = selectedLocation?.card ?? newCardDraft ?? undefined;
  const activeLocation =
    board && activeCardId ? findCardLocation(board, activeCardId) : undefined;
  const archivedCards =
    board?.lists.flatMap((list) =>
      list.cards
        .filter((card) => card.archived)
        .map((card) => ({ card, list })),
    ) ?? [];
  const archivedLists = board?.lists.filter((list) => list.archived) ?? [];
  const activeCardCount =
    board?.lists.reduce(
      (total, list) =>
        total +
        (list.archived ? 0 : list.cards.filter((card) => !card.archived).length),
      0,
    ) ?? 0;
  const viewIndex: Record<BoardView, number> = {
    board: 0,
    table: 1,
    calendar: 2,
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 7 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 250, tolerance: 8 },
    }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragStart(event: DragStartEvent) {
    setArchiveDropAnimationDisabled(false);
    setActiveCardId(String(event.active.id));
    setDropPreview(null);
  }

  function handleDragOver(event: DragOverEvent) {
    if (!board || !event.over) {
      setDropPreview(null);
      return;
    }
    const overId = String(event.over.id);
    if (overId === "archive-drop") {
      setDropPreview(null);
      return;
    }
    const location = findCardLocation(board, overId);
    const listId = board.lists.find((list) => list.id === overId)?.id ?? location?.list.id;
    if (!listId) {
      setDropPreview(null);
      return;
    }
    setDropPreview({
      listId,
      index: location
        ? location.list.cards
            .slice(0, location.index)
            .filter((card) => !card.archived).length
        : board.lists
            .find((list) => list.id === listId)
            ?.cards.filter((card) => !card.archived).length ?? 0,
    });
  }

  function handleDragEnd(event: DragEndEvent) {
    const isArchiveDrop = String(event.over?.id ?? "") === "archive-drop";
    setArchiveDropAnimationDisabled(isArchiveDrop);
    setActiveCardId(null);
    setDropPreview(null);
    if (!board || !event.over) return;
    const cardId = String(event.active.id);
    const overId = String(event.over.id);
    const source = findCardLocation(board, cardId);
    if (!source) return;
    if (overId === "archive-drop") {
      startArchiveAnimation(cardId, event.active.rect.current.translated ?? undefined);
      setArchiveBurst((current) => current + 1);
      window.setTimeout(() => setArchiveBurst(0), 720);
      return;
    }

    const targetLocation = findCardLocation(board, overId);
    const targetListId =
      board.lists.find((list) => list.id === overId)?.id ??
      targetLocation?.list.id;
    if (!targetListId) return;

    const targetList = board.lists.find((list) => list.id === targetListId);
    if (!targetList || targetList.archived) return;
    const overIndex = targetLocation?.index ?? targetList.cards.length;
    if (source.list.id === targetListId) {
      if (source.index === overIndex) return;
      commit(
        (current) => ({
          ...current,
          lists: current.lists.map((list) =>
            list.id === targetListId
              ? { ...list, cards: arrayMove(list.cards, source.index, overIndex) }
              : list,
          ),
        }),
        "Card order changed",
      );
    } else {
      commit(
        (current) => moveCard(current, cardId, targetListId, overIndex),
        "Card moved to another column",
      );
      setLandedCardId(cardId);
      window.setTimeout(
        () => setLandedCardId((current) => current === cardId ? null : current),
        520,
      );
    }
  }

  function startArchiveAnimation(
    cardId: string,
    bounds?: { left: number; top: number; width: number; height: number },
  ) {
    if (archiveAnimationId.current) return;
    const location = boardRef.current && findCardLocation(boardRef.current, cardId);
    if (!location) return;
    const overlayRect = document
      .querySelector<HTMLElement>(".drag-preview")
      ?.getBoundingClientRect();
    const element = document.querySelector<HTMLElement>(`[data-card-id="${cardId}"]`);
    const elementRect = element?.getBoundingClientRect();
    const rect = overlayRect
      ? { left: overlayRect.left, top: overlayRect.top, width: overlayRect.width, height: overlayRect.height }
      : bounds ?? (elementRect
        ? { left: elementRect.left, top: elementRect.top, width: elementRect.width, height: elementRect.height }
        : { left: window.innerWidth / 2 - 139, top: window.innerHeight / 2 - 55, width: 278, height: 110 });
    const colors = ["#159c68", "#55c98a", "#91dfb5", "#f2a65a", "#7c8da6"];
    const particles = Array.from({ length: 22 }, (_, index) => {
      const angle = Math.random() * Math.PI * 2;
      const distance = 65 + Math.random() * 100;
      return {
        x: Math.cos(angle) * distance,
        y: Math.sin(angle) * distance,
        rotation: Math.random() * 540 - 270,
        scale: 0.55 + Math.random() * 1.2,
        color: colors[index % colors.length],
        size: 6 + Math.random() * 9,
      };
    });
    archiveAnimationId.current = cardId;
    setArchivingCardId(cardId);
    setArchiveAnimation({
      id: makeId("archive-animation"),
      cardId,
      card: location.card,
      rect,
      particles,
    });
    archiveAnimationTimer.current = setTimeout(() => finishArchiveAnimation(cardId), 1300);
  }

  function finishArchiveAnimation(cardId: string) {
    if (archiveAnimationId.current !== cardId) return;
    if (archiveAnimationTimer.current) clearTimeout(archiveAnimationTimer.current);
    archiveAnimationTimer.current = null;
    archiveAnimationId.current = null;
    setArchivingCardId(null);
    setArchiveAnimation(null);
    commit((current) => archiveCard(current, cardId), "Card moved to archive");
    announce("Card archived.");
  }

  function saveCard(card: BoardCard, listId: string) {
    const isNew = Boolean(newCardDraft);
    commit(
      (current) => {
        const lists = current.lists.map((list) => {
          if (isNew && list.id === listId)
            return { ...list, cards: [card, ...list.cards] };
          return {
            ...list,
            cards: list.cards.map((existing) =>
              existing.id === card.id ? { ...card, updatedAt: new Date().toISOString() } : existing,
            ),
          };
        });
        return { ...current, lists };
      },
      isNew ? "Card created" : "Card details saved",
    );
    setSelectedCardId(null);
    setNewCardListId(null);
    setNewCardDraft(null);
    announce(isNew ? "Card added." : "Changes saved.");
  }

  function addList(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = newListTitle.trim();
    if (!board || !title) return;
    const list: BoardList = {
      id: makeId("list"),
      title,
      color: "mint",
      cards: [],
      archived: false,
      collapsed: false,
    };
    commit((current) => ({ ...current, lists: [...current.lists, list] }), "Column created");
    setNewListTitle("");
    announce("Column added.");
  }

  function saveListTitle(listId: string) {
    const title = listTitleDraft.trim();
    if (!title) {
      setEditingListId(null);
      return;
    }
    commit(
      (current) => ({
        ...current,
        lists: current.lists.map((list) =>
          list.id === listId ? { ...list, title } : list,
        ),
      }),
      "Column renamed",
    );
    setEditingListId(null);
  }

  function exportBoard() {
    if (!board) return;
    const file = new Blob([JSON.stringify(board, null, 2)], {
      type: "application/json",
    });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(file);
    link.download = "kanban-board.json";
    link.click();
    URL.revokeObjectURL(link.href);
    announce("JSON backup downloaded.");
  }

  async function importBoard(file?: File) {
    if (!file) return;
    try {
      const parsed = validateBoardImport(JSON.parse(await file.text()));
      if (!window.confirm("Replace the current board with the contents of this file?")) return;
      undoStack.current = [];
      redoStack.current = [];
      boardRef.current = parsed;
      setBoard(parsed);
      announce("Board restored from file.");
    } catch (error) {
      announce(
        error instanceof Error ? error.message : "Could not read the board file.",
      );
    } finally {
      if (importInput.current) importInput.current.value = "";
    }
  }

  async function resetDemo() {
    if (!window.confirm("Replace the local board with the sample board?")) return;
    try {
      const fresh = await resetLocalBoard();
      undoStack.current = [];
      redoStack.current = [];
      boardRef.current = fresh;
      setBoard(fresh);
      setQuery("");
      setLabelFilter("");
      setStatusFilter("all");
      announce("Sample board restored.");
    } catch {
      announce("Could not restore the sample board.");
    }
  }

  async function removeAttachment(id: string) {
    try {
      await deleteAttachment(id);
    } catch {
      announce("Could not delete the file from local storage.");
    }
  }

  if (!ready) {
    return (
      <main className="loading-screen">
        <span className="loading-mark"><LayoutGrid size={19} /></span>
        <span>Getting your board ready…</span>
      </main>
    );
  }

  if (!board) {
    return (
      <main className="load-error">
        <CircleHelp size={28} />
        <h1>Board could not be loaded</h1>
        <p>{storageError}</p>
        <button className="button button-primary" onClick={() => location.reload()}>
          Try again
        </button>
      </main>
    );
  }

  return (
    <div className="app-shell">
      <aside className="side-rail" aria-label="Main navigation">
        <div className="brand-mark" aria-label="Clap Board">
          <LayoutGrid size={20} strokeWidth={2.4} />
        </div>
        <div className="rail-divider" />
        <button className="rail-button active" aria-label="Current board" title="Current board">
          <LayoutGrid size={19} />
        </button>
        <button
          className="rail-button"
          aria-label="Open archive"
          title="Archive"
          onClick={() => setArchiveOpen(true)}
        >
          <Archive size={19} />
        </button>
        <div className="rail-spacer" />
        <button
          className="rail-button"
          aria-label="Keyboard shortcuts"
          title="Help"
          onClick={() => setHelpOpen(true)}
        >
          <CircleHelp size={19} />
        </button>
        <div className="local-avatar" title="Local browser profile">C</div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div className="breadcrumb">
            <span className="workspace-glyph"><Sparkles size={14} /></span>
            <span>My workspace</span>
            <ChevronRight size={14} className="muted-icon" />
            <span>Boards</span>
            <ChevronRight size={14} className="muted-icon" />
            <span className="crumb-current">{board.title}</span>
          </div>
          <div className="top-actions">
            <button
              className="icon-button"
              aria-label="Undo"
              title="Undo (Z)"
              onClick={undo}
            >
              <Undo2 size={17} />
            </button>
            <button
              className="icon-button"
              aria-label="Redo"
              title="Redo"
              onClick={redo}
            >
              <ArrowUpRight size={17} />
            </button>
            <span className="top-divider" />
            <div className="avatar-stack" aria-label="Sample members; online collaboration is unavailable">
              {board.members.slice(0, 3).map((member) => (
                <span
                  className="avatar avatar-small"
                  key={member.id}
                  style={{ backgroundColor: member.color }}
                  title={member.name}
                >
                  {member.initials}
                </span>
              ))}
              <span className="avatar avatar-more">+1</span>
            </div>
            <button
              className="button button-outline share-button"
              onClick={() => announce("This is a local demo. Online invitations are unavailable.")}
            >
              <ArrowUpRight size={15} />
              Share
            </button>
          </div>
        </header>

        <section className="board-heading">
          <div className="board-title-wrap">
            <div className="board-title-icon"><LayoutGrid size={19} /></div>
            {boardTitleEditing ? (
              <input
                autoFocus
                className="board-title-input"
                aria-label="Board name"
                value={boardTitleDraft}
                onChange={(event) => setBoardTitleDraft(event.target.value)}
                onBlur={() => {
                  const title = boardTitleDraft.trim();
                  if (title && title !== board.title)
                    commit((current) => ({ ...current, title }), "Board renamed");
                  setBoardTitleEditing(false);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") event.currentTarget.blur();
                  if (event.key === "Escape") {
                    setBoardTitleDraft(board.title);
                    setBoardTitleEditing(false);
                  }
                }}
              />
            ) : (
              <button
                className="board-title"
                onClick={() => {
                  setBoardTitleDraft(board.title);
                  setBoardTitleEditing(true);
                }}
                title="Click to rename"
              >
                {board.title}
              </button>
            )}
            <span className="private-pill"><span /> Private</span>
          </div>
          <p className="board-description">{board.description}</p>
          <div className="heading-rule">
            <span className="rule-dot" />
            <span className="rule-line" />
            <span className="rule-label">PROJECT OVERVIEW</span>
          </div>
        </section>

        <section className="board-toolbar" aria-label="Board tools">
          <div
            className="view-switcher"
            role="tablist"
            aria-label="Board views"
          >
            <span
              className="view-indicator"
              aria-hidden="true"
              style={{ transform: `translateX(${viewIndex[view] * 100}%)` }}
            />
            <button
              className={view === "board" ? "view-tab selected" : "view-tab"}
              role="tab"
              aria-selected={view === "board"}
              onClick={() => setView("board")}
            >
              <LayoutGrid size={16} /> Board
            </button>
            <button
              className={view === "table" ? "view-tab selected" : "view-tab"}
              role="tab"
              aria-selected={view === "table"}
              onClick={() => setView("table")}
            >
              <Table2 size={16} /> Table
            </button>
            <button
              className={view === "calendar" ? "view-tab selected" : "view-tab"}
              role="tab"
              aria-selected={view === "calendar"}
              onClick={() => setView("calendar")}
            >
              <CalendarDays size={16} /> Calendar
            </button>
          </div>

          <div className="toolbar-spacer" />
          <label className="search-control">
            <Search size={16} />
            <input
              aria-label="Search cards"
              placeholder="Search cards"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            {query && (
              <button aria-label="Clear search" onClick={() => setQuery("")}>
                <X size={14} />
              </button>
            )}
          </label>
          <label className={`filter-control ${filterActive ? "filter-active" : ""}`}>
            <Filter size={15} />
            <select
              aria-label="Filter cards"
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(
                  event.target.value as "all" | "open" | "complete" | "overdue",
                )
              }
            >
              <option value="all">All cards</option>
              <option value="open">In progress</option>
              <option value="complete">Completed</option>
              <option value="overdue">Overdue</option>
            </select>
            <ChevronDown size={14} />
          </label>
          <label className={`filter-control label-filter ${labelFilter ? "filter-active" : ""}`}>
            <span className="filter-color-dot" />
            <select
              aria-label="Filter by label"
              value={labelFilter}
              onChange={(event) => setLabelFilter(event.target.value)}
            >
              <option value="">All labels</option>
              {board.labels.map((label) => (
                <option key={label.id} value={label.id}>
                  {label.name}
                </option>
              ))}
            </select>
            <ChevronDown size={14} />
          </label>
          <button
            className="icon-button settings-button"
            title="Board settings"
            aria-label="Board settings"
            onClick={() => setHelpOpen(true)}
          >
            <Settings2 size={17} />
          </button>
        </section>

        {storageError && <p className="storage-warning" role="status">{storageError}</p>}
        {filterActive && (
          <div className="filter-summary" role="status">
            <span>{filteredLists.reduce((count, list) => count + list.cards.length, 0)} cards found</span>
            <button
              onClick={() => {
                setQuery("");
                setLabelFilter("");
                setStatusFilter("all");
              }}
            >
              Clear filters <X size={13} />
            </button>
            <span className="filter-sort-note">Reordering is paused while filters are active</span>
          </div>
        )}

        <div
          className="board-canvas"
          onTouchStart={(event) => {
            if ((event.target as HTMLElement).closest("button, input, select, .sortable-card, .lists-track, .table-scroll")) return;
            const touch = event.touches[0];
            swipeStart.current = { x: touch.clientX, y: touch.clientY };
          }}
          onTouchEnd={(event) => {
            const start = swipeStart.current;
            swipeStart.current = null;
            if (!start || activeCardId) return;
            const touch = event.changedTouches[0];
            const deltaX = touch.clientX - start.x;
            const deltaY = touch.clientY - start.y;
            if (Math.abs(deltaX) < 70 || Math.abs(deltaX) < Math.abs(deltaY) * 1.25) return;
            const nextIndex = Math.max(0, Math.min(2, viewIndex[view] + (deltaX < 0 ? 1 : -1)));
            setView((["board", "table", "calendar"] as const)[nextIndex]);
          }}
        >
          <div className="view-viewport">
            <div
              className="view-track"
              style={{ transform: `translateX(-${viewIndex[view] * (100 / 3)}%)` }}
            >
              <section className="view-panel" aria-label="Board view">
            <DndContext
              sensors={sensors}
              collisionDetection={closestCorners}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDragEnd={handleDragEnd}
              onDragCancel={() => {
                setActiveCardId(null);
                setArchiveDropAnimationDisabled(false);
                setDropPreview(null);
              }}
            >
              <ArchiveDropTarget active={Boolean(activeCardId)} burst={archiveBurst} />
              <div className="lists-track" aria-label="Board columns">
                {filteredLists
                  .filter((list) => !list.archived)
                  .map((list, index) => (
                    <BoardColumn
                      key={list.id}
                      list={list}
                      index={index}
                      labels={board.labels}
                      members={board.members}
                      disabled={filterActive}
                      editing={editingListId === list.id}
                      titleDraft={listTitleDraft}
                      onTitleDraftChange={setListTitleDraft}
                      onStartRename={() => {
                        setEditingListId(list.id);
                        setListTitleDraft(list.title);
                      }}
                      onSaveRename={() => saveListTitle(list.id)}
                      onAddCard={() => {
                        setNewCardListId(list.id);
                        setNewCardDraft(makeCard());
                      }}
                      onOpenCard={setSelectedCardId}
                      landedCardId={landedCardId}
                      archivingCardId={archivingCardId}
                      dropPreview={activeLocation && dropPreview?.listId === list.id && activeLocation.list.id !== list.id
                        ? { card: activeLocation.card, index: dropPreview.index }
                        : undefined}
                      onArchive={(cardId) => startArchiveAnimation(cardId)}
                      onToggleCollapse={() =>
                        commit((current) => ({
                          ...current,
                          lists: current.lists.map((item) =>
                            item.id === list.id
                              ? { ...item, collapsed: !item.collapsed }
                              : item,
                          ),
                        }))
                      }
                      onArchiveList={() => {
                        if (!window.confirm(`Archive “${list.title}”?`)) return;
                        commit(
                          (current) => ({
                            ...current,
                            lists: current.lists.map((item) =>
                              item.id === list.id ? { ...item, archived: true } : item,
                            ),
                          }),
                          "Column archived",
                        );
                      }}
                      onMoveList={(direction) =>
                        commit((current) => {
                          const from = current.lists.findIndex((item) => item.id === list.id);
                          const target = current.lists[from + direction];
                          return target
                            ? reorderLists(current, list.id, target.id)
                            : current;
                        })
                      }
                    />
                  ))}
                <form className="new-list-form" onSubmit={addList}>
                  <label htmlFor="new-list-title">New column</label>
                  <div className="new-list-field">
                    <input
                      id="new-list-title"
                      value={newListTitle}
                      onChange={(event) => setNewListTitle(event.target.value)}
                      placeholder="Column name"
                      maxLength={40}
                    />
                    <button className="icon-button add-list-button" aria-label="Add column">
                      <Plus size={18} />
                    </button>
                  </div>
                  <span>Columns and their order are flexible</span>
                </form>
              </div>
              {typeof document !== "undefined" &&
                createPortal(
                  <DragOverlay dropAnimation={archiveDropAnimationDisabled ? null : undefined}>
                    {activeLocation ? (
                      <CardFace
                        card={activeLocation.card}
                        labels={board.labels}
                        members={board.members}
                        onArchive={() => undefined}
                        dragging
                      />
                    ) : null}
                  </DragOverlay>,
                  document.body,
                )}
            </DndContext>
              </section>

              <section className="view-panel" aria-label="Table view">
                <BoardTable
                  lists={filteredLists.filter((list) => !list.archived)}
                  labels={board.labels}
                  onOpenCard={setSelectedCardId}
                />
              </section>
              <section className="view-panel" aria-label="Calendar view">
                <BoardCalendar
                  lists={filteredLists.filter((list) => !list.archived)}
                  labels={board.labels}
                  onOpenCard={setSelectedCardId}
                />
              </section>
            </div>
          </div>
        </div>

        <footer className="board-footer">
          <span><span className="footer-status-dot" /> Saved in this browser</span>
          <span>{activeCardCount} active cards</span>
          <button onClick={exportBoard}><Download size={14} /> Export backup</button>
          <button onClick={() => importInput.current?.click()}><Upload size={14} /> Import backup</button>
          <button onClick={resetDemo}><Undo2 size={14} /> Reset sample</button>
          <input
            ref={importInput}
            className="visually-hidden"
            type="file"
            accept="application/json,.json"
            aria-label="Choose a backup file"
            onChange={(event) => importBoard(event.target.files?.[0])}
          />
        </footer>
      </main>

      {draftCard && (
        <CardDialog
          key={draftCard.id}
          card={draftCard}
          list={board.lists.find((list) => list.id === (newCardListId ?? selectedLocation?.list.id))}
          board={board}
          isNew={Boolean(newCardListId)}
          onClose={() => {
            setSelectedCardId(null);
            setNewCardListId(null);
            setNewCardDraft(null);
          }}
          onSave={saveCard}
          onDelete={async (card) => {
            if (!window.confirm(`Permanently delete “${card.title}”?`)) return;
            commit(
              (current) => ({
                ...current,
                lists: current.lists.map((list) => ({
                  ...list,
                  cards: list.cards.filter((item) => item.id !== card.id),
                })),
              }),
              "Card permanently deleted",
            );
            for (const attachment of card.attachments) await removeAttachment(attachment.id);
            setSelectedCardId(null);
            setNewCardListId(null);
            setNewCardDraft(null);
          }}
        />
      )}

      {archiveOpen && (
        <ArchiveDialog
          archivedCards={archivedCards}
          archivedLists={archivedLists}
          onClose={() => setArchiveOpen(false)}
          onRestoreCard={(cardId) =>
            commit((current) => restoreCard(current, cardId), "Card restored from archive")
          }
          onRestoreList={(listId) =>
            commit(
              (current) => ({
                ...current,
                lists: current.lists.map((list) =>
                  list.id === listId ? { ...list, archived: false } : list,
                ),
              }),
              "Column restored from archive",
            )
          }
          onDeleteCard={(cardId) => {
            const card = findCardLocation(board, cardId)?.card;
            if (!window.confirm("Permanently delete this card and its data?")) return;
            commit((current) => ({
              ...current,
              lists: current.lists.map((list) => ({
                ...list,
                cards: list.cards.filter((item) => item.id !== cardId),
              })),
            }));
            card?.attachments.forEach((attachment) => void removeAttachment(attachment.id));
          }}
          onDeleteList={(listId) => {
            const list = board.lists.find((item) => item.id === listId);
            if (!list || !window.confirm(`Permanently delete “${list.title}” and its cards?`)) return;
            commit((current) => ({
              ...current,
              lists: current.lists.filter((item) => item.id !== listId),
            }));
          }}
        />
      )}

      {helpOpen && <HelpDialog onClose={() => setHelpOpen(false)} />}
      {archiveAnimation && (
        <ArchiveCardAnimation
          key={archiveAnimation.id}
          animation={archiveAnimation}
          cardLabels={board.labels}
          members={board.members}
          onComplete={() => finishArchiveAnimation(archiveAnimation.cardId)}
        />
      )}
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}

interface BoardColumnProps {
  list: BoardList;
  index: number;
  labels: BoardLabel[];
  members: BoardData["members"];
  disabled: boolean;
  editing: boolean;
  titleDraft: string;
  onTitleDraftChange(value: string): void;
  onStartRename(): void;
  onSaveRename(): void;
  onAddCard(): void;
  onOpenCard(cardId: string): void;
  landedCardId: string | null;
  archivingCardId: string | null;
  dropPreview?: { card: BoardCard; index: number };
  onArchive(cardId: string): void;
  onToggleCollapse(): void;
  onArchiveList(): void;
  onMoveList(direction: -1 | 1): void;
}

function BoardColumn({
  list,
  index,
  labels,
  members,
  disabled,
  editing,
  titleDraft,
  onTitleDraftChange,
  onStartRename,
  onSaveRename,
  onAddCard,
  onOpenCard,
  landedCardId,
  archivingCardId,
  dropPreview,
  onArchive,
  onToggleCollapse,
  onArchiveList,
  onMoveList,
}: BoardColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: list.id, disabled });
  const openCards = list.cards.filter((card) => !card.archived);
  const completedCount = openCards.filter((card) => card.completed).length;
  return (
    <section
      ref={setNodeRef}
      className={`board-column ${isOver ? "column-over" : ""} ${list.collapsed ? "column-collapsed" : ""}`}
      aria-label={`Column ${list.title}`}
    >
      <header className="column-header">
        <span className={`column-color color-${list.color}`} />
        <div className="column-title-area">
          {editing ? (
            <input
              autoFocus
              className="column-title-input"
              value={titleDraft}
              aria-label="Column name"
              onChange={(event) => onTitleDraftChange(event.target.value)}
              onBlur={onSaveRename}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
                if (event.key === "Escape") onSaveRename();
              }}
            />
          ) : (
            <button className="column-title" onClick={onStartRename} title="Rename column">
              {list.title}
            </button>
          )}
          <span className="column-count">{openCards.length}</span>
        </div>
        <div className="column-actions">
          <button
            className="column-action"
            title={list.collapsed ? "Expand column" : "Collapse column"}
            aria-label={list.collapsed ? "Expand column" : "Collapse column"}
            onClick={onToggleCollapse}
          >
            {list.collapsed ? <ChevronLeft size={16} /> : <ChevronDown size={16} />}
          </button>
          <details className="column-menu">
            <summary className="column-action" aria-label={`${list.title} options`}>
              <Ellipsis size={17} />
            </summary>
            <div className="menu-popover">
              <button onClick={onStartRename}>Rename</button>
              <button onClick={() => onMoveList(-1)} disabled={index === 0}>Move left</button>
              <button onClick={() => onMoveList(1)}>Move right</button>
              <button onClick={onArchiveList} className="menu-danger">Archive column</button>
            </div>
          </details>
        </div>
      </header>

      {!list.collapsed && (
        <>
          {completedCount > 0 && (
            <div className="column-progress" aria-label={`${completedCount} completed cards`}>
              <span style={{ width: `${(completedCount / Math.max(openCards.length, 1)) * 100}%` }} />
            </div>
          )}
          <SortableContext items={openCards.map((card) => card.id)} strategy={verticalListSortingStrategy}>
            <div className="card-list">
              {openCards.map((card, cardIndex) => (
                <Fragment key={card.id}>
                  {dropPreview?.index === cardIndex && (
                    <CardDropPreview card={dropPreview.card} labels={labels} members={members} />
                  )}
                  <SortableCard
                    card={card}
                    labels={labels}
                    members={members}
                    disabled={disabled}
                    landed={landedCardId === card.id}
                    archiving={archivingCardId === card.id}
                    onOpen={() => onOpenCard(card.id)}
                    onArchive={() => onArchive(card.id)}
                  />
                </Fragment>
              ))}
              {dropPreview && dropPreview.index >= openCards.length && (
                <CardDropPreview card={dropPreview.card} labels={labels} members={members} />
              )}
              {openCards.length === 0 && (
                <div className="empty-column">
                  <span className="empty-circle"><Plus size={16} /></span>
                  <span>{disabled ? "No matching cards" : "This column is empty"}</span>
                </div>
              )}
            </div>
          </SortableContext>
          <button className="add-card-button" onClick={onAddCard}>
            <Plus size={16} /> Add a card
          </button>
        </>
      )}
    </section>
  );
}

function CardDropPreview({
  card,
  labels,
  members,
}: {
  card: BoardCard;
  labels: BoardLabel[];
  members: BoardData["members"];
}) {
  return (
    <div className="card-drop-preview" aria-hidden="true">
      <CardFace card={card} labels={labels} members={members} onArchive={() => undefined} />
    </div>
  );
}

function ArchiveCardAnimation({
  animation,
  cardLabels,
  members,
  onComplete,
}: {
  animation: {
    card: BoardCard;
    rect: { left: number; top: number; width: number; height: number };
    particles: { x: number; y: number; rotation: number; scale: number; color: string; size: number }[];
  };
  cardLabels: BoardLabel[];
  members: BoardData["members"];
  onComplete(): void;
}) {
  const { rect, card, particles } = animation;
  return createPortal(
    <div
      className="archive-card-effect"
      style={{
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
      }}
      aria-hidden="true"
    >
      <div className="archive-vanishing-card">
        <CardFace card={card} labels={cardLabels} members={members} onArchive={() => undefined} />
      </div>
      <div className="archive-card-particles">
        {particles.map((particle, index) => (
          <i
            key={index}
            onAnimationEnd={index === particles.length - 1 ? onComplete : undefined}
            style={{
              width: particle.size,
              height: particle.size,
              backgroundColor: particle.color,
              "--particle-x": `${particle.x}px`,
              "--particle-y": `${particle.y}px`,
              "--particle-r": `${particle.rotation}deg`,
              "--particle-s": particle.scale,
            } as CSSProperties}
          />
        ))}
      </div>
    </div>,
    document.body,
  );
}

function ArchiveDropTarget({ active, burst }: { active: boolean; burst: number }) {
  const { setNodeRef, isOver } = useDroppable({ id: "archive-drop", disabled: !active });
  if ((!active && !burst) || typeof document === "undefined") return null;

  return createPortal((
    <div
      ref={setNodeRef}
      className={`archive-drop-target ${isOver ? "archive-drop-over" : ""} ${burst ? "archive-drop-burst" : ""}`}
      aria-label="Archive drop target"
      role="status"
    >
      {burst > 0 && (
        <span className="archive-particles" key={burst} aria-hidden="true">
          {Array.from({ length: 8 }, (_, index) => (
            <i key={index} />
          ))}
        </span>
      )}
      <Archive size={18} />
      <span>{isOver ? "Release to archive" : "Archive card"}</span>
    </div>
  ), document.body);
}

interface SortableCardProps {
  card: BoardCard;
  labels: BoardLabel[];
  members: BoardData["members"];
  disabled: boolean;
  landed: boolean;
  archiving: boolean;
  onOpen(): void;
  onArchive(): void;
}

function SortableCard(props: SortableCardProps) {
  const { card, disabled, landed, archiving, onOpen, onArchive } = props;
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: card.id, disabled });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  return (
    <article
      ref={setNodeRef}
      data-card-id={card.id}
      style={style}
      className={`sortable-card ${isDragging ? "is-dragging" : ""} ${landed ? "card-landed" : ""} ${archiving ? "card-archiving" : ""}`}
      {...attributes}
      {...listeners}
      onClick={onOpen}
    >
      <CardFace
        card={card}
        labels={props.labels}
        members={props.members}
        onArchive={onArchive}
      />
    </article>
  );
}

interface CardFaceProps {
  card: BoardCard;
  labels: BoardLabel[];
  members: BoardData["members"];
  onArchive(): void;
  dragging?: boolean;
}

function CardFace({ card, labels, members, onArchive, dragging }: CardFaceProps) {
  const cardLabels = card.labelIds
    .map((id) => labels.find((label) => label.id === id))
    .filter((label): label is BoardLabel => Boolean(label));
  const cardMembers = card.memberIds
    .map((id) => members.find((member) => member.id === id))
    .filter((member): member is BoardData["members"][number] => Boolean(member));
  const dueLabel = card.dueDate ? formatDate(card.dueDate) : "";
  const dueOver = overdue(card.dueDate) && !card.completed;

  return (
    <div className={`card-face ${dragging ? "drag-preview" : ""}`}>
      {cardLabels.length > 0 && (
        <div className="card-labels">
          {cardLabels.map((label) => (
            <span key={label.id} className={`card-label label-${label.color}`}>
              {label.name}
            </span>
          ))}
        </div>
      )}
      <div className="card-title-row">
        <h3 className={card.completed ? "completed-title" : ""}>{card.title || "New card"}</h3>
        <button
          className="card-quick-archive"
          aria-label={`Archive ${card.title}`}
          title="Archive"
          onClick={(event) => {
            event.stopPropagation();
            onArchive();
          }}
        >
          <Archive size={14} />
        </button>
      </div>
      <div className="card-meta">
        {card.completed && <span className="meta-chip completed-chip"><CheckCircle2 size={13} /> Complete</span>}
        {dueLabel && (
          <span className={`meta-chip due-chip ${dueOver ? "overdue-chip" : ""}`}>
            <CalendarDays size={13} /> {dueLabel}
          </span>
        )}
        {card.checklist.length > 0 && (
          <span className="meta-chip"><Check size={13} /> {card.checklist.filter((item) => item.completed).length}/{card.checklist.length}</span>
        )}
        {card.description && <AlignLeft size={14} className="meta-icon" aria-label="Has a description" />}
        {card.comments.length > 0 && <span className="meta-chip"><MessageCircle size={13} /> {card.comments.length}</span>}
        {card.attachments.length > 0 && <span className="meta-chip"><Paperclip size={13} /> {card.attachments.length}</span>}
        <span className="meta-spacer" />
        {cardMembers.map((member) => (
          <span
            key={member.id}
            className="avatar avatar-card"
            style={{ backgroundColor: member.color }}
            title={member.name}
          >
            {member.initials}
          </span>
        ))}
      </div>
    </div>
  );
}

interface CardDialogProps {
  card: BoardCard;
  list?: BoardList;
  board: BoardData;
  isNew: boolean;
  onClose(): void;
  onSave(card: BoardCard, listId: string): void;
  onDelete(card: BoardCard): void;
}

function CardDialog({ card, list, board, isNew, onClose, onSave, onDelete }: CardDialogProps) {
  const [draft, setDraft] = useState<BoardCard>(() => structuredClone(card));
  const [listId, setListId] = useState(list?.id ?? board.lists[0]?.id ?? "");
  const [checkDraft, setCheckDraft] = useState("");
  const [commentDraft, setCommentDraft] = useState("");
  const [fileBusy, setFileBusy] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  function update(patch: Partial<BoardCard>) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  function addChecklistItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = checkDraft.trim();
    if (!title) return;
    const item: ChecklistItem = { id: makeId("check"), title, completed: false };
    update({ checklist: [...draft.checklist, item] });
    setCheckDraft("");
  }

  function addComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = commentDraft.trim();
    if (!text) return;
    update({
      comments: [
        ...draft.comments,
        { id: makeId("comment"), text, createdAt: new Date().toISOString() },
      ],
    });
    setCommentDraft("");
  }

  async function addFile(file?: File) {
    if (!file) return;
    setFileBusy(true);
    const id = makeId("attachment");
    try {
      await saveAttachment(id, file);
      const attachment: CardAttachment = {
        id,
        name: file.name,
        size: file.size,
        type: file.type,
      };
      update({ attachments: [...draft.attachments, attachment] });
    } catch {
      window.alert("Could not save this file in the browser.");
    } finally {
      setFileBusy(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function downloadFile(attachment: CardAttachment) {
    const blob = await getAttachment(attachment.id);
    if (!blob) {
      window.alert("File not found in local storage.");
      return;
    }
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = attachment.name;
    link.click();
    URL.revokeObjectURL(url);
  }

  function toggleLabel(labelId: string) {
    const labelIds = draft.labelIds.includes(labelId)
      ? draft.labelIds.filter((id) => id !== labelId)
      : [...draft.labelIds, labelId];
    update({ labelIds });
  }

  function toggleMember(memberId: string) {
    const memberIds = draft.memberIds.includes(memberId)
      ? draft.memberIds.filter((id) => id !== memberId)
      : [...draft.memberIds, memberId];
    update({ memberIds });
  }

  function closeOnEscape(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.stopPropagation();
      onClose();
    }
  }

  return (
    <div className="dialog-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section
        className="card-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="card-dialog-title"
        onKeyDown={closeOnEscape}
      >
        <header className="dialog-header">
          <span className="dialog-kicker">{isNew ? "New card" : "Card details"}</span>
          <div className="dialog-header-actions">
            {!isNew && (
              <button className="icon-button" aria-label="Delete card permanently" title="Delete permanently" onClick={() => onDelete(draft)}>
                <Trash2 size={17} />
              </button>
            )}
            <button className="icon-button" aria-label="Close" onClick={onClose}><X size={18} /></button>
          </div>
        </header>
        <div className="card-edit-form">
          <div className="dialog-main">
            <label className="field-label" htmlFor="card-title">Card title</label>
            <input
              ref={titleRef}
              id="card-title"
              className="card-title-input"
              value={draft.title}
              onChange={(event) => update({ title: event.target.value })}
              placeholder="Give this card a title"
              maxLength={160}
              required
            />
            <label className="field-label" htmlFor="card-description">Description</label>
            <textarea
              id="card-description"
              className="card-description-input"
              value={draft.description}
              onChange={(event) => update({ description: event.target.value })}
              placeholder="Add context, links, or useful details…"
              rows={4}
            />
            <div className="section-heading">
              <span><CheckCircle2 size={16} /> Checklist</span>
              {draft.checklist.length > 0 && (
                <span>{draft.checklist.filter((item) => item.completed).length} of {draft.checklist.length}</span>
              )}
            </div>
            {draft.checklist.length > 0 && (
              <div className="checklist-items">
                {draft.checklist.map((item) => (
                  <label className="checklist-item" key={item.id}>
                    <input
                      type="checkbox"
                      checked={item.completed}
                      onChange={() =>
                        update({
                          checklist: draft.checklist.map((entry) =>
                            entry.id === item.id ? { ...entry, completed: !entry.completed } : entry,
                          ),
                        })
                      }
                    />
                    <span className={item.completed ? "check-complete" : ""}>{item.title}</span>
                    <button
                      type="button"
                      className="text-icon-button"
                      aria-label={`Remove ${item.title}`}
                      onClick={() => update({ checklist: draft.checklist.filter((entry) => entry.id !== item.id) })}
                    >
                      <X size={14} />
                    </button>
                  </label>
                ))}
              </div>
            )}
            <form className="inline-add-form" onSubmit={addChecklistItem}>
              <input
                value={checkDraft}
                onChange={(event) => setCheckDraft(event.target.value)}
                placeholder="Add a checklist item"
                aria-label="New checklist item"
              />
              <button type="submit" className="icon-button" aria-label="Add item"><Plus size={16} /></button>
            </form>

            <div className="section-heading comments-heading"><span><MessageCircle size={16} /> Comments</span></div>
            {draft.comments.length > 0 ? (
              <div className="comment-list">
                {draft.comments.map((comment) => (
                  <article className="comment-item" key={comment.id}>
                    <span className="local-avatar comment-avatar">C</span>
                    <div><p>{comment.text}</p><time>{formatDate(comment.createdAt.slice(0, 10))}</time></div>
                  </article>
                ))}
              </div>
            ) : (
              <p className="quiet-note">Comments on this card are saved in this browser only.</p>
            )}
            <form className="comment-form" onSubmit={addComment}>
              <textarea
                value={commentDraft}
                onChange={(event) => setCommentDraft(event.target.value)}
                placeholder="Write a comment…"
                aria-label="New comment"
                rows={2}
              />
              <button className="button button-primary button-small" disabled={!commentDraft.trim()}>
                Add comment
              </button>
            </form>
          </div>

          <aside className="dialog-sidebar">
            <label className="field-label" htmlFor="card-list">Column</label>
            <select id="card-list" className="field-select" value={listId} onChange={(event) => setListId(event.target.value)}>
              {board.lists.filter((item) => !item.archived).map((item) => (
                <option key={item.id} value={item.id}>{item.title}</option>
              ))}
            </select>
            <label className="completion-control">
              <input
                type="checkbox"
                checked={draft.completed}
                onChange={(event) => update({ completed: event.target.checked })}
              />
              <span><Check size={14} /></span>
              Complete
            </label>
            <label className="field-label" htmlFor="card-due">Due date</label>
            <div className="date-field">
              <CalendarDays size={15} />
              <input
                id="card-due"
                type="date"
                value={draft.dueDate ?? ""}
                onChange={(event) => update({ dueDate: event.target.value || undefined })}
              />
            </div>
            <div className="section-heading sidebar-heading"><span>Labels</span></div>
            <div className="label-picker">
              {board.labels.map((label) => (
                <button
                  type="button"
                  key={label.id}
                  className={`label-option label-${label.color} ${draft.labelIds.includes(label.id) ? "label-chosen" : ""}`}
                  onClick={() => toggleLabel(label.id)}
                >
                  {draft.labelIds.includes(label.id) ? <Check size={12} /> : <span className="label-option-dot" />}
                  {label.name}
                </button>
              ))}
            </div>
            <div className="section-heading sidebar-heading"><span>Sample members</span></div>
            <div className="member-picker">
              {board.members.map((member) => (
                <label key={member.id} className="member-option">
                  <input
                    type="checkbox"
                    checked={draft.memberIds.includes(member.id)}
                    onChange={() => toggleMember(member.id)}
                  />
                  <span className="avatar" style={{ backgroundColor: member.color }}>{member.initials}</span>
                  <span>{member.name}</span>
                </label>
              ))}
              <small>These are sample members. Online invitations are unavailable.</small>
            </div>
            <div className="section-heading sidebar-heading"><span>Attachments</span></div>
            <div className="attachment-list">
              {draft.attachments.map((attachment) => (
                <div className="attachment-item" key={attachment.id}>
                  <Paperclip size={14} />
                  <span title={attachment.name}>{attachment.name}</span>
                  <button type="button" className="text-icon-button" aria-label={`Download ${attachment.name}`} onClick={() => downloadFile(attachment)}>
                    <ArrowDownToLine size={14} />
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="attachment-add"
                onClick={() => fileInput.current?.click()}
                disabled={fileBusy}
              >
                <Plus size={14} /> {fileBusy ? "Saving…" : "Add file"}
              </button>
              <input ref={fileInput} className="visually-hidden" type="file" onChange={(event) => addFile(event.target.files?.[0])} />
            </div>
          </aside>
          <footer className="dialog-footer">
            {!isNew && <span>ID: {draft.id.slice(0, 12)}</span>}
            <button type="button" className="button button-outline" onClick={onClose}>Cancel</button>
            <button
              type="button"
              className="button button-primary"
              disabled={!draft.title.trim()}
              onClick={() => onSave({ ...draft, title: draft.title.trim() }, listId)}
            >
              Save card
            </button>
          </footer>
        </div>
      </section>
    </div>
  );
}

interface BoardTableProps {
  lists: BoardList[];
  labels: BoardLabel[];
  onOpenCard(cardId: string): void;
}

function BoardTable({ lists, labels, onOpenCard }: BoardTableProps) {
  const cards = lists.flatMap((list) =>
    list.cards.filter((card) => !card.archived).map((card) => ({ card, list })),
  );
  return (
    <div className="table-view">
      <div className="table-view-header">
        <div><Table2 size={18} /><h2>All cards</h2></div>
        <span>{cards.length} cards</span>
      </div>
      <div className="table-scroll">
        <table>
          <thead><tr><th>Title</th><th>Column</th><th>Labels</th><th>Due date</th><th>Status</th></tr></thead>
          <tbody>
            {cards.map(({ card, list }) => (
              <tr key={card.id} onClick={() => onOpenCard(card.id)} tabIndex={0} onKeyDown={(event) => event.key === "Enter" && onOpenCard(card.id)}>
                <td>{card.completed && <CheckCircle2 size={15} className="table-complete" />} {card.title}</td>
                <td><span className="table-list-dot" />{list.title}</td>
                <td><div className="table-labels">{card.labelIds.map((id) => labels.find((label) => label.id === id)).filter((label): label is BoardLabel => Boolean(label)).map((label) => <span className={`card-label label-${label.color}`} key={label.id}>{label.name}</span>)}</div></td>
                <td className={overdue(card.dueDate) && !card.completed ? "table-overdue" : ""}>{formatDate(card.dueDate) || "—"}</td>
                <td>{card.completed ? "Complete" : "In progress"}</td>
              </tr>
            ))}
            {cards.length === 0 && <tr><td colSpan={5} className="table-empty">No cards to show.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BoardCalendar({ lists, labels, onOpenCard }: BoardTableProps) {
  const cards = lists.flatMap((list) =>
    list.cards
      .filter((card) => !card.archived && card.dueDate)
      .map((card) => ({ card, list })),
  ).sort((a, b) => (a.card.dueDate ?? "").localeCompare(b.card.dueDate ?? ""));
  return (
    <div className="calendar-view">
      <div className="table-view-header">
        <div><CalendarDays size={18} /><h2>Card due dates</h2></div>
        <span>Sorted by date</span>
      </div>
      {cards.length > 0 ? (
        <div className="calendar-list">
          {cards.map(({ card, list }) => (
            <button className="calendar-card" key={card.id} onClick={() => onOpenCard(card.id)}>
              <span className={`calendar-date ${overdue(card.dueDate) && !card.completed ? "calendar-date-overdue" : ""}`}>
                <strong>{formatDate(card.dueDate)}</strong>
                <small>{card.completed ? "Completed" : overdue(card.dueDate) ? "Overdue" : "Upcoming"}</small>
              </span>
              <span className="calendar-card-body">
                <strong>{card.title}</strong>
                <small>{list.title}</small>
              </span>
              <span className="table-labels">{card.labelIds.map((id) => labels.find((label) => label.id === id)).filter((label): label is BoardLabel => Boolean(label)).map((label) => <span className={`card-label label-${label.color}`} key={label.id}>{label.name}</span>)}</span>
              <ChevronDown size={16} className="muted-icon calendar-chevron" />
            </button>
          ))}
        </div>
      ) : (
        <div className="calendar-empty"><CalendarDays size={24} /><strong>No due dates yet</strong><span>Add a due date to a card to see it here.</span></div>
      )}
    </div>
  );
}

interface ArchiveDialogProps {
  archivedCards: { card: BoardCard; list: BoardList }[];
  archivedLists: BoardList[];
  onClose(): void;
  onRestoreCard(cardId: string): void;
  onRestoreList(listId: string): void;
  onDeleteCard(cardId: string): void;
  onDeleteList(listId: string): void;
}

function ArchiveDialog({
  archivedCards,
  archivedLists,
  onClose,
  onRestoreCard,
  onRestoreList,
  onDeleteCard,
  onDeleteList,
}: ArchiveDialogProps) {
  return (
    <div className="dialog-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="archive-dialog" role="dialog" aria-modal="true" aria-labelledby="archive-title">
        <header className="dialog-header">
          <div><span className="dialog-kicker">Archived items</span><h2 id="archive-title">Board archive</h2></div>
          <button className="icon-button" aria-label="Close" onClick={onClose}><X size={18} /></button>
        </header>
        <div className="archive-content">
          <h3>Archived columns</h3>
          {archivedLists.length === 0 && <p className="quiet-note">No archived columns.</p>}
          {archivedLists.map((list) => (
            <div className="archive-row" key={list.id}>
              <span><span className={`column-color color-${list.color}`} />{list.title} <small>{list.cards.length} cards</small></span>
              <div>
                <button className="text-button" onClick={() => onRestoreList(list.id)}>Restore</button>
                <button className="text-button danger-text" onClick={() => onDeleteList(list.id)}>Delete permanently</button>
              </div>
            </div>
          ))}
          <h3>Archived cards</h3>
          {archivedCards.length === 0 && <p className="quiet-note">No archived cards.</p>}
          {archivedCards.map(({ card, list }) => (
            <div className="archive-row" key={card.id}>
              <span><strong>{card.title}</strong><small>In {list.title}</small></span>
              <div>
                <button className="text-button" onClick={() => onRestoreCard(card.id)}>Restore</button>
                <button className="text-button danger-text" onClick={() => onDeleteCard(card.id)}>Delete permanently</button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function HelpDialog({ onClose }: { onClose(): void }) {
  return (
    <div className="dialog-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="help-dialog" role="dialog" aria-modal="true" aria-labelledby="help-title">
        <header className="dialog-header">
          <div><span className="dialog-kicker">Quick guide</span><h2 id="help-title">Using your board</h2></div>
          <button className="icon-button" aria-label="Close" onClick={onClose}><X size={18} /></button>
        </header>
        <div className="shortcut-list">
          <p><kbd>N</kbd><span>Create a card in the first column</span></p>
          <p><kbd>Z</kbd><span>Undo the last change</span></p>
          <p><kbd>?</kbd><span>Open this guide</span></p>
          <p><kbd>Esc</kbd><span>Close the open dialog</span></p>
          <p><kbd>Space</kbd><span>Pick up a focused card for keyboard movement</span></p>
        </div>
        <p className="prototype-note">This demo stores data in this browser only. Online collaboration, invitations, and external notifications are unavailable.</p>
        <button className="button button-primary" onClick={onClose}>Got it</button>
      </section>
    </div>
  );
}
