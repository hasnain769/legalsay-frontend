// Simple singleton store for the MVP to pass the file between pages
// In a real app, use Context or Redux or Zustand
export const fileStore = {
    file: null as File | null,
    jurisdiction: "United States (General)" as string,
    negotiationList: [] as { text: string, type: string }[]
};
