import path from 'node:path';
import { dataPaths, type FileKind } from '@sloth/shared';
import { log } from '../events.ts';
import type { SlothContext } from '../context.ts';

export interface ScoutedFile { file_id: string; path: string; name: string; kind: FileKind }

/** Scout: rule-based. Finds new inbox files (via the official filesystem MCP server + docs server) and registers them. */
export async function scout(ctx: SlothContext): Promise<ScoutedFile[]> {
  log('scout', 'sniffing around the inbox…', undefined, 'agent.start');
  if (ctx.hub.tools.has('fs_list_directory')) {
    const listing = await ctx.hub.call<string>('fs_list_directory', { path: dataPaths().inbox });
    const n = String(listing).split('\n').filter((l) => l.startsWith('[FILE]')).length;
    log('scout', `filesystem MCP sees ${n} file(s) in the inbox`);
  }
  const files = await ctx.hub.call<{ path: string; name: string; sha256: string }[]>('docs_scan_inbox');
  const fresh: ScoutedFile[] = [];
  for (const f of files) {
    const { kind } = await ctx.hub.call<{ kind: FileKind }>('docs_classify', { path: f.path });
    const reg = await ctx.hub.call<{ file_id: string; already_seen: boolean }>('ledger_register_file', { path: f.path, sha256: f.sha256, kind });
    if (reg.already_seen) continue;
    if (kind === 'unknown') {
      await ctx.hub.call('ledger_mark_file', { file_id: reg.file_id, status: 'skipped', error: 'unsupported file type' });
      log('scout', `skipping ${path.basename(f.path)} (unsupported type)`);
      continue;
    }
    fresh.push({ file_id: reg.file_id, path: f.path, name: f.name, kind });
  }
  log('scout', `found ${fresh.length} new file(s) (${files.length - fresh.length} already known)`, { count: fresh.length }, 'agent.end');
  return fresh;
}
