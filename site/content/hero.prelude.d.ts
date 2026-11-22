// Names the landing page's code sample uses but does not define, so the sample still type-checks.
interface Note {
  id: string;
  title: string;
}
declare const notes: { rename(id: string, title: string): Promise<Note> };
