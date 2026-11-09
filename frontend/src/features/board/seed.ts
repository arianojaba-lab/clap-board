import type { BoardCard, BoardData, BoardList, LabelColor } from "./types";

const day = 24 * 60 * 60 * 1000;

function dateOffset(offset: number): string {
  return new Date(Date.now() + offset * day).toISOString().slice(0, 10);
}

const labels = [
  { id: "design", name: "Design", color: "lilac" },
  { id: "product", name: "Product", color: "mint" },
  { id: "urgent", name: "Priority", color: "peach" },
  { id: "research", name: "Research", color: "blue" },
  { id: "content", name: "Content", color: "yellow" },
] as const;

const members = [
  { id: "m-aria", name: "Alex Morgan", initials: "AM", color: "#7b93c4" },
  { id: "m-nika", name: "Taylor Reed", initials: "TR", color: "#d98a77" },
  { id: "m-sina", name: "Jordan Lee", initials: "JL", color: "#8ba994" },
  { id: "m-roya", name: "Casey Park", initials: "CP", color: "#bc9ccc" },
];

const titles = [
  [
    "Redesign the welcome experience",
    "Review the sign-up journey",
    "Explore ideas for the home page",
    "Research accessible patterns",
  ],
  [
    "Define MVP success metrics",
    "Write the product voice guide",
    "Prioritize the quarterly roadmap",
    "Prepare the launch plan",
  ],
  [
    "Build the core components",
    "Design the create-card flow",
    "Implement the mobile layout",
    "Review color contrast",
  ],
  [
    "Proofread the final copy",
    "Test the prototype with users",
    "Finish the product page",
    "Review interaction details",
  ],
  [
    "Ship the first release",
    "Summarize early feedback",
    "Update the documentation",
    "Plan the next iteration",
  ],
];

const descriptions = [
  "Create a clear, welcoming experience that makes the next step obvious.",
  "Use a few real examples to find what makes the biggest difference day to day.",
  "Keep the first release focused and refine the details with user feedback.",
  "",
];

const colorOrder: LabelColor[] = ["lilac", "mint", "peach", "blue", "yellow"];
const listNames = ["Ideas", "To do", "In progress", "Review", "Done"];

function makeCard(listIndex: number, cardIndex: number, title: string): BoardCard {
  const index = listIndex * 4 + cardIndex;
  const card: BoardCard = {
    id: `card-${index + 1}`,
    title,
    description: descriptions[index % descriptions.length],
    labelIds: index % 4 === 0 ? [] : [labels[index % labels.length].id],
    memberIds: index % 3 === 0 ? [members[index % members.length].id] : [],
    completed: listIndex === 4 && cardIndex === 0,
    archived: false,
    checklist:
      index === 8
        ? [
            { id: "check-1", title: "Build the first draft", completed: true },
            { id: "check-2", title: "Review with the team", completed: false },
            { id: "check-3", title: "Apply feedback", completed: false },
          ]
        : [],
    comments: [],
    attachments: [],
    createdAt: new Date(Date.now() - index * day).toISOString(),
    updatedAt: new Date().toISOString(),
  };

  if (index === 0) card.dueDate = dateOffset(-2);
  if (index === 10) card.dueDate = dateOffset(1);
  if (index === 18) card.dueDate = dateOffset(7);
  return card;
}

export function createSeedBoard(): BoardData {
  const lists: BoardList[] = titles.map((listTitles, listIndex) => ({
    id: `list-${listIndex + 1}`,
    title: listNames[listIndex],
    color: colorOrder[listIndex],
    cards: listTitles.map((title, cardIndex) =>
      makeCard(listIndex, cardIndex, title),
    ),
    archived: false,
    collapsed: false,
  }));

  return {
    schemaVersion: 1,
    id: "local-board",
    title: "Clap Board",
    description: "A calm space to plan, organize, and move work forward.",
    background: "#f5f5f7",
    lists,
    labels: [...labels],
    members: [...members],
    activity: [
      {
        id: "activity-seed",
        message: "Your sample board is ready",
        createdAt: new Date().toISOString(),
      },
    ],
    updatedAt: new Date().toISOString(),
  };
}

export const seedBoard = createSeedBoard;
