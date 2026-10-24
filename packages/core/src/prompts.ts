import fs from 'node:fs';
import path from 'node:path';
const dir = path.join(import.meta.dirname, 'prompts');
export const prompt = (name: 'reader' | 'deadlineHawk' | 'auditor' | 'ghostwriter' | 'boss') => fs.readFileSync(path.join(dir, `${name}.md`), 'utf8');
