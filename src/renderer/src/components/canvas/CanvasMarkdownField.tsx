// Rich description editor for a Canvas task. Editing keeps the raw markdown source in a Write
// tab and renders it (via the shared, sanitized CommentMarkdown) in a Preview tab; read-only
// workspaces just show the rendered markdown. The body is stored verbatim as the task's markdown.

import { useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import CommentMarkdown from '../sidebar/CommentMarkdown'

type Props = {
  value: string
  editable: boolean
  onChange: (next: string) => void
}

const EMPTY_PREVIEW = '_No description yet._'

function Rendered({ value }: { value: string }) {
  return (
    <div className="scrollbar-sleek max-h-72 overflow-y-auto rounded-md border bg-muted/20 px-3 py-2">
      <CommentMarkdown variant="document" content={value.trim() || EMPTY_PREVIEW} />
    </div>
  )
}

export function CanvasMarkdownField({ value, editable, onChange }: Props) {
  const [tab, setTab] = useState<'write' | 'preview'>('write')

  if (!editable) {
    return <Rendered value={value} />
  }

  return (
    <Tabs value={tab} onValueChange={(next) => setTab(next as 'write' | 'preview')}>
      <TabsList variant="line" className="h-7">
        <TabsTrigger value="write">Write</TabsTrigger>
        <TabsTrigger value="preview">Preview</TabsTrigger>
      </TabsList>
      <TabsContent value="write">
        <Textarea
          value={value}
          rows={6}
          placeholder="Describe the task. Markdown supported."
          className="font-mono text-[13px]"
          onChange={(event) => onChange(event.target.value)}
        />
      </TabsContent>
      <TabsContent value="preview">
        <Rendered value={value} />
      </TabsContent>
    </Tabs>
  )
}
