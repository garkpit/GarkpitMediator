import { Command, createMediator, LoggingBehavior, MutexBehavior } from '@garkpit/mediator';

// A feature is a class with a name that says what happens.
class RenameNote extends Command<Note> {
  constructor(readonly id: string, readonly title: string) {
    super();
  }
  // One rename per note at a time. No locking code anywhere else.
  mutexKey() {
    return `note:${this.id}`;
  }
}

// It has exactly one handler.
class RenameNoteHandler {
  async handle(command: RenameNote): Promise<Note> {
    return notes.rename(command.id, command.title);
  }
}

const mediator = createMediator({ behaviors: [new MutexBehavior(), new LoggingBehavior()] });
mediator.register(RenameNote, new RenameNoteHandler());

// A page, a test, a job or an AI agent: everyone comes in through the same door.
const note = await mediator.send(new RenameNote('n1', 'Weekly shop'), { actor: 'priya' });
