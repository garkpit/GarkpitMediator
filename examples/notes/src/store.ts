// The example's "database": notes in memory. Every method is async, as a real store's would be.

export interface Note {
  id: string;
  title: string;
  body: string;
  updatedAt: string;
}

export class NotesStore {
  private readonly notes = new Map<string, Note>();
  private nextId = 1;

  async insert(title: string, body: string): Promise<Note> {
    const note: Note = { id: `n${this.nextId++}`, title, body, updatedAt: new Date().toISOString() };
    this.notes.set(note.id, note);
    return note;
  }

  async find(id: string): Promise<Note | undefined> {
    return this.notes.get(id);
  }

  async all(): Promise<Note[]> {
    return [...this.notes.values()];
  }

  async update(id: string, changes: Partial<Pick<Note, 'title' | 'body'>>): Promise<Note | undefined> {
    // A pause where a real database round trip would be, so two renames of one note can overlap.
    await new Promise((resolve) => setTimeout(resolve, 5));
    const note = this.notes.get(id);
    if (!note) return undefined;
    const updated: Note = { ...note, ...changes, updatedAt: new Date().toISOString() };
    this.notes.set(id, updated);
    return updated;
  }
}
