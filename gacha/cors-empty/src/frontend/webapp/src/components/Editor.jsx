import React from 'react'
import SimpleEditor from 'react-simple-code-editor'
import Prism from 'prismjs'
import 'prismjs/components/prism-markup'
import 'prismjs/components/prism-css'
import 'prismjs/components/prism-javascript'
import 'prismjs/themes/prism-tomorrow.css'

export default function Editor({ code, onChange }) {
  return (
    <div className="editor-shell">
      <SimpleEditor
        value={code}
        onValueChange={onChange}
        highlight={(text) => Prism.highlight(text, Prism.languages.markup, 'markup')}
        padding={14}
        style={{
          fontFamily: '"Fira Code", "Source Code Pro", monospace',
          fontSize: 14,
          minHeight: 220,
        }}
        textareaId="code-editor"
        className="editor"
      />
    </div>
  )
}
