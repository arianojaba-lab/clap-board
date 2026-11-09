import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import { createSeedBoard } from "./seed";
import type { BoardCard, BoardData } from "./types";

interface KanbanDatabase extends DBSchema {
  board: {
    key: string;
    value: BoardData;
  };
  attachments: {
    key: string;
    value: Blob;
  };
}

let database: Promise<IDBPDatabase<KanbanDatabase>> | undefined;

function getDatabase() {
  if (typeof indexedDB === "undefined") {
    throw new Error("Local storage is only available in a browser.");
  }
  return (database ??= openDB<KanbanDatabase>("kanban-local", 1, {
    upgrade(db) {
      db.createObjectStore("board");
      db.createObjectStore("attachments");
    },
  }));
}

function migrateLegacySample(board: BoardData): BoardData {
  if (board.title !== "استودیو محصول") return board;

  const sample = createSeedBoard();
  const oldCardTitles = [
    "بازطراحی تجربهٔ خوش‌آمدگویی",
    "بررسی مسیر ثبت‌نام کاربران",
    "ایده‌های بهبود صفحهٔ خانه",
    "تحقیق دربارهٔ الگوهای دسترس‌پذیری",
    "تعریف شاخص‌های نسخهٔ اولیه",
    "نوشتن راهنمای لحن محصول",
    "مرتب‌سازی اولویت‌های سه‌ماهه",
    "آماده‌سازی نقشهٔ انتشار",
    "ساخت کامپوننت‌های پایه",
    "طراحی جریان ایجاد کارت",
    "پیاده‌سازی حالت موبایل",
    "بررسی کنتراست رنگ‌ها",
    "بازبینی نهایی متن‌ها",
    "آزمون کاربری پروتوتایپ",
    "تکمیل صفحهٔ معرفی",
    "مرور جزئیات تعاملی",
    "انتشار نسخهٔ نخست",
    "جمع‌بندی بازخوردها",
    "به‌روزرسانی مستندات",
    "برنامه‌ریزی گام بعدی",
  ];
  const sampleCards = new Map(
    sample.lists.flatMap((list) => list.cards.map((card) => [card.id, card] as const)),
  );
  const oldTitles = new Map(oldCardTitles.map((title, index) => [`card-${index + 1}`, title]));
  const oldListNames = new Map([
    ["list-1", "ایده‌ها"],
    ["list-2", "برای انجام"],
    ["list-3", "در حال انجام"],
    ["list-4", "بازبینی"],
    ["list-5", "انجام‌شده"],
  ]);
  const oldLabelNames = new Map([
    ["design", "طراحی"],
    ["product", "محصول"],
    ["urgent", "فوری"],
    ["research", "پژوهش"],
    ["content", "محتوا"],
  ]);
  const oldMemberNames = new Map([
    ["m-aria", "آریا رضایی"],
    ["m-nika", "نیکا احمدی"],
    ["m-sina", "سینا مرادی"],
    ["m-roya", "رویا کریمی"],
  ]);
  const oldBoardDescription = "فضایی آرام برای ایده‌ها، برنامه‌ریزی و پیش‌برد کارها.";
  const englishLabels = new Map(sample.labels.map((label) => [label.id, label.name]));
  const englishMembers = new Map(sample.members.map((member) => [member.id, member]));
  const oldDescriptions = [
    "یک تجربهٔ ساده و خوشایند بسازیم که بدون توضیح اضافه، مسیر بعدی را نشان بدهد.",
    "با چند نمونهٔ واقعی بررسی کنیم کدام بخش‌ها بیشترین اثر را روی تجربهٔ روزمره دارند.",
    "نسخهٔ اولیه را سبک نگه داریم و جزئیات مهم را با بازخورد کاربران کامل کنیم.",
  ];

  return {
    ...board,
    title: sample.title,
    description:
      board.description === oldBoardDescription ? sample.description : board.description,
    background: board.background === "#edf3ef" ? sample.background : board.background,
    labels: board.labels.map((label) =>
      oldLabelNames.get(label.id) === label.name
        ? { ...label, name: englishLabels.get(label.id) ?? label.name }
        : label,
    ),
    members: board.members.map((member) =>
      oldMemberNames.get(member.id) === member.name
        ? {
            ...member,
            name: englishMembers.get(member.id)?.name ?? member.name,
            initials: englishMembers.get(member.id)?.initials ?? member.initials,
          }
        : member,
    ),
    activity: board.activity.map((item) =>
      item.id === "activity-seed"
        ? { ...item, message: "Your sample board is ready" }
        : item,
    ),
    lists: board.lists.map((list) => ({
      ...list,
      title: oldListNames.get(list.id) === list.title
          ? sample.lists.find((sampleList) => sampleList.id === list.id)?.title ?? list.title
          : list.title,
      cards: list.cards.map((card): BoardCard => {
        const englishCard = sampleCards.get(card.id);
        const isOldSample = oldTitles.get(card.id) === card.title;
        if (!englishCard || !isOldSample) return card;
        return {
          ...card,
          title: englishCard.title,
          description: oldDescriptions.includes(card.description)
            ? englishCard.description
            : card.description,
          checklist:
            card.checklist.some((item) => /[\u0600-\u06FF]/.test(item.title))
              ? englishCard.checklist
              : card.checklist,
        };
      }),
    })),
    updatedAt: new Date().toISOString(),
  };
}

export async function loadBoard(): Promise<BoardData> {
  const db = await getDatabase();
  const saved = await db.get("board", "main");
  if (!saved) return createSeedBoard();
  const migrated = migrateLegacySample(saved);
  if (migrated !== saved) await db.put("board", migrated, "main");
  return migrated;
}

export async function saveBoard(board: BoardData): Promise<void> {
  const db = await getDatabase();
  await db.put("board", board, "main");
}

export async function saveAttachment(id: string, file: Blob): Promise<void> {
  const db = await getDatabase();
  await db.put("attachments", file, id);
}

export async function getAttachment(id: string): Promise<Blob | undefined> {
  const db = await getDatabase();
  return db.get("attachments", id);
}

export async function deleteAttachment(id: string): Promise<void> {
  const db = await getDatabase();
  await db.delete("attachments", id);
}

export async function resetLocalBoard(): Promise<BoardData> {
  const board = createSeedBoard();
  await saveBoard(board);
  return board;
}
