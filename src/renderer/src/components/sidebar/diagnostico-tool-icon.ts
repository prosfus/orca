import {
  Terminal,
  FileText,
  Search,
  FolderSearch,
  Globe,
  FilePen,
  ListTodo,
  Wrench,
  type LucideIcon
} from 'lucide-react'

// Map an agent tool name to a lucide icon for the activity timeline.
const TOOL_ICONS: Record<string, LucideIcon> = {
  Bash: Terminal,
  Read: FileText,
  Grep: Search,
  Glob: FolderSearch,
  WebFetch: Globe,
  WebSearch: Globe,
  Edit: FilePen,
  Write: FilePen,
  TodoWrite: ListTodo
}

export function toolIcon(tool: string): LucideIcon {
  return TOOL_ICONS[tool] ?? Wrench
}
